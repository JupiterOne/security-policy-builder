const test = require("ava");
const assets = require("../../lib/assets");
const fs = require("fs-extra");
const path = require("path");
const nock = require("nock");

test.beforeEach((t) => {
  const server = "https://stopmocking.me";
  t.context.logoFile = "logo.png";

  nock(server)
    .get("/" + t.context.logoFile)
    .reply(200, "logodata");

  t.context.scope = nock(server).get("/notafile.png").reply(404);

  t.context.outDir =
    "test/fixtures/downloads/" + Math.random().toString(36).substring(7);
  t.context.logoURL = `${server}/${t.context.logoFile}`;
  t.context.badLogoURL = `${server}/notafile.png`;
  t.context.outFile = path.join(
    t.context.outDir,
    "assets/images",
    t.context.logoFile
  );
  t.context.tests = [];
});

test.afterEach(async (t) => {
  t.context.scope.remove();
  await fs.remove(t.context.outDir);
});

test("assets.downloadCustomLogo downloads and saves file", async (t) => {
  const config = {
    organization: {
      wantCustomMkdocsTemplate: true,
      mkdocsLogoURL: t.context.logoURL,
    },
  };

  const paths = {
    output: t.context.outDir,
  };

  const newConfig = await assets.downloadCustomLogo(config, paths);

  t.is(true, Object.keys(config).length < Object.keys(newConfig).length);
  const stat = require("util").promisify(fs.stat);
  t.is(true, (await stat(t.context.outFile)).isFile());
});

test("assets.downloadCustomLogo sets default logo template var if no custom logo configured", async (t) => {
  const config = await assets.downloadCustomLogo({}, t.context.outDir);
  t.is("assets/images/logo.svg", config.mkdocsLogoFile);
});

test("assets.downloadCustomLogo throws error when unable to download url", async (t) => {
  const config = {
    organization: {
      wantCustomMkdocsTemplate: true,
      mkdocsLogoURL: t.context.badLogoURL,
    },
  };

  await t.throwsAsync(assets.downloadCustomLogo(config, t.context.outDir));
});

test("assets.downloadCustomLogo throws error when unable to save file", async (t) => {
  const config = {
    organization: {
      wantCustomMkdocsTemplate: true,
      mkdocsLogoURL: t.context.logoURL,
    },
  };

  const notADirectory = "/dev/null";
  await t.throwsAsync(assets.downloadCustomLogo(config, notADirectory));
});

test("assets.copyStaticAssets throws error when unable to create dir", async (t) => {
  const notADirectory = "/dev/null/dir";
  await t.throwsAsync(assets.copyStaticAssets(notADirectory));
});
