const chalk = require("chalk");

exports.fatal = fatal;

function fatal(message, code = 1) {
  console.log(chalk.red(message));
  process.exit(code);
}
