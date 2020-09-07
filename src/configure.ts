// import {questions} from "./questions/base");
import stripAnsi from 'strip-ansi';
import inquirer, {
  ConfirmQuestion,
  InputQuestion,
  QuestionCollection,
} from 'inquirer';
import program from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import { baseQuestions } from './questions/base';
import { scorecardQuestions } from './questions/scorecard';
import { hipaaQuestions } from './questions/hipaa';
import {
  Organization,
  PolicyBuilderConfig,
  AdoptedPolicyBuilderElements,
  PolicyBuilderElement,
  PolicyBuilderPartial,
  PolicyBuilderPartialType,
} from '~/src/types';
import pickAdopted from '~/src/util/pickAdopted';

// expects initial configuration object
// interactively prompts for any unconfigured organization values
// returns fully populated configuration object
async function promptForValues(config: PolicyBuilderConfig) {
  // prompt for any missing values
  const answers = await safeInquirerPrompt(
    missingOrEmptyOrganizationValues(config.organization)
  );
  Object.assign(config.organization, answers);

  // conditionally prompt for additional details
  await promptForSecurityScorecardValues(config.organization);
  await promptForHIPAAValues(config.organization);

  // display config
  console.log(JSON.stringify(config.organization, null, 2));

  // conditionally confirm and save configuration
  if (!program.noninteractive) {
    const save = await inquirer.prompt(promptForSave);
    if (save.selected) {
      try {
        await fs.writeFile(save.path, JSON.stringify(config, null, 2));
        console.log(chalk.green(`saved configuration to ${save.path}`));
      } catch (err) {
        console.log(
          chalk.yellow(`Unable to save configuration to ${save.path}: ${err}`)
        );
      }
    }
  }

  mergeAutomaticPSPVars(config);
  return config;
}

async function promptForSecurityScorecardValues(config: Organization) {
  if (config.haveSecurityScorecard === true) {
    const toAsk = missingOrEmptyOrganizationValues(config, scorecardQuestions);
    const values = await safeInquirerPrompt(toAsk);
    Object.assign(config, values);
  }

  // ensure sane default values for any unanswered questions
  config.securityScorecardPeriod = config.securityScorecardPeriod || 'none';
  config.securityScorecardURL = config.securityScorecardURL || 'N/A';
}

async function promptForHIPAAValues(config: Organization) {
  if (config.needStandardHIPAA === true) {
    const toAsk = missingOrEmptyOrganizationValues(config, hipaaQuestions);
    const values = await safeInquirerPrompt(toAsk);
    Object.assign(config, values);
  }

  // ensure sane default values for any unanswered questions
  config.securityScorecardPeriod = config.securityScorecardPeriod || 'none';
  config.securityScorecardURL = config.securityScorecardURL || 'N/A';
}

// expects inquirer list object
// interactively prompts for all inquirer questions
// returns sanitized answers
async function safeInquirerPrompt(list: QuestionCollection<any>) {
  if (process.env.NODE_ENV === 'test') {
    return {}; // early exit to avoid inquirer, which kills AVA
  }

  // prompt for any missing values
  const answers = await inquirer.prompt(list);
  return sanitize(answers);
}

function sanitize(obj: Record<string, string>) {
  const saneObj = { ...obj };
  Object.keys(saneObj).forEach((key) => {
    saneObj[key] = stripAnsi(saneObj[key]);
  });
  return saneObj;
}

const promptForSave: (ConfirmQuestion | InputQuestion)[] = [
  {
    type: 'confirm',
    name: 'selected',
    message: 'Save this configuration to a file',
    default: false,
  },
  {
    type: 'input',
    name: 'path',
    message: 'path to saved file',
    when: (answers) => {
      return answers.selected === true;
    },
  },
];

// expects configuration organization object
// returns array of currently unconfigured values
function missingOrganizationValues(org = {}, values = baseQuestions): string[] {
  const orgKeys = Object.keys(org);

  return values.map((x) => x.name).filter((x) => !orgKeys.includes(x));
}

// expects initial configuration "organization" object
// returns array of missing inquiries
function missingOrEmptyOrganizationValues(
  org: Organization,
  values = baseQuestions
) {
  const missingValues = missingOrganizationValues(org, values);
  return values.filter((q) => {
    return missingValues.includes(q.name) || org[q.name] === '';
  });
}

function buildPartial(
  element: PolicyBuilderElement,
  partialType: PolicyBuilderPartialType
) {
  const { type, ...properties } = element;
  const partial: PolicyBuilderPartial = {
    ...properties,
    type: partialType,
  };
  return partial;
}
// expects full config object
// returns array of all adopted partial objects of the form:
//   {
//     id: 'cp-policy-training',
//     file: 'procedures/cp-policy-training.md',
//     ...
//     type: 'procedures'
//   }
//
// throws error if a partial makes an illegal id reference
function getAdoptedPartials(
  config: PolicyBuilderConfig
): PolicyBuilderPartial[] {
  const partials: PolicyBuilderPartial[] = [];

  for (const policy of config.policies || []) {
    if (!policy.adopted) {
      continue;
    }

    partials.push({
      ...policy,
      type: 'policies',
    });

    for (const id of policy.procedures ?? []) {
      const byIdFilter = (p: PolicyBuilderElement) => {
        return p.id === id;
      };

      let policyImplementer:
        | PolicyBuilderElement
        | undefined = config.procedures?.find(byIdFilter);
      if (policyImplementer) {
        partials.push(buildPartial(policyImplementer, 'procedures'));
      } else if ((policyImplementer = config.references?.find(byIdFilter))) {
        partials.push(buildPartial(policyImplementer, 'references'));
      }
    }
  }

  for (const ref of config.references ?? []) {
    if (!ref.adopted) {
      continue;
    }
    partials.push(buildPartial(ref, 'references'));
  }
  return partials;
}

// returns array of adopted procedure objects for a given policy id
// throws error if policy references unknown procedure id
function getAdoptedProceduresForPolicy(
  policyId: string,
  config: PolicyBuilderConfig
) {
  const procedures = [];
  const policy = config.policies?.find((p) => p.id === policyId);
  if (!policy) {
    throw new Error(`unknown policy id ${policyId}`);
  }
  let policyImplementor;
  for (const procedure of policy.procedures ?? []) {
    policyImplementor =
      config.procedures?.find((p) => p.id === procedure) ??
      config.references?.find((r) => r.id === procedure);
    if (!policyImplementor) {
      throw new Error(
        `reference to unknown procedure '${procedure}' in policy '${policy.id}'`
      );
    }
    if (!policyImplementor.adopted) {
      continue;
    }
    procedures.push(policyImplementor);
  }
  return procedures;
}

// expects full config object
// merges additional runtime-calculated values into organization
function mergeAutomaticPSPVars(config: PolicyBuilderConfig) {
  const defaultRevision = `${new Date().getFullYear()}.1`;
  const mergeValues = {
    defaultRevision,
  };
  Object.assign(config.organization, mergeValues);
}

// expects full config object
// returns object containing configured and adopted elements
function getAdoptedPSPElements(config: PolicyBuilderConfig) {
  const adopted: AdoptedPolicyBuilderElements = {
    standards: pickAdopted(config.standards),
    policies: pickAdopted(config.policies),
    procedures: pickAdopted(config.procedures),
    references: pickAdopted(config.references),
  };
  return adopted;
}

export {
  getAdoptedPartials,
  getAdoptedProceduresForPolicy,
  getAdoptedPSPElements,
  mergeAutomaticPSPVars,
  missingOrEmptyOrganizationValues,
  missingOrganizationValues,
  promptForValues,
  safeInquirerPrompt,
};
