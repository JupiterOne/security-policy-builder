import test from 'ava';
const render = require('../../lib/render');
const fs = require('fs-extra');

const tfile = 'test/fixtures/templates/test.tmpl';

test('fillTemplate fills a template file with config data', t => {
  const config = {
    color: 'orange',
    adjective: 'mighty'
  };
  const rendered = render.test.fillTemplate(tfile, config);
  t.is(
    rendered,
    'the quick orange fox jumps over the mighty dog.'
  );
});

test('renderTemplateFile writes the filled data to an output path', async t => {
  const config = {};
  await render.renderTemplateFile(tfile, config, 'foo/test');
  t.is(
    true,
    fs.existsSync('./foo/test')
  );
  fs.removeSync('./foo');
});

test('mergeAutomaticPSPVars sets a defaultRevision', t => {
  const merged = render.test.mergeAutomaticPSPVars({});
  t.is(
    true,
    (merged.organization || {}).hasOwnProperty('defaultRevision')
  );
});
