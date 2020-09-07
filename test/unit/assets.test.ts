import * as assets from '~/src/assets';
import { promises as fsPromises } from 'fs';
import path from 'path';
import nock from 'nock';
import { PolicyBuilderConfig, PolicyBuilderPaths } from '~/src/types';

let context: {
  logoFile: string;
  scope: any;
  outDir: string;
  logoURL: string;
  badLogoURL: string;
  outFile: string;
};
beforeEach(() => {
  const server = 'https://stopmocking.me';
  const logoFile = 'logo.png';
  const outDir =
    'test/fixtures/downloads/' + Math.random().toString(36).substring(7);

  context = {
    logoFile,
    scope: nock(server).get('/notafile.png').reply(404),
    outDir,
    logoURL: `${server}/${logoFile}`,
    badLogoURL: `${server}/notafile.png`,
    outFile: path.join(outDir, 'assets/images', logoFile),
  };

  nock(server)
    .get('/' + context.logoFile)
    .reply(200, 'logodata');
});

afterEach(async () => {
  context.scope.remove();
  await fsPromises.rmdir(context.outDir, {
    recursive: true,
  });
});

test('assets.downloadCustomLogo downloads and saves file', async () => {
  const config = {
    organization: {
      wantCustomMkdocsTemplate: true,
      mkdocsLogoURL: context.logoURL,
    },
  };

  const paths = {
    output: context.outDir,
  } as PolicyBuilderPaths;

  const newConfig = await assets.downloadCustomLogo(config, paths);

  expect(Object.keys(config).length < Object.keys(newConfig).length).toBe(true);
  expect((await fsPromises.stat(context.outFile)).isFile()).toBe(true);
});

test('assets.downloadCustomLogo sets default logo template var if no custom logo configured', async () => {
  const config = await assets.downloadCustomLogo(
    {} as PolicyBuilderConfig,
    {
      output: context.outDir,
    } as PolicyBuilderPaths
  );
  expect(config.mkdocsLogoFile).toBe('assets/images/logo.svg');
});

test('assets.downloadCustomLogo throws error when unable to download url', async () => {
  const config = {
    organization: {
      wantCustomMkdocsTemplate: true,
      mkdocsLogoURL: context.badLogoURL,
    },
  } as PolicyBuilderConfig;

  await expect(
    assets.downloadCustomLogo(config, {
      output: context.outDir,
    } as PolicyBuilderPaths)
  ).rejects.toThrowError();
});

test('assets.downloadCustomLogo throws error when unable to save file', async () => {
  const config = {
    organization: {
      wantCustomMkdocsTemplate: true,
      mkdocsLogoURL: context.logoURL,
    },
  } as PolicyBuilderConfig;

  const notADirectory = '/dev/null';

  await expect(
    assets.downloadCustomLogo(config, {
      output: notADirectory,
    } as PolicyBuilderPaths)
  ).rejects.toThrowError();
});

test('assets.copyStaticAssets throws error when unable to create dir', async () => {
  const notADirectory = '/dev/null/dir';
  await expect(
    assets.copyStaticAssets({
      output: notADirectory,
      templates: notADirectory,
    } as PolicyBuilderPaths)
  ).rejects.toThrowError();
});
