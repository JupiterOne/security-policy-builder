const configure = require('../configure');
const moment = require('moment');
const render = require('../render');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs-extra');

const { DEFAULT_TEMPLATES } = require('../constants');

function bulletList (items) {
  let list = '';
  items.forEach(item => {
    list += ` * ${item}\n`;
  });
  return list;
}

function print (msg, error = false) {
  if (process.env.NODE_ENV !== 'test') {
    console.log(msg);
  }
}

function printError (msg) {
  if (process.env.NODE_ENV !== 'test') {
    console.error(msg);
  }
}

function validateOrgValues (values) {
  const missing = configure.missingOrganizationValues(values);
  let valid = true;

  if (missing.length !== 0) {
    print(chalk.red(`Missing the following configuration value(s):\n${bulletList(missing)}`));
    valid = false;
  }

  const emptyValues = configure.missingOrEmptyOrganizationValues(values)
    .map(x => x.name);

  if (emptyValues.length !== 0) {
    checkPrivSecOfficers(values, emptyValues);
    print(chalk.yellow(`The following configuration value(s) are blank:\n${bulletList(emptyValues)}`));
    valid = false;
  }

  return valid;
}

function checkPrivSecOfficers (values, emptyValues) {
  if (emptyValues.filter(e => e.match(/privacy|securityOfficerName/)).length > 0) {
    let note = 'A Security Officer and a Privacy Officer must both be assigned.\n';
    note += 'NOTE: It can be the same person fulfilling both roles.\n';
    note += `Security Officer: '${values.securityOfficerName}'\n`;
    note += `Privacy Officer: '${values.privacyOfficerName}'\n\n`;
    print(chalk.yellow(note));
  }
}

function questions (standard) {
  standard = standard.replace(/[^a-z]/gi, '').toLowerCase();
  return require(`./${standard}/questions`).list;
}

async function generateReport (orgVars, standard, paths) {
  const standardBaseName = standard.toLowerCase().replace(/ /g, '-');
  const standardTemplateName = standardBaseName + '.md.tmpl';
  const templateFile = path.join(paths.templates, 'assessments', standardTemplateName);
  const reportFileName = standardBaseName + '-' + moment(orgVars.date).format('YYYYMMDD-HHmmss') + '.md';
  const outputPath = path.join(paths.output, reportFileName);

  let renderedFile;
  try {
    await fs.mkdirs(paths.output);
    renderedFile = await render.renderTemplateFile(templateFile, orgVars, outputPath);
    print(chalk.grey(`generated report: ${renderedFile}`));
  } catch (err) {
    printError(chalk.yellow(err.message));
  }
}

function generatePolicyTOC (config) {
  const toc = render.generateTOC(config);

  let genStr = '';
  toc.forEach(policy => {
    if (policy.name.match(/Appendix/)) {
      return;
    }
    genStr += `${policy.name}\n`;
  });
  return genStr;
}

function generateStandardControlsLookup (standardName, controlsMapping) {
  const lookup = {};
  controlsMapping.procedures.forEach(control => {
    const implementsStandard = control.implements.filter(
      i => i.standard.toUpperCase() === standardName.toUpperCase()
    ).pop();
    if (!implementsStandard) {
      return;
    }
    implementsStandard.requirements.forEach(requirement => {
      lookup[requirement] = lookup[requirement] || [];
      lookup[requirement].push(control.id);
    });
  });
  return lookup;
}

async function calculateCPGaps (standardName, config, paths) {
  const standardsDataDir = (paths && paths.templates)
    ? path.join(paths.templates, 'standards')
    : path.join(__dirname, '../../', DEFAULT_TEMPLATES, 'standards');
  const standard = require(path.join(standardsDataDir, standardName.toLowerCase()));
  const controlsMapping = require(path.join(standardsDataDir, 'controls-mapping'));
  const controlsLookup = generateStandardControlsLookup(standardName, controlsMapping);
  const cpGaps = [];
  const annotatedRefs = [];

  standard.sections.forEach(section => {
    annotatedRefs[section.title] = [];

    section.requirements.forEach(requirement => {
      // check if requirement has conditional applicability
      if (requirement.appliesIf) {
        const booleanFlag = requirement.appliesIf;
        if (config.organization[booleanFlag] === true) {
          requirement.hasGap = true; // annotate requirement object with gap
          cpGaps.push(requirement);
        }
        annotatedRefs[section.title].push(requirement);
        return;
      }

      const cps = controlsLookup[requirement.ref];

      if (!cps || cps.length === 0) {
        const errmsg = `No ${standardName.toUpperCase()} controls or procedures mapping found for requirement ${requirement.ref} (${requirement.title})`;
        printError(chalk.red(errmsg));
        return;
      }

      // compare adopted configured-cps to standards-mapped cps
      const { unAdoptedCPs, adoptedCPs } = controlAdoptionFilter(cps, config);

      if (adoptedCPs.length === 0) {
        requirement.noadoption = true;
        requirement.hasGap = true;
      }

      if (unAdoptedCPs.length > 0) {
        requirement.hasGap = true;
      }

      if (requirement.hasGap) {
        cpGaps.push(requirement);
      }

      Object.assign(requirement, {unAdoptedCPs, adoptedCPs});
      annotatedRefs[section.title].push(requirement);
    });
  });

  return { cpGaps, annotatedRefs };
}

function generateStandardControlsMapping (annotatedRefs, config) {
  let mapping = '';
  const company = config.organization.companyShortName;
  Object.keys(annotatedRefs).forEach(section => {
    mapping += `### ${section}\n\n`;
    annotatedRefs[section].forEach(reference => {
      mapping += `${reference.hasGap ? '✘' : '✔'} **${reference.ref}** *${reference.title}:* ${reference.summary}\n\n`;

      // handle special-case standard references with conditional applicability
      if (reference.appliesIf) {
        mapping += reference.hasGap
          ? `> *Potential Gap:* ${company} must meet requirement`
          : `> *Not Applicable:* ${company} is not subject to requirement `;
        mapping += `${reference.ref} (${reference.title})\n\n`;
        return;
      }

      if (reference.noadoption) {
        mapping += `> *Gap:* No applicable controls or procedures have been adopted\n\n`;
        return;
      }

      mapping += `> ${company} has adopted the following controls or procedures:\n>\n`;
      reference.adoptedCPs.forEach(cp => {
        mapping += `> - ${cp.id} (${cp.name})\n`;
      });

      if (reference.unAdoptedCPs.length > 0) {
        mapping += `\n> ${company} has *NOT* adopted the following controls or procedures:\n>\n`;
        reference.unAdoptedCPs.forEach(cp => {
          mapping += `> - *Potential Gap:* ${cp.id} (${cp.name})\n`;
        });
      }

      mapping += '\n';
    });
    mapping += '----\n\n';
  });
  return mapping;
}

function controlAdoptionFilter (cpIds, config) {
  const adoptedCPs = [];
  const unAdoptedCPs = [];

  cpIds.forEach(cpId => {
    const configuredCP = config.procedures.filter(cp => cp.id === cpId)[0];
    if (!configuredCP) {
      console.warn(`Control specified in controls-mapping not found in config.json: ${cpId}`);
    } else {
      if (!configuredCP.adopted) {
        unAdoptedCPs.push(configuredCP);
      } else {
        adoptedCPs.push(configuredCP);
      }
    }
  });
  return { unAdoptedCPs, adoptedCPs };
}

// takes array of standard reference objects
// returns markdown string
function generateGapList (gaps) {
  const uniqueGaps = {};
  gaps.forEach(gap => {
    uniqueGaps[gap.ref] = gap.title;
  });

  let gapList = '';
  Object.keys(uniqueGaps).forEach(gapRef => {
    gapList += `* ${gapRef} ${uniqueGaps[gapRef]}\n`;
  });
  return gapList;
}

function generateGapSummary (gaps, config, standardName) {
  return (gaps.length === 0)
    ? `This assessment finds ${config.organization.companyShortName} has met or exceeded all requirements as specified by ${standardName.toUpperCase()}. No gaps have been identified.`
    : `This assessment finds ${config.organization.companyShortName} has compliance gaps, or has not yet adopted/implemented controls for all ${standardName.toUpperCase()} requirements.`;
}

// takes array of Risk Entities from JupiterOne
// returns markdown string
function generateRiskList (riskEntities) {
  const riskTableHeaders =
    '| Status | Priority | Impact | Probability | Risk Level |\n' +
    '| --     | --       | --     | --          | --         |\n';

  let md = 'The follow risks were identified, reviewed, or updated during the Risk Assessment:\n\n';
  riskEntities.forEach(r => {
    const e = r.entity;
    const p = r.properties;
    const description = p.description && p.description.replace(/(\r\n|\n|\r)/gm, '\n> ');
    md += `#### ${e.displayName}\n\n${p.webLink || ''}\n\n`;
    md += riskTableHeaders +
      `| ${p.status} ` +
      `| ${p.priority} ` +
      `| ${p.impact || p.riskImpact} ` +
      `| ${p.probability || p.riskProbability} ` +
      `| ${p.level || p.riskLevel} |\n\n`;
    md += `> **${p.summary || ''}**\n>\n`;
    md += `> ${description || 'No additional details.'}\n\n`;
  });
  return md;
}

module.exports = {
  calculateCPGaps,
  generateGapList,
  generateGapSummary,
  generateReport,
  generateStandardControlsMapping,
  generatePolicyTOC,
  generateRiskList,
  questions,
  validateOrgValues
};
