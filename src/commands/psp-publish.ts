import ProgressBar from 'progress';
import { prompt } from 'inquirer';
import program from 'commander';
import * as error from '~/src/error';
import publishToConfluence, {
  PublishToConfluenceOptions,
} from '~/src/publishToConfluence';
import path from 'path';
import fs, { promises as fsPromises } from 'fs';
import pAll, { PromiseFactory } from 'p-all';
import pThrottle from 'p-throttle';
import { PolicyBuilderConfig, PolicyBuilderElement } from '~/src/types';
import { Entity, EntityProperties } from '~/src/j1/types';
import chalk from 'chalk';
import pickAdopted from '~/src/util/pickAdopted';
import packageJson from '~/package.json';
import { createJupiterOneClient, J1Options, JupiterOneClient } from '~/src/j1';

const EUSAGEERROR = 126;
const MAX_CONCURRENCY = 2;
const THROTTLE_INTERVAL = 1000;
const THROTTLE_LIMIT = 10;

let shouldUpdateRelationships = false;

export async function run() {
  program
    .version(packageJson.version, '-v, --version')
    .usage('[options]')
    .option('-a, --account <name>', 'JupiterOne account id')
    .option('-c, --config <file>', 'path to config file')
    .option(
      '-t, --templates [dir]',
      'optional path to templates directory',
      'templates'
    )
    .option('-u, --user <email>', 'JupiterOne or Confluence user email')
    .option(
      '-k, --api-token <api_token>',
      'JupiterOne API token or Confluence user access key'
    )
    .option(
      '-f, --force-update',
      'force update all items instead of only those items modified with a newer timestamp'
    )
    .option(
      '-n, --noninteractive',
      'do not prompt for confirmation, expect password on stdin'
    )
    .option('--confluence', 'publish to a Confluence wiki space')
    .option(
      '--site <subdomain>',
      "Confluence site/domain (the vanity subdomain before '.atlassian.net')"
    )
    .option('--space <spaceKey>', 'Space key of the Confluence wiki space')
    .option(
      '-d, --docs [dir]',
      'path to docs; used in conjunction with --confluence option',
      'docs'
    )
    .parse(process.argv);

  if (program.confluence && program.docs) {
    if (program.site && program.space && program.user && program.apiToken) {
      const options: PublishToConfluenceOptions = {
        domain: program.site,
        space: program.space,
        username: program.user,
        password: program.apiToken,
      };
      await publishToConfluence(program.docs, options);
      process.exit(0);
    } else {
      console.log(chalk.red('Missing required arguments'));
      process.exit(1);
    }
  }

  await validateInputs();

  const config = await validatePSPDependencies();
  const templateData = await readTemplateData(config);
  const j1Client = initializeJ1Client();
  await storeConfigWithAccount(j1Client, config);
  await upsertConfigData(j1Client, config, templateData, 'policies');
  await upsertConfigData(j1Client, config, templateData, 'procedures');
  await upsertConfigData(j1Client, config, templateData, 'references');
  await upsertImplementsRelationships(j1Client, config);

  console.log('Publish complete!');
}

// ensure user supplied necessary params
async function validateInputs() {
  if (!program.account || program.account === '') {
    error.fatal('Missing -a|--account input!', EUSAGEERROR);
  }

  if ((!program.user || program.user === '') && !program.apiToken) {
    error.fatal('Missing -u|--user or -k|--api-token input!', EUSAGEERROR);
  }

  if (!program.config || program.config === '') {
    error.fatal('Missing -c|--config input!', EUSAGEERROR);
  }
  if (!program.apiToken) {
    await gatherPassword();
  }
}

// ensure docs are built and config.json is valid
async function validatePSPDependencies() {
  if (program.noninteractive) {
    process.stdout.write('Validating inputs... ');
  } else {
    console.log('Validating inputs...');
  }
  if (!fs.existsSync(program.templates)) {
    error.fatal(
      `Could not find templates directory (${program.templates}). Make sure you have built your PSP ` +
        "docs, and/or specify the correct path with '--templates'."
    );
  }
  if (!fs.existsSync(program.config)) {
    error.fatal(
      `Could not find config file (${program.config}). Specify the correct path with '--config'.`
    );
  }
  const config = parseJsonFile(program.config);
  if (!config) {
    error.fatal(`Could not parse config file (${program.config}).`);
  }
  const requiredKeys = ['organization', 'policies', 'procedures', 'references'];

  const configKeys = Object.keys(config);
  if (requiredKeys.some((k) => configKeys.indexOf(k) < 0)) {
    error.fatal(
      `Missing one or more required config sections: ${requiredKeys.join(
        ', '
      )}.`
    );
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
      message: `Do you really want to publish the contents of '${program.templates}/', last modified on ${tmplDirStats.mtime}? This may overwrite content generated via the JupiterOne Policy Builder UI`,
    },
  ]);
  if (!shouldPublish) {
    error.fatal('Canceled by user.');
  }
  console.log('Inputs OK!');
  return config;
}

function parseJsonFile(file: string) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return null;
  }
  return data;
}

// Note: this will happily read from STDIN if data is piped in...
// e.g. if lastpass is installed:
// lpass show MyJ1Password | psp publish -u my.user@domain.tld -a myaccount
async function gatherPassword() {
  const answer = await prompt([
    {
      type: 'password',
      name: 'password',
      message: 'JupiterOne password:',
    },
  ]);
  program.password = answer.password;
}

function initializeJ1Client() {
  const j1Options: J1Options = {
    accountId: program.account,
    dev: process.env.J1_DEV_ENABLED === 'true',
    apiKey: program.apiToken,
  };

  const j1Client = createJupiterOneClient(j1Options);
  return j1Client;
}

async function findAccountEntity(
  j1Client: JupiterOneClient,
  accountName: string
) {
  const accountEntity = (
    await j1Client.queryForEntityList('find jupiterone_account')
  ).pop();
  if (!accountEntity) {
    error.fatal(
      `Could not find account (${accountName}) in JupiterOne. Please make sure you have ` +
        'gone through the new customer onboarding process, and try again.'
    );
  }
  return accountEntity;
}

type SectionName = 'policies' | 'procedures' | 'references';

async function readTemplateData(
  config: PolicyBuilderConfig
): Promise<TemplateData> {
  const data: Record<SectionName, Record<string, string>> = {
    policies: {},
    procedures: {},
    references: {},
  };
  const timestamps: Record<SectionName, Record<string, number>> = {
    policies: {},
    procedures: {},
    references: {},
  };

  const todos: PromiseFactory<void>[] = [];
  const sections: SectionName[] = ['policies', 'procedures', 'references'];
  const templateCount = sections.reduce((acc, cv) => {
    return acc + (config[cv]?.length ?? 0);
  }, 0);
  process.stdout.write(
    `Scanning ${templateCount} template files for publishing... `
  );
  sections.forEach((section) => {
    const sectionData = config[section] ?? [];
    for (const element of sectionData) {
      const tmplPath = path.join(program.templates, element.file + '.tmpl');
      const work = async () => {
        const tmplData = await readFilePromise(tmplPath);
        const updatedOn = (await getFileUpdatedTimePromise(tmplPath)).getTime();
        data[section][element.id] = tmplData;
        timestamps[section][element.id] = updatedOn;
      };
      todos.push(work);
    }
  });
  await pAll(todos, { concurrency: MAX_CONCURRENCY });
  console.log('OK!');
  return { data, timestamps };
}

async function storeConfigWithAccount(
  j1Client: JupiterOneClient,
  configData: PolicyBuilderConfig
) {
  const accountName = program.account;
  const accountEntity = (await findAccountEntity(j1Client, accountName))!;

  process.stdout.write('Storing config with JupiterOne account... ');
  try {
    await j1Client.upsertEntityRawData({
      entityId: accountEntity._id,
      entryName: 'policyBuilderConfig',
      contentType: 'application/json',
      body: configData,
    });
  } catch (err) {
    throw error.fatal(
      `Error storing PSP configuration data with account (${accountName}). Error: ${
        err.stack || err.toString()
      }`
    );
  }

  console.log('OK');
  return accountEntity;
}

async function upsertConfigData(
  j1Client: JupiterOneClient,
  config: PolicyBuilderConfig,
  templateData: TemplateData,
  sectionName: SectionName
) {
  const j1qlLookup: Record<
    SectionName,
    {
      type: string;
      class: string | string[];
    }
  > = {
    policies: { type: 'security_policy', class: ['Document', 'Policy'] },
    procedures: {
      type: 'security_procedure',
      class: ['Document', 'Procedure'],
    },
    references: { type: 'security_document', class: 'Document' },
  };

  if (!j1qlLookup[sectionName]) {
    throw new Error(`Unknown config section: ${sectionName}`);
  }

  const sectionConfig = config[sectionName];
  const adoptedItems = pickAdopted(sectionConfig);
  const entityType = j1qlLookup[sectionName].type;
  const entities = await j1Client.queryForEntityList(`find ${entityType}`);
  console.log(
    `Found ${entities.length} existing ${entityType} entities in JupiterOne graph.`
  );

  if (adoptedItems.length) {
    console.log(
      `Publishing ${adoptedItems.length} configured and adopted ${entityType} entities...`
    );
    const bar = new ProgressBar(':bar', {
      total: adoptedItems.length + 1,
      clear: false,
      width: 50,
    });
    bar.tick(); // start drawing progress bar to screen

    let published = 0;
    const handleItemWithThrottling = pThrottle(
      async (
        item: PolicyBuilderElement,
        properties: EntityProperties,
        existing?: Entity
      ) => {
        const rawDataUpsertOn = templateDataUpsertBuilder(
          j1Client,
          templateData,
          sectionName,
          item.id
        );

        if (existing) {
          await j1Client.updateEntity({
            timestamp: Date.now(),
            entity: {
              ...properties,
              _id: existing._id,
              _class: j1qlLookup[sectionName].class,
            },
          });
          await rawDataUpsertOn(existing._id);
        } else {
          const entityKey = `j1:${program.account}:${entityType.replace(
            /_/g,
            '-'
          )}:${item.id}`;
          const res = await j1Client.createEntity({
            timestamp: Date.now(),
            entity: {
              ...properties,
              _key: entityKey,
              _type: entityType,
              _class: j1qlLookup[sectionName].class,
              displayName: properties.displayName as string,
            },
          });
          const entityId = res.entity._id;
          await rawDataUpsertOn(entityId);
        }
      },
      THROTTLE_LIMIT,
      THROTTLE_INTERVAL
    );

    for (const item of adoptedItems) {
      const updatedOn = templateData.timestamps[sectionName][item.id];
      const existing = entities.find((e) => e.id === item.id);

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
        createdOn: existing ? existing.createdOn : updatedOn,
        updatedOn: updatedOn,
      };

      if (existing) {
        const outOfDate = (existing.updatedOn ?? 0) < updatedOn;
        if (outOfDate || program.forceUpdate) {
          await handleItemWithThrottling(item, properties, existing);
          published++;
        }
      } else {
        await handleItemWithThrottling(item, properties);
        published++;
      }
      bar.tick();
    }

    if (published > 0) {
      shouldUpdateRelationships = true;
      console.log(`Created/updated ${published} ${entityType} entities.\n`);
    } else {
      console.log(
        `No change detected. Use -f option to force update if needed.\n`
      );
    }
  } else {
    console.log('No adopted items. Nothing to publish.');
  }
}

async function upsertImplementsRelationships(
  j1Client: JupiterOneClient,
  config: PolicyBuilderConfig
) {
  if (!shouldUpdateRelationships) {
    return;
  }
  const rels = (
    await j1Client.queryForGraphObjectTable(
      'find (security_procedure|security_document) that IMPLEMENTS as edge security_policy return edge'
    )
  ).map((v) => v.edge);
  console.log(`Found ${rels.length} existing IMPLEMENTS relationships...`);

  process.stdout.write('Analyzing entity relationships...');
  const pspEntities = await j1Client.queryForEntityList(
    'find (security_policy|security_procedure|security_document)'
  );
  const allPolicyImplementorEntities: Entity[] = [];
  const allPolicyEntities: Entity[] = [];
  pspEntities.map((entity) => {
    if (entity._type.includes('security_policy')) {
      allPolicyEntities.push(entity);
    } else {
      allPolicyImplementorEntities.push(entity);
    }
  });
  console.log('OK!');

  console.log(
    `Publishing ${allPolicyImplementorEntities.length} relationships... `
  );
  const bar = new ProgressBar(':bar', {
    total: allPolicyImplementorEntities.length + 1,
    clear: true,
    width: 50,
  });
  bar.tick();

  const throttled = pThrottle(
    async (policy: Entity, implementor: Entity) => {
      const relKey = `j1:${program.account}:procedure-implements-policy:${implementor.id}:${policy.id}`;
      const relType = 'procedure|implements|policy';
      const relClass = 'IMPLEMENTS';

      await j1Client.createRelationship({
        timestamp: Date.now(),
        relationship: {
          _key: relKey,
          _type: relType,
          _class: relClass,
          _fromEntityId: implementor._id,
          _toEntityId: policy._id,
          displayName: relClass,
        },
      });
      bar.tick();
    },
    THROTTLE_LIMIT,
    THROTTLE_INTERVAL
  );

  for (const policy of allPolicyEntities) {
    // find config for current policy, which contains an array of procedures/references that implement it...
    const policyConfig = config.policies?.find((p) => p.id === policy.id);
    if (!policyConfig) {
      console.warn(
        `Unable to find a matching policy configuration in '${program.config}' for existing graph entity '${policy.id}'. Ignored.`
      );
      continue;
    }
    // get array of entities that implement the current policy entity...
    const implementors = allPolicyImplementorEntities.filter(
      (i) => policyConfig.procedures?.includes(i.id as string) === true
    );
    for (const implementor of implementors) {
      await throttled(policy, implementor);
    }
  }
}

async function readFilePromise(filePath: string) {
  return fsPromises.readFile(filePath, { encoding: 'utf8' });
}

async function getFileUpdatedTimePromise(filePath: string) {
  const stats = await fsPromises.stat(filePath);
  return stats.mtime;
}

export type TemplateData = {
  data: Record<SectionName, Record<string, string>>;
  timestamps: Record<SectionName, Record<string, number>>;
};

function templateDataUpsertBuilder(
  j1Client: JupiterOneClient,
  templateData: TemplateData,
  configSection: SectionName,
  templateId: string
) {
  return async (entityId: string) => {
    const name = `policy_template_${configSection}_${templateId}`;
    try {
      await j1Client.upsertEntityRawData({
        entityId,
        entryName: name,
        contentType: 'text/html',
        body: templateData.data[configSection][templateId],
      });
    } catch (err) {
      error.warn(
        `Error storing PSP template data (${configSection}/${templateId}). Error: ${
          err.stack || err.toString()
        }`
      );
    }
  };
}
