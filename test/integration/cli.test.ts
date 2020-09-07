/* eslint-disable @typescript-eslint/prefer-regexp-exec */
import path from 'path';
import { execFile } from 'child_process';
import fs from 'fs-extra';
import pkg from '~/package.json';
import { DEFAULT_TEMPLATES } from '~/src/constants';

const moduleVersion = pkg.version;
const cli = path.join(__dirname, '../..', pkg.bin.psp);

const fixturesDir = path.join(__dirname, '../fixtures');
const templatesDir = path.join(fixturesDir, 'templates');
const defaultTemplatesDir = path.join(__dirname, '../../', DEFAULT_TEMPLATES);

beforeAll(() => {
  const failedTestDirs = fs.readdirSync(fixturesDir).filter((dir) => {
    return dir.match(/test_[a-z0-9]+/);
  });
  failedTestDirs.forEach((dir) => {
    fs.rmdirSync(path.join(fixturesDir, dir), {
      recursive: true,
    });
  });
});

let workDir: string;
beforeEach(() => {
  workDir = path.join(
    fixturesDir,
    'test_' + Math.random().toString(36).substring(2, 5)
  );
  fs.mkdirpSync(workDir);
});

afterEach(() => {
  fs.rmdirSync(workDir, {
    recursive: true,
  });
});

test('psp-builder shows module version when run with --version', async () => {
  await new Promise((resolve, reject) => {
    execFile(cli, ['build', '--version'], { cwd: workDir }, function (
      err,
      stdout,
      stderr
    ) {
      if (err) {
        reject(err);
      } else {
        expect(stdout.trim()).toBe(moduleVersion);
        resolve();
      }
    });
  });
});

test('psp-builder errors if optional config file is not valid JSON', async () => {
  await expect(
    new Promise((resolve, reject) => {
      execFile(
        cli,
        ['build', '--config', '/not/a/valid/file'],
        { cwd: workDir },
        function (err, stdout, stderr) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    })
  ).rejects.toThrowError();
});

test('psp-builder errors if --noninteractive is given with insufficient --config JSON', async () => {
  await expect(
    new Promise((resolve, reject) => {
      const jsonFile = path.join(__dirname, '../fixtures/empty_config.json');
      execFile(
        cli,
        ['build', '--noninteractive', '-c', jsonFile],
        { cwd: workDir },
        function (err, stdout, stderr) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    })
  ).rejects.toThrowError();
});

test('psp-builder fails when unable to write to output dir', async () => {
  await expect(
    new Promise((resolve, reject) => {
      const jsonFile = path.join(fixturesDir, 'populated_config.json');
      execFile(
        cli,
        ['build', '-n', '-c', jsonFile, '-o', '/dev/null', '-t', templatesDir],
        { cwd: workDir },
        function (err, stdout, stderr) {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    })
  ).rejects.toThrowError();
});

test('psp-builder exposes templates dir on first use', async () => {
  const exposedDir = path.join(workDir, 'templates');
  expect(fs.existsSync(exposedDir)).toBe(false);
  const jsonFile = path.join(fixturesDir, 'populated_config.json');

  await new Promise((resolve, reject) => {
    execFile(
      cli,
      ['build', '-n', '-c', jsonFile, '-t', defaultTemplatesDir],
      { cwd: workDir },
      function (err, stdout, stderr) {
        if (err) {
          return reject(err);
        }
        expect(fs.statSync(exposedDir).isDirectory()).toBe(true);
        resolve();
      }
    );
  });
});
