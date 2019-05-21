'use strict';

const configure = require('../lib/configure');
const program = require('commander');
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
  .option('-s, --standard <compliance_standard>', 'compliance standard to assess against.')
  .option('-c, --config <file>', 'JSON config file')
  .option('-o, --output [dir]', 'optional output directory', 'assessments')
  .option('-t, --templates [dir]', 'optional path to template files.')
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

async function main (config) {
  try {
    const inputs = await gatherInputs(config.organization);
    const standard = program.standard.toLowerCase();

    inputs.policyTOC = assessment.generatePolicyTOC(config);

    // tabulate gaps from input prompts
    const inputGaps = calculateInputGaps(inputs);

    // tabulate gaps in controls/procedures
    const { cpGaps, annotatedRefs } = await assessment.calculateCPGaps(standard, config);

    const allGaps = inputGaps.concat(cpGaps);

    const gapSummary = assessment.generateGapSummary(allGaps, config, standard);
    const gapList = assessment.generateGapList(allGaps);
    const hipaaControlsMapping = assessment.generateStandardControlsMapping(annotatedRefs, config);
    Object.assign(inputs, {gapList, gapSummary, hipaaControlsMapping});

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
