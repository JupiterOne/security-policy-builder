import test from 'ava';

const path = require('path');
const execFile = require('child_process').execFile;
const fs = require('fs-extra');

const pkg = require('../../package');
const moduleVersion = pkg.version;
const cli = path.join(__dirname, '../..', pkg.bin);

const fixturesDir = path.join(__dirname, '../fixtures');
const templatesDir = path.join(fixturesDir, 'templates');
const { DEFAULT_TEMPLATES } = require('../../lib/constants');
const defaultTemplatesDir = path.join(__dirname, '../../', DEFAULT_TEMPLATES);

test.before(t => {
  const failedTestDirs = fs.readdirSync(fixturesDir).filter(dir => { return dir.match(/test_[a-z0-9]+/); });
  failedTestDirs.forEach(dir => {
    fs.removeSync(path.join(fixturesDir, dir));
  });
});

test.beforeEach(t => {
  t.context.workDir = path.join(fixturesDir, 'test_' + Math.random().toString(36).substring(2, 5));
  fs.mkdirpSync(t.context.workDir);
});

test.afterEach(t => {
  fs.removeSync(t.context.workDir);
});

test.cb('psp-builder shows module version when run with --version', t => {
  execFile(cli, ['build', '--version'], { cwd: t.context.workDir }, function (err, stdout, stderr) {
    if (err) {
      t.fail(err);
    } else {
      t.is(stdout.trim(), moduleVersion);
    }
    t.end();
  });
});

test.cb('psp-builder errors if optional config file is not valid JSON', t => {
  execFile(cli, ['build', '--config', '/not/a/valid/file'], { cwd: t.context.workDir }, function (err, stdout, stderr) {
    if (!err) {
      t.fail(`Expected to fail with: ${cli} --config /not/a/valid/file`);
    } else {
      t.pass();
    }
    t.end();
  });
});

test.cb('psp-builder errors if --noninteractive is given with insufficient --config JSON', t => {
  const jsonFile = path.join(__dirname, '../fixtures/empty_config.json');
  execFile(cli, ['build', '--noninteractive', '-c', jsonFile], { cwd: t.context.workDir }, function (err, stdout, stderr) {
    if (!err) {
      t.fail('non-zero rc', 'rc 0', `Expected to fail with: ${cli} -s -c ${jsonFile}`);
    } else {
      t.pass();
    }
    t.end();
  });
});

test.cb('psp-builder fails when unable to write to output dir', t => {
  const jsonFile = path.join(fixturesDir, 'populated_config.json');
  execFile(cli, ['build', '-n', '-c', jsonFile, '-o', '/dev/null', '-t', templatesDir], { cwd: t.context.workDir }, function (err, stdout, stderr) {
    if (!err) {
      t.fail(`Expected to fail with: ${cli} --config ${jsonFile} -o /dev/null`);
    } else {
      t.pass();
    }
    t.end();
  });
});

test.cb('psp-builder exposes templates dir on first use', t => {
  const exposedDir = path.join(t.context.workDir, 'templates');
  if (fs.pathExistsSync(exposedDir)) {
    t.fail('Unexpected presence of templates dir prior to first use of psp builder.');
    t.end();
  }

  const jsonFile = path.join(fixturesDir, 'populated_config.json');
  execFile(cli, ['build', '-n', '-c', jsonFile, '-t', defaultTemplatesDir], { cwd: t.context.workDir }, function (err, stdout, stderr) {
    if (err) {
      t.fail(err);
      t.end();
    }

    if (!fs.pathExistsSync(exposedDir)) {
      t.fail(`Expected to find ${exposedDir} dir.`);
    } else {
      t.pass();
    }

    t.end();
  });
});
