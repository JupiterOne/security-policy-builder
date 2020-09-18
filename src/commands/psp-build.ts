import { PolicyBuilderConfig, PolicyBuilderPaths } from '~/src/types';
import { policybuilder } from '~/src';
import pluralize from 'pluralize';
import * as configure from '~/src/configure';
import commander from 'commander';
import chalk from 'chalk';
import * as error from '~/src/error';
import path from 'path';
import fs from 'fs-extra';
import { DEFAULT_TEMPLATES } from '~/src/constants';
import packageJson from '~/package.json';

const EUSAGEERROR = 126;

type ProgramInput = {
  version?: string;
  templates?: string;
  savetemplates?: string;
  noninteractive?: boolean;
  config?: string;
  output?: string;
  partials?: string;
};

export async function run() {
  // establish root project directory so sane relative paths work
  let projectDir = process.env.PROJECT_DIR;
  if (!projectDir) {
    projectDir = path.normalize(path.join(__dirname, '../../'));
    const projectDirs = projectDir.split('/');
    if (projectDirs[projectDirs.length - 1] === 'commands') {
      projectDir = path.dirname(projectDir);
    }
  }

  const program = commander
    .version(packageJson.version, '-v, --version')
    .usage('[options]')
    .option(
      '-t, --templates [dir]',
      'optional path to existing template files.'
    )
    .option(
      '-s, --savetemplates [dir]',
      'optional path to save template files to upon first run.'
    )
    .option(
      '-n, --noninteractive',
      'exit with error if any configuration data is missing (do not prompt)'
    )
    .option('-c, --config [file]', 'optional JSON config file')
    .option('-o, --output [dir]', 'optional output directory', 'docs')
    .option(
      '-p, --partials [dir]',
      'optional path to partial files.',
      'partials'
    )
    .parse(process.argv)
    .opts() as ProgramInput;

  if (!program.templates) {
    // if unspecified via the --templates flag,
    // prefer a local 'templates' dir (as it may contain modifications),
    // default to @jupiterone/security-policy-templates NPM package if not found.
    const localTemplates = path.join(projectDir, 'templates');
    const npmTemplates = path.join(projectDir, DEFAULT_TEMPLATES);
    program.templates = fs.pathExistsSync(localTemplates)
      ? localTemplates
      : npmTemplates;
  }

  if (!program.config) {
    program.config = path.join(program.templates, 'config.json');
  }

  const paths: PolicyBuilderPaths = {
    partials: program.partials!,
    templates: program.templates,
    output: program.output!,
  };

  (Object.keys(paths) as (keyof PolicyBuilderPaths)[]).forEach((path) => {
    console.log(`${path} dir: ${paths[path]}`);
  });

  const configFile = program.config;
  console.log('config file: %j', configFile);

  let config: PolicyBuilderConfig = {
    organization: {},
  };
  try {
    config = JSON.parse(fs.readFileSync(configFile, { encoding: 'utf8' }));
  } catch (err) {
    error.fatal(
      `Unable to load configuration from ${configFile} : ${err}`,
      EUSAGEERROR
    );
  }

  const missing = configure.missingOrganizationValues(config.organization);

  if (missing.length !== 0 && program.noninteractive) {
    error.fatal(
      `missing the following configuration value(s): ${missing.toString()}`,
      EUSAGEERROR
    );
  }

  // ensure we have the configuration values we need
  config = await configure.promptForValues({
    config,
    noninteractive: program.noninteractive,
  });

  const { renderedPartials, renderedPSPDocs } = await policybuilder(
    config,
    paths
  );

  showStatus(renderedPartials);
  showStatus(renderedPSPDocs);

  await exposeTemplates(program);
}

function showStatus(items: { ok: string[]; errors: string[]; type: string }) {
  const { ok, errors, type } = items;
  const numOk = ok.length;
  const numErrors = errors.length;
  const numTotal = numOk + numErrors;
  const color = type === 'partials' ? chalk.grey : chalk.green;
  console.log(
    color(`${numOk}/${numTotal} ${pluralize(type, numOk)} processed OK`)
  );
  if (numErrors > 0) {
    console.log(chalk.yellow(`${numErrors} ${pluralize('error', numTotal)}.`));
  }
}

async function exposeTemplates(program: ProgramInput) {
  const targetDir = program.savetemplates
    ? program.savetemplates
    : path.join(process.cwd(), 'templates');
  if (!(await fs.pathExists(targetDir))) {
    await fs.copy(program.templates!, targetDir);
    console.log(`copied templates into ${targetDir} for future modification.`);
  }
}
