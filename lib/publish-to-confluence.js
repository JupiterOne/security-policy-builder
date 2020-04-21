"use strict";

const { prompt } = require("inquirer");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const showdown = require("showdown");
const error = require("../lib/error");

const converter = new showdown.Converter({
  parseImgDimensions: true,
  simplifiedAutoLink: true,
  tables: true,
});

const CONFLUENCE_PAGES = "./confluence-pages.json";

const CONFLUENCE_DOMAIN = process.env.CONFLUENCE_DOMAIN;
const CONFLUENCE_SPACE = process.env.CONFLUENCE_SPACE;
const CONFLUENCE_USER = process.env.CONFLUENCE_USER;
const CONFLUENCE_PASS = process.env.CONFLUENCE_PASS;

async function gatherCreds() {
  const answer = await prompt([
    {
      type: "input",
      name: "domain",
      message: "Confluence domain (the vanity subdomain before '.atlassian.net'):",
    },
    {
      type: "input",
      name: "space",
      message: "Confluence space key:",
    },
    {
      type: "input",
      name: "username",
      message: "Confluence username:",
    },
    {
      type: "password",
      name: "password",
      message: "Confluence password:",
    },
  ]);
  return {
    domain: answer.domain,
    space: answer.space,
    username: answer.username,
    password: answer.password,
  };
}

function parseLinks(pageUrl, html, confluencePages) {
  const linkRegex = /href=['"]([\w-]+\.md)(#.*)?['"]/gm;
  const match = linkRegex.exec(html);

  return match
    ? html.replace(linkRegex, `href="${pageUrl}/${confluencePages[match[1]]}"`)
    : html;
}

async function getVersion(headers, page) {
  const options = {
    method: "get",
    headers,
  };

  const response = await fetch(page, options);
  const result = await response.json();
  return result.version.number;
}

async function publish() {
  const docsPath = path.join(__dirname, "../docs");
  if (!fs.existsSync(docsPath)) {
    error.fatal("Please run `psp build` first to generate the policy docs.");
  }

  const { domain, space, username, password } = await gatherCreds();

  const site = `https://${domain || CONFLUENCE_DOMAIN}.atlassian.net`;
  const baseUrl = `${site}/wiki/rest/api/content`;
  const pageUrl = `${site}/wiki/spaces/${space || CONFLUENCE_SPACE}/pages`;

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Basic ${Buffer.from(
      (username || CONFLUENCE_USER) + ":" + (password || CONFLUENCE_PASS)
    ).toString("base64")}`,
  };

  const confluencePages = fs.existsSync(CONFLUENCE_PAGES)
    ? JSON.parse(fs.readFileSync(CONFLUENCE_PAGES))
    : {};

  const worked = [];
  const failed = [];

  const docs = fs.readdirSync(docsPath);

  for (const doc of docs) {
    const pageId = confluencePages[doc];
    const currentVersion =
      pageId && (await getVersion(headers, `${baseUrl}/${pageId}`));
    const version = currentVersion && { number: currentVersion + 1 };

    if (doc.endsWith(".md")) {
      const data = fs.readFileSync(
        path.join(__dirname, "../docs/", doc),
        "utf8"
      );
      const parsedData = data
        .replace(/^#(.*)$/m, "") // removes title
        .replace(/^ {2}(-|\*)/gm, "    -") // fixes sublist indentation
        .replace(/&/gm, "&amp;")
        .replace(/[‘’]/gm, `'`) // fixes quote character
        .replace(/[“”]/gm, `"`);
      const html = converter
        .makeHtml(parsedData)
        .replace(/<pre><code/g, "<pre><div")
        .replace(/<\/code><\/pre>/g, "</div></pre>")
        .replace(/<\/table>/g, "</table><br/>")
        .replace(/<br>/g, "<br/>")
        .replace(/<#>/g, "&lt;#&gt;");
      const parsedHtml = parseLinks(pageUrl, html, confluencePages);

      const match = data.match(/^#{1,2}(.*)$/m); // Title
      if (!match) {
        failed.push(doc);
        console.error(`error parsing title for ${doc}`);
        continue;
      }
      const title = match[1].trim();

      const body = {
        version,
        type: "page",
        title,
        space: {
          key: space || CONFLUENCE_SPACE,
        },
        body: {
          storage: {
            value: parsedHtml,
            representation: "storage",
          },
        },
      };

      const options = {
        method: pageId ? "put" : "post",
        headers,
        body: JSON.stringify(body),
      };

      const uri = pageId ? `${baseUrl}/${pageId}` : baseUrl;
      const response = await fetch(uri, options);
      if (response.ok) {
        const result = await response.json();
        confluencePages[doc] = pageId || result.id;
        worked.push(doc);
      } else {
        failed.push(doc);
        fs.writeFileSync(`./failed-${doc}.html`, parsedHtml);
        console.error(`publish to confluence failed for ${doc}`);
        console.error({ response: await response.json() });
        continue;
      }
    }
  }

  fs.writeFileSync(
    "./confluence-pages.json",
    JSON.stringify(confluencePages, null, 2)
  );

  console.log(`Published ${worked.length} docs to Confluence.`);
  if (failed.length > 0) {
    console.log(`${failed.length} failed:`);
    console.log(failed.join("\n"));
  }
}

// publish().catch(console.log);

module.exports = { publish };