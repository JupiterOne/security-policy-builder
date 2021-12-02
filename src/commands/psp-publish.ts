import chalk from 'chalk';
import commander from 'commander';
import fs, { promises as fsPromises } from 'fs';
import { prompt } from 'inquirer';
import pAll from 'p-all';
import pMap from 'p-map';
import path from 'path';
import packageJson from '~/package.json';
import * as error from '~/src/error';
import {
  createJupiterOneClient,
  J1Options,
  JupiterOneClient,
  JupiterOneEnvironment,
} from '~/src/j1';
import publishToConfluence, {
  PublishToConfluenceOptions,
} from '~/src/publishToConfluence';
import {
  PolicyBuilderConfig,
  PolicyBuilderElement,
  SectionName,
  TemplateData,
} from '~/src/types';

const EUSAGEERROR = 126;
const MAX_CONCURRENCY = 4;

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

  try {
    await pMap(
      config.policies,
      (p: PolicyBuilderElement) =>
        upsertPolicy({
          program,
          j1Client,
          policy: p,
          templates: templateData,
          config,
        }),
      { concurrency: MAX_CONCURRENCY }
    );
    console.log('Verifying the order of all policies and procedures...');
    await j1Client.reorderItems({
      mapping: {
        policies: config.policies.map((p: PolicyBuilderElement) => ({
          id: p.id,
          procedures: p.procedures || [],
        })),
      },
    });
  } catch (err) {
    error.fatal(
      `Error publishing policies and procedures. Error: ${
        err.stack || err.toString()
      }`
    );
  }
  console.log('All items were successfully published');
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

async function readTemplateData(
  program: ProgramInput,
  config: PolicyBuilderConfig
): Promise<TemplateData> {
  const data: TemplateData = {
    policies: {},
    procedures: {},
    references: {},
  };

  const todos: (() => Promise<void>)[] = [];
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

async function upsertPolicy({
  j1Client,
  policy,
  templates,
  config,
}: {
  program: ProgramInput;
  j1Client: JupiterOneClient;
  policy: PolicyBuilderElement;
  templates: TemplateData;
  config: any;
}) {
  const template = templates.policies[policy.id];
  const { uuid } = await j1Client.upsertPolicy({
    data: {
      id: policy.id,
      file: policy.file,
      title: policy.name as string,
      template,
    },
  });
  console.log(`Upserted policy: ${policy.id}`);
  const isRef = policy.id === 'ref';

  const upsertProcedureViaJ1Client = async (procedureId: string) => {
    const procedure = ((isRef
      ? config.references
      : config.procedures) as PolicyBuilderElement[]).find(
      (procedure) => procedure.id === procedureId
    );
    if (!procedure) {
      throw error.fatal(`Unable to find procedure with id: ${procedureId}`);
    }
    const template = (isRef ? templates.references : templates.procedures)[
      procedure.id
    ];

    await j1Client.upsertProcedure({
      data: {
        policyId: uuid,
        id: procedure.id,
        isRef,
        template,
        file: procedure.file,
        name: procedure.name as string,
        provider: procedure.provider,
        applicable: procedure.applicable,
        adopted: procedure.adopted,
        summary: (procedure.summary as string) || '',
      },
    });

    console.log(
      `Upserted ${isRef ? 'reference' : 'procedure'}: ${procedureId}`
    );
  };

  await pMap(policy.procedures as string[], upsertProcedureViaJ1Client, {
    concurrency: MAX_CONCURRENCY,
  });
}

async function storeConfigWithAccount(
  program: ProgramInput,
  j1Client: JupiterOneClient,
  configData: PolicyBuilderConfig
) {
  const accountId = program.account!;
  process.stdout.write('Storing config with JupiterOne account... ');
  try {
    const result = await j1Client.updateConfig({
      values: configData.organization,
    });
    console.log('OK');
    return result;
  } catch (err) {
    throw error.fatal(
      `Error storing PSP configuration data with account (${accountId}). Error: ${
        err.stack || err.toString()
      }`
    );
  }
}

async function readFilePromise(filePath: string) {
  return fsPromises.readFile(filePath, { encoding: 'utf8' });
}
