import commander from 'commander';
import packageJson from '~/package.json';

commander
  .version(packageJson.version, '-V, --version')
  .command('build', 'build PSP markdown documentation from templates')
  .command('assess', 'generate compliance self-assessment markdown report')
  .command('publish', 'upload PSP assets to JupiterOne')
  .parse(process.argv);
