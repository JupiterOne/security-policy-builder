"use strict";

const policybuilder = require("../lib/index");
const pluralize = require("pluralize");
const configure = require("../lib/configure");
const program = require("commander");
const chalk = require("chalk");
const error = require("../lib/error");
const path = require("path");
const fs = require("fs-extra");

const { DEFAULT_TEMPLATES } = require("../lib/constants");
const EUSAGEERROR = 126;

// establish root project directory so sane relative paths work
let projectDir = process.env.PROJECT_DIR;
if (!projectDir) {
  projectDir = __dirname;
  const projectDirs = projectDir.split("/");
  if (projectDirs[projectDirs.length - 1] === "commands") {
    projectDir = path.dirname(projectDir);
  }
}

program
  .version(require("../package").version, "-v, --version")
  .usage("[options]")
  .option("-t, --templates [dir]", "optional path to template files.")
  .option(
    "-n, --noninteractive",
    "exit with error if any configuration data is missing (do not prompt)"
  )
  .option("-c, --config [file]", "optional JSON config file")
  .option("-o, --output [dir]", "optional output directory", "docs")
  .option("-p, --partials [dir]", "optional path to partial files.", "partials")
  .parse(process.argv);

if (!program.templates) {
  // if unspecified via the --templates flag,
  // prefer a local 'templates' dir (as it may contain modifications),
  // default to @jupiterone/security-policy-templates NPM package if not found.
  const localTemplates = path.join(projectDir, "templates");
  const npmTemplates = path.join(projectDir, DEFAULT_TEMPLATES);
  program.templates = fs.pathExistsSync(localTemplates)
    ? localTemplates
    : npmTemplates;
}

if (!program.config) {
  program.config = path.join(program.templates, "config.json");
}

const paths = {
  partials: program.partials,
  templates: program.templates,
  output: program.output,
};

Object.keys(paths).forEach((path) => {
  console.log(`${path} dir: ${paths[path]}`);
});

const configFile = program.config;
console.log("config file: %j", configFile);

let config = {};
try {
  config = JSON.parse(fs.readFileSync(configFile));
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

async function main(config) {
  try {
    // ensure we have the configuration values we need
    config = await configure.promptForValues(config);

    const { renderedPartials, renderedPSPDocs } = await policybuilder(
      config,
      paths
    );

    showStatus(renderedPartials);
    showStatus(renderedPSPDocs);

    await exposeTemplates();
  } catch (err) {
    error.fatal(`Unexpected error: ${err}`);
  }
}

function showStatus(items) {
  const { ok, errors, type } = items;
  const numOk = ok.length;
  const numErrors = errors.length;
  const numTotal = numOk + numErrors;
  const color = type === "partials" ? chalk.grey : chalk.green;
  console.log(
    color(`${numOk}/${numTotal} ${pluralize(type, numOk)} processed OK`)
  );
  if (numErrors > 0) {
    console.log(chalk.yellow(`${numErrors} ${pluralize("error", numTotal)}.`));
  }
}

async function exposeTemplates() {
  const targetDir = path.join(process.cwd(), "templates");
  if (!(await fs.pathExists(targetDir))) {
    await fs.copy(program.templates, targetDir);
    console.log(`copied templates into ${targetDir} for future modification.`);
  }
}

main(config);
