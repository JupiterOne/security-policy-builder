const assets = require("./assets.js");
const configure = require("./configure.js");
const render = require("./render.js");
const path = require("path");

const defaultPaths = {
  partials: "partials",
  templates: "templates",
  output: "docs",
};

module.exports = async function policybuilder(
  configuration,
  paths = defaultPaths
) {
  configure.mergeAutomaticPSPVars(configuration);

  // marshal static assets for mkdocs
  await assets.copyStaticAssets(paths);
  await assets.downloadCustomLogo(configuration, paths);
  await render.renderMkdocsYAML(
    configuration,
    paths,
    path.join(paths.output, "mkdocs.yml")
  );
  await render.renderIndexPage(
    configuration,
    paths,
    path.join(paths.output, "index.md")
  );

  // render partials and docs
  const renderedPartials = await render.renderPartials(configuration, paths);
  const renderedPSPDocs = await render.renderPSPDocs(configuration, paths);
  return { renderedPartials, renderedPSPDocs };
};
