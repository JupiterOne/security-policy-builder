import chalk from 'chalk';

export function fatal(message: string, code: number = 1) {
  console.log('\n' + chalk.red.bold(message) + '\n');
  process.exit(code);
}

export function warn(message: string) {
  console.log('\n' + chalk.yellow(message) + '\n');
}
