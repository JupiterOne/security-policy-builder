/**
 * Example utility to add `webLink` property to procedures in the `config.json`
 * file. When published to your JupiterOne account, the URL in `webLink` will be
 * used in the Compliance app for each mapped requirement/control, instead of a
 * URL linking to the JupiterOne Policies app.
 *
 * The program is pre-configured with URL patterns for SharePoint and Confluence
 * using the name of each policy and procedure. Update the URL pattern as needed.
 *
 * Prerequisite: Node.js version 10 or later.
 */

'use strict';

const error = require('../lib/error');
const program = require('commander');

program
  .version(require('../package').version, '-v, --version')
  .usage('[options]')
  .option('-s, --site [SharePoint|Confluence]', 'the site where policies and procedures are hosted (only SharePoint and Confluence are supported by default)')
  .option('-d, --domain [name]', 'company domain name or vanity subdomain name as part of the site URL')
  .option('-k, --key [directoryNameOrSpaceKey]', 'subdirectory name or key for the site, such as SPACEKEY for a Confluence site')
  .option('-s, --replace-space [char]', 'replace space in URL with this specified character')
  .option('-c, --config [file]', 'JSON config file')
  .option('-p, --param [name|id]', 'use either "name" or "id" from each policy/procedure to build the URL')
  .option('--policy-param [name|id]', 'use either "name" or "id" from each policy to build the URL')
  .option('--procedure-param [name|id]', 'use either "name" or "id" from each procedure to build the URL')
  .option('-l, --lower-case', 'use all lowercase URL')
  .parse(process.argv);

const fs = require('fs');
const configFile = 'templates/config.json';

const domain = program.domain || 'company';
const site = program.site || 'default';
const key = program.key;
const spaceChar = program.replaceSpace || '';
const param = program.param || ((site === 'default') ? 'id' : 'name');
const policyParam = program.policyParam || ((site === 'mkdocs') && 'id');
const procedureParam = program.procedureParam || ((site === 'mkdocs') && 'name');
const forceLowerCase = program.lowerCase || site === 'mkdocs';
const sectionPrefix = '';

const sites = {
  sharepoint: {
    baseUrl: `https://${domain}.sharepoint.com/SitePages${key ? '/' + key : ''}`,
    spaceChar: '%20',
    sectionPrefix
  },
  confluence: {
    baseUrl: `https://${domain}.atlassian.net/wiki/display/${key}`,
    spaceChar: '+',
    sectionPrefix
  },
  mkdocs: {
    baseUrl: `https://${domain}/${key}`,
    spaceChar: '-',
    sectionPrefix: '#'
  },
  custom: {
    baseUrl: `https://${domain}/${key}`,
    spaceChar,
    sectionPrefix
  },
  default: {
    baseUrl: `https://apps.us.jupiterone.io/policies`,
    spaceChar: '',
    sectionPrefix
  }
};

const config = JSON.parse(fs.readFileSync(configFile));
const siteConfig = sites[site.toLowerCase()];

if (!siteConfig) {
  error.fatal(`Unsupported site: ${site}`);
}

const mapping = {};

for (const policy of config.policies || []) {
  for (const procedureId of policy.procedures || []) {
    mapping[procedureId] = policy;
  }
}

for (const procedure of config.procedures || []) {
  const id = procedure.id;
  const policy = mapping[id];

  const part1 = policyParam ? policy[policyParam] : policy[param];
  const part2 = procedureParam ? procedure[procedureParam] : procedure[param];

  const webLink = `${siteConfig.baseUrl}/${
    part1.replace(/\s/g, siteConfig.spaceChar)
  }/${siteConfig.sectionPrefix}${
    part2.replace(/\s/g, siteConfig.spaceChar)
  }`;

  procedure.webLink = forceLowerCase ? webLink.toLowerCase() : webLink;
}

fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
