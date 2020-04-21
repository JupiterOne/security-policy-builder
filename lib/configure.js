const questions = require("./questions/base").list;
const stripAnsi = require("strip-ansi");
const inquirer = require("inquirer");
const program = require("commander");
const chalk = require("chalk");
const fs = require("fs-extra");

// expects initial configuration object
// interactively prompts for any unconfigured organization values
// returns fully populated configuration object
async function promptForValues(config) {
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

async function promptForSecurityScorecardValues(config) {
  const securityScorecardQuestions = require("./questions/scorecard").list;
  if (config.haveSecurityScorecard === true) {
    const toAsk = missingOrEmptyOrganizationValues(
      config,
      securityScorecardQuestions
    );
    const values = await safeInquirerPrompt(toAsk);
    Object.assign(config, values);
  }

  // ensure sane default values for any unanswered questions
  config.securityScorecardPeriod = config.securityScorecardPeriod || "none";
  config.securityScorecardURL = config.securityScorecardURL || "N/A";
}

async function promptForHIPAAValues(config) {
  const hipaaQuestions = require("./questions/hipaa").list;
  if (config.needStandardHIPAA === true) {
    const toAsk = missingOrEmptyOrganizationValues(config, hipaaQuestions);
    const values = await safeInquirerPrompt(toAsk);
    Object.assign(config, values);
  }

  // ensure sane default values for any unanswered questions
  config.securityScorecardPeriod = config.securityScorecardPeriod || "none";
  config.securityScorecardURL = config.securityScorecardURL || "N/A";
}

// expects inquirer list object
// interactively prompts for all inquirer questions
// returns sanitized answers
async function safeInquirerPrompt(list) {
  if (process.env.NODE_ENV === "test") {
    return {}; // early exit to avoid inquirer, which kills AVA
  }

  // prompt for any missing values
  const answers = await inquirer.prompt(list);
  return sanitize(answers);
}

function sanitize(obj) {
  const saneObj = Object.assign({}, obj);
  Object.keys(saneObj).forEach((key) => {
    saneObj[key] = stripAnsi(saneObj[key]);
  });
  return saneObj;
}

const promptForSave = [
  {
    type: "confirm",
    name: "selected",
    message: "Save this configuration to a file",
    default: false,
  },
  {
    type: "input",
    name: "path",
    message: "path to saved file",
    when: (answers) => {
      return answers.selected === true;
    },
  },
];

// expects configuration organization object
// returns array of currently unconfigured values
function missingOrganizationValues(org = {}, values = questions) {
  return values.map((x) => x.name).filter((x) => !Object.keys(org).includes(x));
}

// expects initial configuration "organization" object
// returns array of missing inquiries
function missingOrEmptyOrganizationValues(org, values = questions) {
  const missingValues = missingOrganizationValues(org, values);
  return values.filter((q) => {
    return missingValues.includes(q.name) || org[q.name] === "";
  });
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
function getAdoptedPartials(config) {
  const partials = [];
  let policyImplementor;

  for (const policy of config["policies"]) {
    if (!policy.adopted) {
      continue;
    }
    policy.type = "policies";
    partials.push(policy);
    // policies reference procedures by id... look them up and populate partials[]
    for (const id of policy.procedures || []) {
      policyImplementor = config["procedures"].find((p) => p.id === id);
      policyImplementor && (policyImplementor.type = "procedures");
      if (!policyImplementor) {
        policyImplementor = config["references"].find((p) => p.id === id);
        policyImplementor && (policyImplementor.type = "references");
      }
      if (!policyImplementor) {
        throw new Error(
          `reference to unknown adopted procedure/reference '${id}' in policy '${policy.id}'`
        );
      }
      if (!policyImplementor.adopted) {
        continue;
      }
      partials.push(policyImplementor);
    }
  }

  for (const ref of config["references"]) {
    if (!ref.adopted) {
      continue;
    }
    ref.type = "references";
    partials.push(ref);
  }
  return partials;
}

// returns array of adopted procedure objects for a given policy id
// throws error if policy references unknown procedure id
function getAdoptedProceduresForPolicy(policyId, config) {
  const procedures = [];
  const policy = config["policies"].find((p) => p.id === policyId);
  if (!policy) {
    throw new Error(`unknown policy id ${policyId}`);
  }
  let policyImplementor;
  for (const id of policy.procedures || []) {
    policyImplementor = config["procedures"].find((p) => p.id === id);
    if (!policyImplementor) {
      policyImplementor = config["references"].find((r) => r.id === id);
    }
    if (!policyImplementor) {
      throw new Error(
        `reference to unknown procedure '${id}' in policy '${policy.id}'`
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
function mergeAutomaticPSPVars(config) {
  const defaultRevision = `${new Date().getFullYear()}.1`;
  const mergeValues = {
    defaultRevision,
  };
  Object.assign(config.organization, mergeValues);
}

// expects full config object
// returns object containing configured and adopted elements
function getAdoptedPSPElements(config) {
  const adopted = {};
  for (const element of Object.keys(config)) {
    if (element === "organization") {
      continue;
    }
    adopted[element] = config[element].filter((e) => e.adopted === true);
  }
  return adopted;
}

module.exports = {
  getAdoptedPartials,
  getAdoptedProceduresForPolicy,
  getAdoptedPSPElements,
  mergeAutomaticPSPVars,
  missingOrEmptyOrganizationValues,
  missingOrganizationValues,
  promptForValues,
  safeInquirerPrompt,
};
