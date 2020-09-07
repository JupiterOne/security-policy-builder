import chalk from 'chalk';

export function fatal(message: string, code: number = 1) {
  console.log(chalk.red(message));
  process.exit(code);
}

export function warn(message: string) {
  console.log(chalk.yellow(message));
}
