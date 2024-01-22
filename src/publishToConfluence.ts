import fs from 'fs-extra';
import fetch from 'node-fetch';
import os from 'os';
import path from 'path';
import showdown from 'showdown';
import * as error from '~/src/error';

const converter = new showdown.Converter({
  parseImgDimensions: true,
  simplifiedAutoLink: true,
  tables: true,
  disableForced4SpacesIndentedSublists: true,
  ghCompatibleHeaderId: true,
});

const CONFLUENCE_PAGES = './confluence-pages.json';

const CONFLUENCE_DOMAIN = process.env.CONFLUENCE_DOMAIN;
const CONFLUENCE_SPACE = process.env.CONFLUENCE_SPACE;
const CONFLUENCE_USER = process.env.CONFLUENCE_USER;
const CONFLUENCE_PASS = process.env.CONFLUENCE_PASS;

export type PublishToConfluenceOptions = {
  domain: string;
  space: string;
  username: string;
  password: string;
  parent: string;
  debug: boolean;
};

function parseLinks(
  pageUrl: string,
  html: string,
  confluencePages: Record<string, string>
) {
  const linkRegex: RegExp = /href=['"]([\w-]+\.md)(#.*)?['"]/gm;
  const hasLinks = linkRegex.test(html);

  if (hasLinks) {
    return html.replace(linkRegex, (match, p1, p2 = '') => {
      return `href="${pageUrl}/${confluencePages[p1]}${p2.toLowerCase()}"`;
    });
  } else {
    return html;
  }
}

async function getVersion(headers: Record<string, string>, page: string) {
  const response = await fetch(page, {
    method: 'get',
    headers,
  });
  const result = await response.json();
  return result.version.number;
}

export default async function publishToConfluence(
  source: string,
  options: PublishToConfluenceOptions
) {
  const docsPath = source || './docs';
  if (!fs.existsSync(docsPath)) {
    error.fatal('Please run `psp build` first to generate the policy docs.');
  }

  const { domain, space, username, password, parent, debug } = options;

  const site = `https://${domain || CONFLUENCE_DOMAIN}.atlassian.net`;
  const baseUrl = `${site}/wiki/rest/api/content`;
  const pageUrl = `${site}/wiki/spaces/${space || CONFLUENCE_SPACE}/pages`;

  const headers = {
    'Content-Type': 'application/json',

    Accept: 'application/json',
    Authorization: `Basic ${Buffer.from(
      (username || CONFLUENCE_USER) + ':' + (password || CONFLUENCE_PASS)
    ).toString('base64')}`,
  };

  const confluencePages = fs.existsSync(CONFLUENCE_PAGES)
    ? JSON.parse(fs.readFileSync(CONFLUENCE_PAGES, { encoding: 'utf8' }))
    : {};

  const worked = [];
  const failed = [];
  let debugPath = '';

  if (debug) {
    debugPath = await fs.mkdtemp(path.join(os.tmpdir(), 'confluence-html-'));
    console.log(
      `Debug enabled, generated confluence html can be found in ${debugPath}`
    );
  }

  const docs = fs.readdirSync(docsPath);

  for (const doc of docs) {
    const pageId = confluencePages[doc];
    const currentVersion =
      pageId && (await getVersion(headers, `${baseUrl}/${pageId}`));
    const version = currentVersion && { number: currentVersion + 1 };

    if (doc.endsWith('.md')) {
      const data = fs.readFileSync(path.join(docsPath, doc), 'utf8');
      const parsedData = data
        .replace(/#([\w-]+)/gm, '$&'.toLowerCase())
        .replace(/^#(.*)$/m, '') // removes title
        .replace(/&/gm, '&amp;')
        .replace(/[‘’]/gm, `'`) // fixes quote character
        .replace(/[“”]/gm, `"`);
      const html = converter
        .makeHtml(parsedData)
        .replace(/<pre><code/g, '<pre><div')
        .replace(/<\/code><\/pre>/g, '</div></pre>')
        .replace(/<\/table>/g, '</table><br/>')
        .replace(/<br>/g, '<br/>')
        .replace(/<#>/g, '&lt;#&gt;');
      const parsedHtml = parseLinks(pageUrl, html, confluencePages);

      const match = /^#{1,2}(.*)$/m.exec(data); // Title
      if (!match) {
        failed.push(doc);
        console.error(`error parsing title for ${doc}`);
        continue;
      }
      const title = match[1].trim();

      const req = {
        version,
        type: 'page',
        title,
        space: {
          key: space || CONFLUENCE_SPACE,
        },
        ancestors: parent ? [{ id: parent }] : [],
        body: {
          storage: {
            value: parsedHtml,
            representation: 'storage',
          },
        },
      };

      const options = {
        method: pageId ? 'put' : 'post',
        headers,
        body: JSON.stringify(req),
      };

      const uri = pageId ? `${baseUrl}/${pageId}` : baseUrl;
      const response = await fetch(uri, options);
      const result = await response.json();
      if (response.ok) {
        confluencePages[doc] = pageId || result.id;
        if (debug) {
          fs.writeFileSync(`${debugPath}/${doc}.html`, parsedHtml);
        }
        worked.push(doc);
      } else {
        failed.push(doc);
        if (debug) {
          fs.writeFileSync(`${debugPath}/failed-${doc}.html`, parsedHtml);
        }
        console.error(`publish to confluence failed for ${doc}`);
        console.error(result.message);
        continue;
      }
    }
  }

  fs.writeFileSync(
    './confluence-pages.json',
    JSON.stringify(confluencePages, null, 2)
  );

  console.log(`Published ${worked.length} docs to Confluence.`);
  console.log(
    'Please retain `confluence-pages.json` in the current directory. The file contains Confluence page id mappings used for subsequent updates.'
  );
  if (failed.length > 0) {
    console.log(`${failed.length} failed:`);
    console.log(failed.join('\n'));
  }
}
