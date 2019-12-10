'use strict';

const J1_USER_POOL_ID = process.env.J1_USER_POOL_ID || 'us-east-2_9fnMVHuxD';
const J1_CLIENT_ID = process.env.J1_CLIENT_ID || '1hcv141pqth5f49df7o28ngq1u';
const JupiterOneClient = require('@jupiterone/jupiterone-client-nodejs/src/j1client');
const ProgressBar = require('progress');
const { prompt } = require('inquirer');
const program = require('commander');
const error = require('../lib/error');
const path = require('path');
const fs = require('fs');
const pAll = require('p-all');

const EUSAGEERROR = 126;
const MAX_CONCURRENCY = 5;

async function main () {
  program
    .version(require('../package').version, '-v, --version')
    .usage('[options]')
    .option('-a, --account <name>', 'JupiterOne account name.')
    .option('-c, --config <file>', 'path to config file')
    .option('-t, --templates [dir]', 'optional path to templates directory', 'templates')
    .option('-u, --user <email>', 'JupiterOne user email.')
    .option('-k, --api-token <api_token>', 'JupiterOne API Token.')
    .option('-n, --noninteractive', 'do not prompt for confirmation, expect password on stdin')
    .parse(process.argv);

  await validateInputs();

  try {
    const config = await validatePSPDependencies();
    const templateData = await readTemplateData(config);
    const j1Client = await initializeJ1Client();
    await storeConfigWithAccount(j1Client, config);
    await upsertConfigData(j1Client, config, templateData, 'policies');
    await upsertConfigData(j1Client, config, templateData, 'procedures');
    await upsertConfigData(j1Client, config, templateData, 'references');
    await upsertImplementsRelationships(j1Client, config);
  } catch (err) {
    error.fatal(`Unexpected error: ${err}`);
  }
  console.log('Publish complete!');
}

// ensure user supplied necessary params
async function validateInputs () {
  if (!program.account || program.account === '') {
    error.fatal('Missing -a|--account flag!', EUSAGEERROR);
  }

  if (!program.user || program.user === '') {
    error.fatal('Missing -u|--user flag!', EUSAGEERROR);
  }

  if (!program.config || program.config === '') {
    error.fatal('Missing -c|--config flag!', EUSAGEERROR);
  }
  if (!program.apiToken) {
    await gatherPassword();
  }
}

// ensure docs are built and config.json is valid
async function validatePSPDependencies () {
  if (program.noninteractive) {
    process.stdout.write('Validating inputs... ');
  } else {
    console.log('Validating inputs...');
  }
  if (!fs.existsSync(program.templates)) {
    error.fatal(`Could not find templates directory (${program.templates}). Make sure you have built your PSP ` +
      'docs, and/or specify the correct path with \'--templates\'.');
  }
  if (!fs.existsSync(program.config)) {
    error.fatal(`Could not find config file (${program.config}). Specify the correct path with '--config'.`);
  }
  const config = jParse(program.config);
  if (!config) {
    error.fatal(`Could not parse config file (${program.config}).`);
  }
  const requiredKeys = [ 'organization', 'standards', 'policies', 'procedures', 'references' ];

  const configKeys = Object.keys(config);
  if (requiredKeys.some(k => configKeys.indexOf(k) < 0)) {
    error.fatal(`Missing one or more required config sections: ${requiredKeys.join(', ')}.`);
  }
  const tmplDirStats = fs.statSync(program.templates);
  if (program.noninteractive) {
    console.log('OK!');
    return config;
  }
  const { shouldPublish } = await prompt([
    {
      type: 'confirm',
      name: 'shouldPublish',
      message: `Do you really want to publish the contents of '${program.templates}/', last modified on ${tmplDirStats.mtime}? This may overwrite content generated via the JupiterOne Policy Builder UI`
    }
  ]);
  if (!shouldPublish) {
    error.fatal('Canceled by user.');
  }
  console.log('Inputs OK!');
  return config;
}

function jParse (file) {
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return null; }
  return data;
}

// Note: this will happily read from STDIN if data is piped in...
// e.g. if lastpass is installed:
// lpass show MyJ1Password | psp publish -u my.user@domain.tld -a myaccount
async function gatherPassword () {
  const answer = await prompt([
    {
      type: 'password',
      name: 'password',
      message: 'JupiterOne password:'
    }
  ]);
  program.password = answer.password;
}

async function initializeJ1Client () {
  process.stdout.write('Authenticating with JupiterOne... ');
  const j1Options = {
    account: program.account
  };

  if (program.apiToken) {
    j1Options.accessToken = program.apiToken;
  } else {
    j1Options.username = program.user;
    j1Options.password = program.password;
    j1Options.poolId = J1_USER_POOL_ID;
    j1Options.clientId = J1_CLIENT_ID;
  }

  const j1Client = await (new JupiterOneClient(j1Options)).init();
  console.log('OK!');
  return j1Client;
}

async function findAccountEntity (j1Client, accountName) {
  const accountEntity = (await j1Client.queryV1('find jupiterone_account')).pop();
  if (!accountEntity) {
    error.fatal(`Could not find account (${accountName}) in JupiterOne. Please make sure you have ` +
    'gone through the new customer onboarding process, and try again.');
  }
  return accountEntity;
}

async function readTemplateData (config) {
  const data = {};
  const todos = [];
  const sections = ['policies', 'procedures', 'references'];
  const templateCount = sections.reduce((acc, cv) => { return acc + config[cv].length; }, 0);
  process.stdout.write(`Scanning ${templateCount} template files for publishing... `);
  sections.forEach(section => {
    config[section].forEach(configItem => {
      data[section] = {};
      const tmplPath = path.join(program.templates, configItem.file + '.tmpl');
      const work = async () => {
        const tmplData = await readFilePromise(tmplPath);
        data[section][configItem.id] = tmplData;
      };
      todos.push(work);
    });
  });
  await pAll(todos, { concurrency: MAX_CONCURRENCY });
  console.log('OK!');
  return data;
}

async function storeConfigWithAccount (j1Client, configData) {
  const accountName = program.account;
  const accountEntity = await findAccountEntity(j1Client, accountName);

  process.stdout.write('Storing config with JupiterOne account... ');
  if (!await j1Client.upsertEntityRawData(accountEntity.entity._id, 'policyBuilderConfig', 'application/json', configData)) {
    error.fatal(`Error storing PSP configuration data with account (${accountName}).`);
  }
  console.log('OK');
  return accountEntity;
}

async function upsertConfigData (j1Client, config, templateData, section) {
  const j1qlLookup = {
    'policies': { 'type': 'security_policy', 'class': ['Document', 'Policy'] },
    'procedures': { 'type': 'security_procedure', 'class': ['Document', 'Procedure'] },
    'references': { 'type': 'security_document', 'class': 'Document' }
  };

  if (!j1qlLookup[section]) {
    throw new Error(`Unknown config section: ${section}`);
  }

  const sectionConfig = config[section];
  const adoptedItems = sectionConfig.filter(c => c.adopted === true);
  const entityType = j1qlLookup[section].type;
  const entities = await j1Client.queryV1(`find ${entityType}`);
  console.log(`Found ${entities.length} existing ${entityType} entities in JupiterOne graph.`);
  console.log(`Publishing ${adoptedItems.length} configured and adopted ${entityType} entities...`);
  const todos = [];
  const bar = new ProgressBar(':bar', { total: adoptedItems.length + 1, clear: true, width: 50 });
  bar.tick(); // start drawing progress bar to screen
  adoptedItems.forEach(item => {
    const properties = {
      'tag.AccountName': program.account,
      id: item.id,
      name: item.id,
      title: item.name,
      displayName: item.name,
      adopted: item.adopted,
      provider: item.provider,
      summary: item.summary,
      type: item.type,
      webLink: item.webLink || null,
      createdOn: (new Date()).getTime(),
      updatedOn: (new Date()).getTime()
    };

    // TODO: account for rename/deletions in graph... changing the id will result in creating a new entity, orphaning old
    const existing = entities.filter(e => e.properties.id === item.id).pop();
    const rawDataUpsertOn = templateDataUpsertBuilder(j1Client, templateData, section, item.id);
    let work;

    if (!existing) {
      work = async () => {
        const res = await j1Client.createEntity(
          `j1:${program.account}:${entityType.replace(/_/g, '-')}:${item.id}`,
          entityType,
          j1qlLookup[section].class,
          properties);
        const entityId = res.vertex.entity._id;
        await rawDataUpsertOn(entityId);
        bar.tick();
      };
    } else {
      work = async () => {
        await j1Client.updateEntity(existing.entity._id,
          {
            _class: j1qlLookup[section].class,
            ...properties
          }
        );
        await rawDataUpsertOn(existing.entity._id);
        bar.tick();
      };
    }
    todos.push(work); // create or update entity, upsert template data
  });
  await pAll(todos, { concurrency: MAX_CONCURRENCY });
}

async function upsertImplementsRelationships (j1Client, config) {
  const rels = (await j1Client.queryV1('find (security_procedure|security_document) that IMPLEMENTS as edge security_policy return edge')).map(v => v.edge);
  console.log(`Found ${rels.length} existing IMPLEMENTS relationships...`);

  process.stdout.write('Analyzing entity relationships...');
  const pspEntities = await j1Client.queryV1('find (security_policy|security_procedure|security_document)');
  const allPolicyImplementorEntities = [];
  const allPolicyEntities = [];
  pspEntities.map(item => {
    if (item.entity._type.includes('security_policy')) {
      allPolicyEntities.push(item);
    } else {
      allPolicyImplementorEntities.push(item);
    }
  });
  console.log('OK!');

  const todos = [];
  const warns = [];

  console.log(`Publishing ${allPolicyImplementorEntities.length} relationships... `);
  const bar = new ProgressBar(':bar', { total: allPolicyImplementorEntities.length + 1, clear: true, width: 50 });
  bar.tick();

  allPolicyEntities.forEach(policy => {
    // find config for current policy, which contains an array of procedures/references that implement it...
    const policyConfig = config.policies.find(p => p.id === policy.properties.id);
    if (!policyConfig) {
      warns.push(`Unable to find a matching policy configuration in '${program.config}' for existing graph entity '${policy.properties.id}'. Ignored.`);
      return;
    }
    // get array of entities that implement the current policy entity...
    const implementors = allPolicyImplementorEntities.filter(i => policyConfig.procedures.includes(i.properties.id));
    implementors.forEach(implementor => {
      const relKey = `j1:${program.account}:procedure-implements-policy:${implementor.properties.id}:${policy.properties.id}`;
      const relType = 'procedure|implements|policy';
      const relClass = 'IMPLEMENTS';

      const work = async () => {
        await j1Client.createRelationship(relKey, relType, relClass, implementor.entity._id, policy.entity._id);
        bar.tick();
      };
      todos.push(work);
    });
  });

  await pAll(todos, { concurrency: MAX_CONCURRENCY });
  warns.forEach(warning => {
    console.warn(warning);
  });
}

async function readFilePromise (filePath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filePath, 'utf-8', (err, data) => {
      if (err) reject(err);
      resolve(data);
    });
  });
}

function templateDataUpsertBuilder (j1Client, templateData, configSection, templateId) {
  return async (entityId) => {
    const name = `policy_template_${configSection}_${templateId}`;
    if (!await j1Client.upsertEntityRawData(entityId, name, 'text/html', templateData[configSection][templateId])) {
      error.warn(`Error storing PSP template data (${configSection}/${templateId}).`);
    }
  };
}

main();
