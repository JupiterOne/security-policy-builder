'use strict';

const JupiterOneClient = require('@jupiterone/jupiterone-client-nodejs');
const configure = require('../lib/configure');
const program = require('commander');
const { prompt } = require('inquirer');
const assessment = require('../lib/assessment');
const moment = require('moment');
const chalk = require('chalk');
const error = require('../lib/error');
const path = require('path');
const fs = require('fs-extra');

const { DEFAULT_TEMPLATES } = require('../lib/constants');
const EUSAGEERROR = 126;

// establish root project directory so sane relative paths work
let projectDir = process.env.PROJECT_DIR;
if (!projectDir) {
  projectDir = __dirname;
  const projectDirs = projectDir.split('/');
  if (projectDirs[projectDirs.length - 1] === 'commands') {
    projectDir = path.dirname(projectDir);
  }
}

program
  .version(require('../package').version, '-v, --version')
  .usage('--standard <compliance_standard> --config <file> [options]')
  .option('-s, --standard <compliance_standard>', 'compliance standard to assess against, e.g. hipaa')
  .option('-c, --config <file>', 'JSON config file')
  .option('-o, --output [dir]', 'optional output directory', 'assessments')
  .option('-t, --templates [dir]', 'optional path to template files')
  .option('-r, --include-risks', 'include items from JupiterOne Risk Register (requires -a and -u/-k to authenticate to JupiterOne account)')
  .option('-a, --account <name>', 'JupiterOne account id')
  .option('-u, --user <email>', 'JupiterOne user email')
  .option('-k, --api-token <api_token>', 'JupiterOne API token')
  .parse(process.argv);

if (!program.standard || !program.config) {
  program.outputHelp();
  process.exit(2);
}

if (!program.templates) {
  // if unspecified via the --templates flag,
  // prefer a local 'templates' dir (as it may contain modifications),
  // default to @jupiterone/security-policy-templates NPM package if not found.
  const localTemplates = path.join(projectDir, 'templates');
  const npmTemplates = path.join(projectDir, DEFAULT_TEMPLATES);
  program.templates = fs.pathExistsSync(localTemplates) ? localTemplates : npmTemplates;
} else {
  program.templates = path.resolve(program.templates);
}

const paths = {
  templates: program.templates,
  output: program.output
};

const configFile = program.config;
console.log('config file: %j', configFile);

let config = {};
try {
  config = JSON.parse(fs.readFileSync(configFile));
} catch (err) {
  error.fatal(`Unable to load configuration from ${configFile} : ${err}`, EUSAGEERROR);
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
  }

  const j1Client = await (new JupiterOneClient(j1Options)).init();
  console.log('OK!');
  return j1Client;
}

async function getRisksFromRegistry () {
  if (program.account) {
    if (!program.apiToken) {
      if (program.user) {
        await gatherPassword();
      } else {
        error.fatal('Missing -u|--user or -k|--api-token input!', EUSAGEERROR);
      }
    }

    const j1Client = await initializeJ1Client();
    return j1Client.queryV1('find Risk with _beginOn > date.now - 1year');
  }
}

async function main (config) {
  try {
    let riskList;
    if (program.includeRisks) {
      const riskEntities = await getRisksFromRegistry();
      riskList = assessment.generateRiskList(riskEntities);
    } else {
      riskList = 'Detailed risk items omitted.';
    }

    const inputs = await gatherInputs(config.organization);
    const standard = program.standard.toLowerCase();

    inputs.policyTOC = assessment.generatePolicyTOC(config);

    // tabulate gaps from input prompts
    const inputGaps = calculateInputGaps(inputs);

    // tabulate gaps in controls/procedures
    const { cpGaps, annotatedRefs } = await assessment.calculateCPGaps(standard, config, paths);

    const allGaps = inputGaps.concat(cpGaps);

    const gapSummary = assessment.generateGapSummary(allGaps, config, standard);
    const gapList = assessment.generateGapList(allGaps);
    const hipaaControlsMapping = assessment.generateStandardControlsMapping(annotatedRefs, config);
    Object.assign(inputs, {gapList, gapSummary, hipaaControlsMapping, riskList});

    console.log(`Generating ${standard.toUpperCase()} self-assessment report...`);
    await assessment.generateReport(inputs, standard, paths);
    if (allGaps.length === 0) {
      console.log(chalk.green('No gaps identified.'));
    } else {
      console.log(chalk.yellow(`Gaps identified: ${allGaps.length}. See "Gaps, Findings and Action Items" section in report.`));
    }
  } catch (err) {
    error.fatal(`Unexpected error: ${err}`);
  }
}

function calculateInputGaps (inputs) {
  const gaps = [];
  Object.keys(inputs).filter(i => i.match(/has.*Gap/)).forEach(gapBooleanKey => {
    if (inputs[gapBooleanKey]) {
      gaps.push(
        {
          ref: gapBooleanKey.match(/[A-Z][a-z]+/g).join(' '),
          title: '(see above)'
        }
      );
    }
  });
  return gaps;
}

async function gatherInputs (organizationVars) {
  if (!assessment.validateOrgValues(organizationVars)) {
    error.fatal('Please update your policy config file and re-run the policy builder before continuing with the assessment.', EUSAGEERROR);
  }

  const answers = await configure.safeInquirerPrompt(assessment.questions(program.standard));

  // invert boolean values for gap questions
  Object.keys(answers).filter(i => i.match(/has.*Gap/)).forEach(gap => { answers[gap] = !answers[gap]; });

  if (answers.hasPenTestGap) {
    ['lastPenTestDate', 'lastPenTestProvider', 'penTestFrequency', 'nextPenTestDate']
      .forEach(item => {
        answers[item] = '*TBD*';
      });
  }

  answers.date = moment();
  answers.isHIPAACoveredEntityText = (answers.isHIPAACoveredEntity) ? 'is' : 'is not';
  answers.isHIPAABusinessAssociateText = (answers.isHIPAABusinessAssociate) ? 'is' : 'is not';

  return Object.assign(organizationVars, answers);
}

main(config);
