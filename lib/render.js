const configure = require('./configure');
const mustache = require('mustache');
const assets = require('./assets');
const chalk = require('chalk');
const path = require('path');
const pMap = require('p-map');
const fs = require('fs-extra');

function fillTemplate (templateFile, orgConfig) {
  return mustache.render(fs.readFileSync(templateFile, 'utf8'), orgConfig);
}

async function renderMkdocsYAML (config, paths, outputPath) {
  const ymlTemplate = path.join(paths.templates, 'mkdocs/mkdocs.yml.tmpl');

  let rendered;
  try {
    rendered = fillTemplate(ymlTemplate, config.organization);
  } catch (err) {
    throw new Error(`Unable to render ${ymlTemplate}: ${err}`);
  }

  // append pages list to rendered yml body
  rendered += generateMkdocsPages(config);

  try {
    await assets.writeFileAsync(outputPath, rendered);
    console.log(chalk.green(`saved ${outputPath}`));
  } catch (err) {
    console.log(chalk.yellow(err.message));
  }
}

async function renderTemplateFile (templateFile, orgConfig, outputPath) {
  let rendered;
  try {
    rendered = fillTemplate(templateFile, orgConfig);
  } catch (err) {
    throw new Error(`Unable to render ${templateFile}: ${err}`);
  }
  try {
    await assets.writeFileAsync(outputPath, rendered);
  } catch (err) {
    throw new Error(`Unable to save rendered template to ${outputPath}: ${err}`);
  }
  return outputPath;
}

function mergeAutomaticPSPVars (config) {
  const defaultRevision = `${new Date().getFullYear()}.1`;

  const merged = {
    organization: {
      defaultRevision
    }
  };

  Object.assign(merged, config);
  return merged;
}

async function renderPSPDocs (config, paths) {
  const status = { ok: [], errors: [], type: 'PSP Docs' };
  const adoptedElements = configure.getAdoptedPSPElements(config);

  let sectionView, partialFile, outputPath, adoptedProcedures, viewPartials;

  // assemble final .md documents from policy and procedure partials
  // TODO: add standards
  for (const policy of adoptedElements['policies']) {
    try {
      // append policy partial
      partialFile = path.join(paths.partials, policy.file);
      sectionView = await fs.readFile(partialFile, 'utf8') + '\n';

      // gather procedure partials
      adoptedProcedures = configure.getAdoptedProceduresForPolicy(policy.id, config);
      viewPartials = await pMap(adoptedProcedures, async procedure => {
        partialFile = path.join(paths.partials, procedure.file);
        return '\n' + (await fs.readFile(partialFile, 'utf8')) + '\n';
      });

      if (viewPartials.length > 0) {
        sectionView += '\n\n## Controls and Procedures\n\n';
      }

      // append procedure partials
      for (const view of viewPartials) {
        sectionView += view;
      }

      // write out assembled view
      outputPath = path.join(paths.output, path.basename(policy.file));
      await assets.writeFileAsync(outputPath, sectionView);

      console.log(chalk.green(`assembled ${outputPath}`));
      status.ok.push(outputPath);
    } catch (err) {
      status.errors.push(outputPath);
      console.error(chalk.yellow(`unable to assemble section view for policy '${policy.id}': ${err}`));
    }
  }

  // generate reference docs
  let partialConfig;
  for (const ref of adoptedElements['references']) {
    partialFile = path.join(paths.partials, ref.file);
    outputPath = path.join(paths.output, path.basename(ref.file));

    // merge partial metadata with config
    partialConfig = Object.assign({}, config.organization, ref);

    try {
      await renderTemplateFile(partialFile, partialConfig, outputPath);
      console.log(chalk.green(`generated ${outputPath}`));
      status.ok.push(outputPath);
    } catch (err) {
      status.errors.push(outputPath);
      console.error(chalk.yellow(err.message));
    }
  }
  return status;
}

async function renderPartials (config, paths) {
  const status = { ok: [], errors: [], type: 'partials' };

  config = mergeAutomaticPSPVars(config);

  // TODO: we're ignoring standards for now...
  const partialDirs = {
    policies: path.join(paths.partials, 'policies'),
    procedures: path.join(paths.partials, 'procedures'),
    references: path.join(paths.partials, 'ref')
  };

  const partials = configure.getAdoptedPartials(config);
  // generate paths to partial template files
  for (const partial of partials) {
    partial.tFile = path.join(paths.templates, `${partial.file}.tmpl`);
    if (!assets.fileExistsSync(partial.tFile)) {
      throw new Error(`configured partial template ${partial.tFile} does not exist on disk`);
    }
  }

  await pMap(partials, async partial => {
    const relPartialDir = partialDirs[partial.type];
    if (relPartialDir === undefined) {
      throw new Error(`unsupported partial path '${partial.type}' for ${partial.id}`);
    }

    // merge partial metadata with config
    const partialConfig = Object.assign({}, config.organization, partial);

    // render partial template to partials outputPath
    const outputPath = path.join(relPartialDir, path.basename(partial.file));
    try {
      await renderTemplateFile(partial.tFile, partialConfig, outputPath);
      console.log(chalk.grey(`generated ${outputPath}`));
      status.ok.push(outputPath);
    } catch (err) {
      console.error(chalk.yellow(err.message));
      status.errors.push(outputPath);
    }
  });

  return status;
}

function generateMkdocsPages (config) {
  const toc = generateTOC(config);

  let pages = 'pages:\n';

  pages += `- 'Home': 'index.md'\n`;

  toc.forEach(page => {
    pages += `- '${page.name}': '${page.file}'\n`;
  });

  return pages;
}

// returns array of { name: '', file: '' } objects
function generateTOC (config) {
  const toc = [];
  const adoptedElements = configure.getAdoptedPSPElements(config);
  adoptedElements.policies.forEach((policy, idx) => {
    toc.push({name: `${idx}. ${policy.name}`, file: path.basename(policy.file)});
  });

  adoptedElements.references.forEach((ref, idx) => {
    const al = String.fromCharCode(idx + 64 + 1); // map 0 -> A, 1 -> B, etc...
    toc.push({name: `Appendix ${al}. ${ref.name}`, file: path.basename(ref.file)});
  });

  return toc;
}

function generateIndexTemplate (config) {
  const toc = generateTOC(config);

  let indexTemplate = '# {{companyShortName}} Security Policies, Standards, and Procedures\n\n';

  toc.forEach(page => {
    indexTemplate += `* [${page.name}](${page.file})\n`;
  });

  return indexTemplate;
}

async function renderIndexPage (config, paths, outputPath) {
  const indexTemplate = generateIndexTemplate(config);

  // save generated template
  const indexTemplateFile = path.join(paths.partials, 'index.md.tmpl');
  try {
    await assets.writeFileAsync(indexTemplateFile, indexTemplate);
  } catch (err) {
    throw new Error(`Unable to save index template to ${indexTemplateFile}: ${err}`);
  }

  let renderedFile;

  try {
    renderedFile = await renderTemplateFile(indexTemplateFile, config.organization, outputPath);
    console.log(chalk.grey(`generated ${renderedFile}`));
  } catch (err) {
    console.error(chalk.yellow(err.message));
  }

  return renderedFile;
}

const test = {
  fillTemplate,
  generateIndexTemplate,
  generateMkdocsPages,
  mergeAutomaticPSPVars
};

module.exports = {
  renderIndexPage,
  renderMkdocsYAML,
  renderPSPDocs,
  renderPartials,
  renderTemplateFile,
  generateTOC,
  test
};
