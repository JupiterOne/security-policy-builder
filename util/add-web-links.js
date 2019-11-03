/**
 * Example utility to add `webLink` property to procedures in the `config.json`
 * file. When published to your JupiterOne account, the URL in `webLink` will be
 * used in the Compliance app for each mapped requirement/control, instead of a
 * URL linking to the JupiterOne Policies app.
 *
 * You will need to update the `baseUrl` as well as the `procedure.webLink`
 * pattern to create the desired output.
 */

'use strict';

const fs = require('fs');

const configFile = 'templates/config.json';

const baseUrl = 'https://company.sharepoint.com/Documents';

const config = JSON.parse(fs.readFileSync(configFile));

const mapping = {};

for (const policy of config.policies || []) {
  for (const procedureId of policy.procedures || []) {
    mapping[procedureId] = policy;
  }
}

for (const procedure of config.procedures || []) {
  const id = procedure.id;
  const name = procedure.name;
  const policy = mapping[id];
  procedure.webLink = `${baseUrl}/${policy.name.replace(/\s/g, '+')}/${name.replace(/\s/g, '+')}`;
}

fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
