'use strict';

const program = require('commander');

program
  .version(require('../package').version, '-v, --version')
  .command('build', 'build PSP markdown documentation from templates')
  .command('assess', 'generate compliance self-assessment markdown report')
  .command('publish', 'upload PSP assets to JupiterOne')
  .parse(process.argv);
