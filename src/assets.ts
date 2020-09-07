import path from 'path';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import { PolicyBuilderConfig, PolicyBuilderPaths } from '~/src/types';

const FileSet = require('file-set');

// download custom logo image if specified in config, and place it where mkdocs expects
// such files to live.
async function downloadCustomLogo(
  config: PolicyBuilderConfig,
  paths: PolicyBuilderPaths
) {
  const org = config.organization || {};
  if (!org.wantCustomMkdocsTemplate) {
    org.mkdocsLogoFile = 'assets/images/logo.svg';
    return org; // early exit unless custom logo override is provided
  }

  const url = org.mkdocsLogoURL!;
  const logoFile = path.basename(url);
  const relLogoFile = `assets/images/${logoFile}`;

  const destDir = path.join(paths.output, 'assets/images');
  const dest = path.join(destDir, logoFile);

  try {
    await fs.mkdirs(destDir);
  } catch (err) {
    throw new Error(`Unable to create output dir ${destDir}: ${err.message}`);
  }

  let inputStream: NodeJS.ReadableStream;
  try {
    const response = await fetch(url, {
      method: 'GET',
    });
    if (response.status !== 200) {
      throw new Error(`Non-200 status code (status=${response.status})`);
    }
    inputStream = response.body;
  } catch (err) {
    throw new Error(`Unable to download ${url}: ${err.message}`);
  }

  const outputStream = fs.createWriteStream(dest);

  try {
    await new Promise((resolve, reject) => {
      inputStream.on('error', reject);
      outputStream.on('error', reject);
      outputStream.on('finish', resolve);
      inputStream.pipe(outputStream);
    });
  } catch (err) {
    throw new Error(`Unable to save logo to ${dest}. Error: ${err.toString()}`);
  }

  org.mkdocsLogoFile = relLogoFile;
  return org;
}

async function copyStaticAssets(paths: PolicyBuilderPaths) {
  try {
    await fs.mkdirs(paths.output);
  } catch (err) {
    throw new Error(
      `Unable to create output directory, ${paths.output}: ${err.message}`
    );
  }

  await fs.copy(
    path.join(__dirname, '../static/assets'),
    path.join(paths.output, 'assets')
  );

  const pdf = new FileSet(path.join(paths.templates!, 'ref', '*.pdf'));
  const copyPromises: Promise<void>[] = [];
  pdf.files.forEach((pdf: string) => {
    copyPromises.push(
      fs.copy(pdf, path.join(paths.output, 'ref', path.basename(pdf)))
    );
  });
  await Promise.all(copyPromises);
}

async function writeFileAsync(filePath: string, content: string) {
  await fs.mkdirs(path.dirname(filePath));
  await fs.writeFile(filePath, content);
}

function fileExistsSync(filepath: string) {
  try {
    fs.accessSync(filepath);
    return true;
  } catch (e) {
    return false;
  }
}

export { copyStaticAssets, downloadCustomLogo, fileExistsSync, writeFileAsync };
