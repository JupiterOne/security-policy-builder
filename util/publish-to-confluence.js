'use strict';

const { prompt } = require('inquirer');
const path = require('path');
const fs = require('fs');
const rp = require("request-promise-native");
const fetch = require('node-fetch');
const showdown = require('showdown');

const converter = new showdown.Converter(
  {
    parseImgDimensions: true,
    simplifiedAutoLink: true,
    tables: true
  }
);

const CONFLUENCE_DOMAIN = process.env.CONFLUENCE_DOMAIN;
const CONFLUENCE_SPACE = process.env.CONFLUENCE_SPACE;
const CONFLUENCE_USER = process.env.CONFLUENCE_USER;
const CONFLUENCE_PASS = process.env.CONFLUENCE_PASS;

async function gatherCreds () {
  const answer = await prompt([
    {
      type: 'input',
      name: 'domain',
      message: 'Confluence domain:'
    },
    {
      type: 'input',
      name: 'space',
      message: 'Confluence space key:'
    },
    {
      type: 'input',
      name: 'username',
      message: 'Confluence username:'
    },
    {
      type: 'password',
      name: 'password',
      message: 'Confluence password:'
    }
  ]);
  return {
    domain: answer.domain,
    space: answer.space,
    username: answer.username,
    password: answer.password
  };
}

async function publish () {
  const { domain, space, username, password } = await gatherCreds();

  const baseUrl = `http://${domain || CONFLUENCE_DOMAIN}.atlassian.net`;

  const defaultOptions = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${Buffer.from(
        (username || CONFLUENCE_USER) + ':' + (password || CONFLUENCE_PASS)
      ).toString('base64')}`
    }
  };

  const request = rp.defaults({
    baseUrl,
    auth: {
      user: username || CONFLUENCE_USER,
      pass: password || CONFLUENCE_PASS
    },
    json: true
  });

  const docs = fs.readdirSync(path.join(__dirname, '../docs'));

  for (const doc of docs) {
    console.log({doc});

    if (doc.endsWith('.md')) {
      const data = fs.readFileSync(path.join(__dirname, '../docs/', doc), 'utf8')
        .replace(/^ {2}(-|\*)/gm, '    -'); // fixes sublist indentation

      const html = converter.makeHtml(data)
        .replace(/<pre><code/g, '<pre><div')
        .replace(/<\/code><\/pre>/g, '</div></pre>')
        .replace(/<\/table>/g, '</table><br>');

      const title = data.match(/^#(.*)$/m)[1].trim();

      const body = {
        type: 'page',
        title,
        space: {
          key: space || CONFLUENCE_SPACE
        },
        body: {
          storage: {
            value: html,
            representation: 'storage'
          }
        }
      };

      // const options = { ...defaultOptions, body: JSON.stringify(body) };
      console.log(JSON.stringify(body, null, 2));

      // const response = await fetch(baseUrl, options);

      const response = await request.post({
        uri: '/wiki/rest/api/content',
        body
      });
      // const result = await response.json();
      console.log({response});
      // console.log(JSON.stringify(result, null, 2));
      break;
    }
  }
}

publish()
  .catch(console.log);
