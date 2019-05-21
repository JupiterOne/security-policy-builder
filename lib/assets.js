'use strict';

const request = require('request-promise');
const path = require('path');
const fs = require('fs-extra');
const FileSet = require('file-set');

// download custom logo image if specified in config, and place it where mkdocs expects
// such files to live.
async function downloadCustomLogo (config, paths) {
  const org = config.organization || {};
  if (!org.wantCustomMkdocsTemplate) {
    org.mkdocsLogoFile = 'assets/images/logo.svg';
    return org; // early exit unless custom logo override is provided
  }

  const url = org.mkdocsLogoURL;
  const logoFile = path.basename(url);
  const relLogoFile = `assets/images/${logoFile}`;

  const destDir = path.join(paths.output, 'assets/images');
  const dest = path.join(destDir, logoFile);

  try {
    await fs.mkdirs(destDir);
  } catch (err) {
    throw new Error(`Unable to create output dir ${destDir}: ${err.message}`);
  }

  let data;
  try {
    data = await request.get({ uri: url, encoding: null });
  } catch (err) {
    throw new Error(`Unable to download ${url}: ${err.message}`);
  }

  try {
    await fs.writeFile(dest, data);
  } catch (err) {
    throw new Error(`Unable to save logo to ${dest}: ${err.message}`);
  }

  org.mkdocsLogoFile = relLogoFile;
  return org;
}

async function copyStaticAssets (paths) {
  try {
    await fs.mkdirs(paths.output);
  } catch (err) {
    throw new Error(`Unable to create output directory, ${paths.output}: ${err.message}`);
  }

  await fs.copy(
    path.join(__dirname, '../static/assets'),
    path.join(paths.output, 'assets')
  );

  const pdf = new FileSet(path.join(paths.templates, 'ref', '*.pdf'));
  const copyPromises = [];
  pdf.files.forEach(pdf => {
    copyPromises.push(
      fs.copy(pdf, path.join(paths.output, 'ref', path.basename(pdf)))
    );
  });
  await Promise.all(copyPromises);
}

async function writeFileAsync (filePath, content) {
  await fs.mkdirs(path.dirname(filePath));
  await fs.writeFile(filePath, content);
}

function fileExistsSync (filepath) {
  try {
    fs.accessSync(filepath);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { copyStaticAssets, downloadCustomLogo, fileExistsSync, writeFileAsync };
