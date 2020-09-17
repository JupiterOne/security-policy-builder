import ProgressBar from 'progress';
import { prompt } from 'inquirer';
import commander from 'commander';
import * as error from '~/src/error';
import publishToConfluence, {
  PublishToConfluenceOptions,
} from '~/src/publishToConfluence';
import path from 'path';
import fs, { promises as fsPromises } from 'fs';
import pAll, { PromiseFactory } from 'p-all';
import pThrottle from 'p-throttle';
import {
  EntityForSync,
  PolicyBuilderConfig,
  SecurityEntityClass,
  SecurityEntityType,
  SectionName,
  TemplateData,
  PolicyBuilderElement,
  RelationshipForSync,
} from '~/src/types';
import chalk from 'chalk';
import pickAdopted from '~/src/util/pickAdopted';
import packageJson from '~/package.json';
import {
  createJupiterOneClient,
  J1Options,
  JupiterOneClient,
  JupiterOneEnvironment,
  SyncJob,
  SyncJobStatus,
} from '~/src/j1';
import { PSP_SYNC_SCOPE } from '~/src/constants';
import { Spinner } from 'cli-spinner';

const EUSAGEERROR = 126;
const MAX_CONCURRENCY = 2;
const THROTTLE_INTERVAL = 1000;
const THROTTLE_LIMIT = 10;

async function sleep(ms: number) {
  return new Promise((resolve) => {
    return setTimeout(resolve, ms);
  });
}

type ProgramInput = {
  account?: string;
  config?: string;
  templates?: string;
  user?: string;
  apiToken?: string;
  noninteractive?: boolean;
  confluence?: string;
  site?: string;
  space?: string;
  docs?: string;
  wait?: boolean;
};

function printSyncJobReport(
  syncJob: SyncJob,
  propertyNames: (keyof SyncJob)[]
) {
  console.log('\nPUBLISH REPORT:\n');
  for (const propertyName of propertyNames) {
    if (propertyName.startsWith('num')) {
      const prettyName = propertyName
        .replace(/([a-z])([A-Z])/g, (match: string, p1: string, p2: string) => {
          return p1 + ' ' + p2;
        })
        .substring(3);
      console.log(
        `  ${chalk.bold(prettyName)} = ${(syncJob as any)[propertyName]}`
      );
    }
  }
  console.log('');
}

export async function run() {
  const program = commander
    .version(packageJson.version, '-v, --version')
    .usage('[options]')
    .option('-a, --account <name>', 'JupiterOne account id')
    .option('-c, --config <file>', 'path to config file')
    .option(
      '-t, --templates [dir]',
      'optional path to templates directory',
      'templates'
    )
    .option('-u, --user <email>', 'Confluence user email')
    .option(
      '-k, --api-token <api_token>',
      'JupiterOne API token or Confluence user access key'
    )
    .option(
      '-n, --noninteractive',
      'do not prompt for confirmation, expect password on stdin'
    )
    .option('--wait', 'Wait for completion')
    .option('--no-wait', 'Do not wait for completion (default)')
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
    .parse(process.argv)
    .opts() as ProgramInput;

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

  await validateInputs(program);

  if (program.wait === undefined) {
    program.wait = false;
  }

  const config = await validatePSPDependencies(program);
  const templateData = await readTemplateData(program, config);
  const j1Client = initializeJ1Client(program);
  await storeConfigWithAccount(program, j1Client, config);

  await migrateOldSecurityEntitiesToSyncScope(j1Client);
  await migrateOldSecurityRelationshipsToSyncScope(j1Client);

  const { job: syncJob } = await j1Client.startSyncJob({
    source: 'api',
    scope: PSP_SYNC_SCOPE,
  });
  const syncJobId = syncJob.id;

  const sectionNames: SectionName[] = ['policies', 'procedures', 'references'];

  const accountId = program.account!;

  for (const sectionName of sectionNames) {
    await uploadEntitiesForSync({
      j1Client,
      config,
      templateData,
      sectionName,
      syncJobId,
      accountId,
    });
  }

  await uploadRelationshipsForSync({ j1Client, config, accountId, syncJobId });

  console.log('All data uploaded.');

  const finalizeResult = await j1Client.finalizeSyncJob({ syncJobId });

  if (program.wait === false) {
    printSyncJobReport(finalizeResult.job, [
      'numEntitiesUploaded',
      'numRelationshipsUploaded',
    ]);

    console.log(
      chalk.cyan(
        'Work will be completed in the background. Use "--wait" option to wait for completion.'
      )
    );

    console.log(chalk.bold.green('\n\nPublish job submitted.'));
    return;
  }

  console.log('Waiting for synchronization to finish...\n');

  const spinner = new Spinner({
    text: 'Waiting... %s',
    stream: process.stdout,
    onTick: function (msg) {
      this.clearLine(this.stream);
      this.stream.write(chalk.cyan(msg));
    },
  });

  spinner.start();

  let done = false;
  let lastSyncJobStatus;

  do {
    lastSyncJobStatus = await j1Client.fetchSyncJobStatus({ syncJobId });

    spinner.setSpinnerTitle(
      `Job status: ${chalk.bold(lastSyncJobStatus.job.status)}`
    );
    done = lastSyncJobStatus.job.done;
    if (!done) {
      await sleep(1000);
    }
  } while (!done);

  spinner.stop(true);

  printSyncJobReport(lastSyncJobStatus.job, [
    'numEntitiesUploaded',
    'numEntitiesCreated',
    'numEntitiesUpdated',
    'numEntitiesDeleted',
    'numEntityCreateErrors',
    'numEntityUpdateErrors',
    'numEntityDeleteErrors',
    'numRelationshipsUploaded',
    'numRelationshipsCreated',
    'numRelationshipsUpdated',
    'numRelationshipsDeleted',
    'numRelationshipCreateErrors',
    'numRelationshipUpdateErrors',
    'numRelationshipDeleteErrors',
  ]);

  if (lastSyncJobStatus.job.status === SyncJobStatus.FINISHED) {
    console.log(chalk.bold.green('Publish complete!'));
  } else {
    console.log(
      chalk.bold.red('Publish failed!') +
        chalk.red(` Status: ${lastSyncJobStatus.job.status}`)
    );
  }
}

// ensure user supplied necessary params
async function validateInputs(program: ProgramInput) {
  if (!program.account || program.account === '') {
    error.fatal('Missing -a|--account input!', EUSAGEERROR);
  }

  if (!program.apiToken) {
    error.fatal('Missing --api-token input!', EUSAGEERROR);
  }

  if (!program.config || program.config === '') {
    error.fatal('Missing -c|--config input!', EUSAGEERROR);
  }
}

// ensure docs are built and config.json is valid
async function validatePSPDependencies(program: ProgramInput) {
  if (program.noninteractive) {
    process.stdout.write('Validating inputs... ');
  } else {
    console.log('Validating inputs...');
  }
  if (!fs.existsSync(program.templates!)) {
    error.fatal(
      `Could not find templates directory (${program.templates}). Make sure you have built your PSP ` +
        "docs, and/or specify the correct path with '--templates'."
    );
  }
  if (!fs.existsSync(program.config!)) {
    error.fatal(
      `Could not find config file (${program.config}). Specify the correct path with '--config'.`
    );
  }
  const config = parseJsonFile(program.config!);
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
  const tmplDirStats = fs.statSync(program.templates!);
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

function initializeJ1Client(program: ProgramInput) {
  const j1Options: J1Options = {
    accountId: program.account!,
    targetEnvironment: process.env.J1_TARGET_ENV as JupiterOneEnvironment,
    apiKey: program.apiToken!,
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

async function collectGraphObjectIdsForQueryHelper(
  j1Client: JupiterOneClient,
  basequery: string
) {
  const idSet = new Set<string>();

  let hasMore: boolean;
  let skip = 0;
  const limit = 250;
  do {
    const query = `${basequery} ${skip ? `SKIP ${skip}` : ''} LIMIT ${limit}`;
    const items = await j1Client.queryForEntityTableList(query);
    for (const item of items) {
      const id = item['a._id'] as string;
      idSet.add(id);
    }
    hasMore = items.length !== 0;
    skip += limit;
  } while (hasMore);
  return [...idSet];
}

async function migrateOldSecurityEntitiesToSyncScope(
  j1Client: JupiterOneClient
) {
  const entityTypes: SecurityEntityType[] = [
    'security_policy',
    'security_procedure',
    'security_document',
  ];

  console.log('Checking for security entities that need to be migrated...');
  const _idList = await collectGraphObjectIdsForQueryHelper(
    j1Client,
    `
    FIND (${entityTypes.join('|')})
    WITH _scope != '${PSP_SYNC_SCOPE}' AND _source = 'api' as a
    RETURN a._id
    `
  );

  if (!_idList.length) {
    console.log('No entities need to be migrated.');
  } else {
    console.log(
      `Found security entities that need to be migrated (count=${_idList.length}). Updating...`
    );
    const bar = new ProgressBar(':bar', {
      total: _idList.length + 1,
      clear: true,
      width: 50,
    });
    bar.tick();

    const updateEntityThrottled = pThrottle(
      async (_id: string) => {
        try {
          await j1Client.updateEntity({
            timestamp: Date.now(),
            entity: {
              _id,
              _scope: PSP_SYNC_SCOPE,
            },
          });
        } catch (err) {
          console.log(
            `Error updating entity (_id=${_id}). Error: ${err.toString()}`
          );
        }
        bar.tick();
      },
      THROTTLE_LIMIT,
      THROTTLE_INTERVAL
    );

    const promises = _idList.map(updateEntityThrottled);
    await Promise.all(promises);
    console.log('\nFinished migrating old entities.');
  }
}

async function migrateOldSecurityRelationshipsToSyncScope(
  j1Client: JupiterOneClient
) {
  console.log('Checking for security relationship that need to be migrated...');

  const implementerTypes: SecurityEntityType[] = [
    'security_procedure',
    'security_document',
  ];

  const policyType: SecurityEntityType = 'security_policy';

  const idList = await collectGraphObjectIdsForQueryHelper(
    j1Client,
    `
    FIND (${implementerTypes.join('|')}) THAT IMPLEMENTS as a ${policyType}
    WHERE a._scope != '${PSP_SYNC_SCOPE}' AND a._source = 'api'
    RETURN a._id, a._fromEntityId, a._toEntityId
    `
  );

  if (!idList.length) {
    console.log('No relationships need to be migrated.');
  } else {
    console.log(
      `Found security relationships that need to be migrated (count=${idList.length}). Updating...`
    );
    const bar = new ProgressBar(':bar', {
      total: idList.length + 1,
      clear: true,
      width: 50,
    });
    bar.tick();

    const updateRelationshipThrottled = pThrottle(
      async (_id: string) => {
        try {
          await j1Client.updateRelationship({
            timestamp: Date.now(),
            relationship: {
              _id,
              _scope: PSP_SYNC_SCOPE,
            },
          });
        } catch (err) {
          console.log(
            `Error updating relationship (_id=${_id}). Error: ${err.toString()}`
          );
        }

        bar.tick();
      },
      THROTTLE_LIMIT,
      THROTTLE_INTERVAL
    );

    const promises = idList.map(updateRelationshipThrottled);
    await Promise.all(promises);
    console.log('\nFinished migrating old relationships.');
  }
}

async function readTemplateData(
  program: ProgramInput,
  config: PolicyBuilderConfig
): Promise<TemplateData> {
  const data: TemplateData = {
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
      const tmplPath = path.join(program.templates!, element.file + '.tmpl');
      const work = async () => {
        const tmplData = await readFilePromise(tmplPath);
        data[section][element.id] = tmplData;
      };
      todos.push(work);
    }
  });
  await pAll(todos, { concurrency: MAX_CONCURRENCY });
  console.log('OK!');
  return data;
}

async function storeConfigWithAccount(
  program: ProgramInput,
  j1Client: JupiterOneClient,
  configData: PolicyBuilderConfig
) {
  const accountId = program.account!;
  const accountEntity = (await findAccountEntity(j1Client, accountId))!;

  process.stdout.write('Storing config with JupiterOne account... ');
  try {
    await j1Client.uploadEntityRawData({
      entityId: accountEntity._id,
      entryName: 'policyBuilderConfig',
      contentType: 'application/json',
      body: configData,
    });
  } catch (err) {
    throw error.fatal(
      `Error storing PSP configuration data with account (${accountId}). Error: ${
        err.stack || err.toString()
      }`
    );
  }

  console.log('OK');
  return accountEntity;
}

function buildEntityKey(options: {
  accountId: string;
  securityElementId: string;
  entityType: SecurityEntityType;
}) {
  const { accountId, securityElementId, entityType } = options;
  return `j1:${accountId}:${entityType.replace(
    /_/g,
    '-'
  )}:${securityElementId}`;
}

async function uploadEntitiesForSync(options: {
  j1Client: JupiterOneClient;
  config: PolicyBuilderConfig;
  templateData: TemplateData;
  sectionName: SectionName;
  syncJobId: string;
  accountId: string;
}) {
  const {
    j1Client,
    config,
    templateData,
    sectionName,
    syncJobId,
    accountId,
  } = options;
  const j1qlLookup: Record<
    SectionName,
    {
      type: SecurityEntityType;
      class: SecurityEntityClass[];
    }
  > = {
    policies: { type: 'security_policy', class: ['Document', 'Policy'] },
    procedures: {
      type: 'security_procedure',
      class: ['Document', 'Procedure'],
    },
    references: { type: 'security_document', class: ['Document'] },
  };

  if (!j1qlLookup[sectionName]) {
    throw new Error(`Unknown config section: ${sectionName}`);
  }

  const sectionConfig = config[sectionName];
  const adoptedItems = pickAdopted(sectionConfig);
  const entityType = j1qlLookup[sectionName].type;
  const entitiesForSync: EntityForSync[] = [];

  if (adoptedItems.length) {
    console.log(
      `Uploading ${adoptedItems.length} configured and adopted ${entityType} entities...`
    );
    for (const item of adoptedItems) {
      const entityKey = buildEntityKey({
        accountId,
        entityType,
        securityElementId: item.id,
      });

      const templateId = item.id;

      const entityForSync: EntityForSync = {
        _key: entityKey,
        _type: entityType,
        _class: j1qlLookup[sectionName].class,
        'tag.AccountName': accountId,
        id: item.id,
        name: item.id,
        title: item.name,
        displayName: item.name,
        adopted: item.adopted,
        provider: item.provider,
        summary: item.summary,
        type: item.type,
        webLink: item.webLink || null,
      };

      const rawDataBody = templateData[sectionName][templateId];
      if (rawDataBody) {
        const rawDataEntryName = `policy_template_${sectionName}_${templateId}`;
        entityForSync._rawData = {
          [rawDataEntryName]: {
            body: rawDataBody,
            contentType: 'application/json',
          },
        };
      }

      entitiesForSync.push(entityForSync);
    }

    await j1Client.uploadGraphObjectsForSyncJob({
      entities: entitiesForSync,
      syncJobId,
    });

    console.log(
      `Uploaded ${entitiesForSync.length} ${
        entitiesForSync.length === 1 ? 'entity' : 'entities'
      }`
    );
  } else {
    console.log('No adopted items. Nothing to publish.');
  }
}

async function uploadRelationshipsForSync(options: {
  j1Client: JupiterOneClient;
  config: PolicyBuilderConfig;
  accountId: string;
  syncJobId: string;
}) {
  const { j1Client, config, accountId, syncJobId } = options;
  const PROCEDURE_BY_ID_MAP: Record<
    string,
    PolicyBuilderElement | undefined
  > = {};
  const REFERENCE_BY_ID_MAP: Record<
    string,
    PolicyBuilderElement | undefined
  > = {};

  const adoptedPolicies = config.policies?.filter((policy) => {
    return policy.adopted !== false;
  });

  if (!adoptedPolicies || !adoptedPolicies.length) {
    console.log('No policies are adopted');
    return;
  }

  if (config.procedures) {
    for (const procedure of config.procedures) {
      if (procedure.adopted) {
        PROCEDURE_BY_ID_MAP[procedure.id] = procedure;
      }
    }
  }

  if (config.references) {
    for (const reference of config.references) {
      if (reference.adopted) {
        REFERENCE_BY_ID_MAP[reference.id] = reference;
      }
    }
  }

  const buildRelationship = (options: {
    policyId: string;
    policyEntityKey: string;
    implementerId: string;
  }) => {
    const { policyId, policyEntityKey, implementerId } = options;
    let implementer: PolicyBuilderElement | undefined;
    let implementerType: SecurityEntityType;
    if ((implementer = PROCEDURE_BY_ID_MAP[implementerId])) {
      implementerType = 'security_procedure';
    } else if ((implementer = REFERENCE_BY_ID_MAP[implementerId])) {
      implementerType = 'security_document';
    } else {
      return undefined;
    }

    const implementerKey = buildEntityKey({
      accountId,
      entityType: implementerType,
      securityElementId: implementer.id,
    });

    const relationshipKey = `j1:${accountId}:procedure-implements-policy:${implementerId}:${policyId}`;

    const relationshipForSync: RelationshipForSync = {
      _class: 'IMPLEMENTS',
      _key: relationshipKey,
      _type: 'procedure|implements|policy',
      _fromEntityKey: implementerKey,
      _toEntityKey: policyEntityKey,
    };

    return relationshipForSync;
  };

  const relationshipsForSync: RelationshipForSync[] = [];

  for (const policy of adoptedPolicies) {
    if (policy.procedures) {
      const policyEntityKey = buildEntityKey({
        accountId,
        entityType: 'security_policy',
        securityElementId: policy.id,
      });
      for (const implementerId of policy.procedures) {
        const relationshipForSync = buildRelationship({
          policyId: policy.id,
          policyEntityKey,
          implementerId: implementerId,
        });
        if (relationshipForSync) {
          relationshipsForSync.push(relationshipForSync);
        }
      }
    }
  }

  await j1Client.uploadGraphObjectsForSyncJob({
    relationships: relationshipsForSync,
    syncJobId,
  });

  console.log(
    `Uploaded ${relationshipsForSync.length} ${
      relationshipsForSync.length === 1 ? 'relationship' : 'relationships'
    }`
  );

  // const implementingSectionNames: SectionName[] = [
  //   "procedures",
  //   'references'
  // ];
  // const policyEntityType: SecurityEntityType = 'security_policy';
  // for (const sectionName of implementingSectionNames) {
  //   const targetEntityKey = `j1:${accountId}:${policyEntityType.replace(
  //     /_/g,
  //     '-'
  //   )}:${item.id}`;
  // }
  // if (!shouldUpdateRelationships) {
  //   return;
  // }
  // const rels = (
  //   await j1Client.queryForGraphObjectTable(
  //     'find (security_procedure|security_document) that IMPLEMENTS as edge security_policy return edge'
  //   )
  // ).map((v) => v.edge);
  // console.log(`Found ${rels.length} existing IMPLEMENTS relationships...`);
  // process.stdout.write('Analyzing entity relationships...');
  // const pspEntities = await j1Client.queryForEntityList(
  //   'find (security_policy|security_procedure|security_document)'
  // );
  // const allPolicyImplementorEntities: Entity[] = [];
  // const allPolicyEntities: Entity[] = [];
  // pspEntities.map((entity) => {
  //   if (entity._type.includes('security_policy')) {
  //     allPolicyEntities.push(entity);
  //   } else {
  //     allPolicyImplementorEntities.push(entity);
  //   }
  // });
  // console.log('OK!');
  // console.log(
  //   `Publishing ${allPolicyImplementorEntities.length} relationships... `
  // );
  // const bar = new ProgressBar(':bar', {
  //   total: allPolicyImplementorEntities.length + 1,
  //   clear: true,
  //   width: 50,
  // });
  // bar.tick();
  // const throttled = pThrottle(
  //   async (policy: Entity, implementor: Entity) => {
  //     const relKey = `j1:${accountId}:procedure-implements-policy:${implementor.id}:${policy.id}`;
  //     const relType = 'procedure|implements|policy';
  //     const relClass = 'IMPLEMENTS';
  //     await j1Client.createRelationship({
  //       timestamp: Date.now(),
  //       relationship: {
  //         _key: relKey,
  //         _type: relType,
  //         _class: relClass,
  //         _fromEntityId: implementor._id,
  //         _toEntityId: policy._id,
  //         displayName: relClass,
  //       },
  //     });
  //     bar.tick();
  //   },
  //   THROTTLE_LIMIT,
  //   THROTTLE_INTERVAL
  // );
  // for (const policy of allPolicyEntities) {
  //   // find config for current policy, which contains an array of procedures/references that implement it...
  //   const policyConfig = config.policies?.find((p) => p.id === policy.id);
  //   if (!policyConfig) {
  //     console.warn(
  //       `Unable to find a matching policy configuration in '${program.config}' for existing graph entity '${policy.id}'. Ignored.`
  //     );
  //     continue;
  //   }
  //   // get array of entities that implement the current policy entity...
  //   const implementors = allPolicyImplementorEntities.filter(
  //     (i) => policyConfig.procedures?.includes(i.id as string) === true
  //   );
  //   for (const implementor of implementors) {
  //     await throttled(policy, implementor);
  //   }
  // }
}

async function readFilePromise(filePath: string) {
  return fsPromises.readFile(filePath, { encoding: 'utf8' });
}

// async function getFileUpdatedTimePromise(filePath: string) {
//   const stats = await fsPromises.stat(filePath);
//   return stats.mtime;
// }

// function templateDataUpsertBuilder(
//   j1Client: JupiterOneClient,
//   templateData: TemplateData,
//   configSection: SectionName,
//   templateId: string
// ) {
//   return async (entityId: string) => {
//     const name = `policy_template_${configSection}_${templateId}`;
//     try {
//       await j1Client.uploadEntityRawData({
//         entityId,
//         entryName: name,
//         contentType: 'text/html',
//         body: templateData.data[configSection][templateId],
//       });
//     } catch (err) {
//       error.warn(
//         `Error storing PSP template data (${configSection}/${templateId}). Error: ${
//           err.stack || err.toString()
//         }`
//       );
//     }
//   };
// }
