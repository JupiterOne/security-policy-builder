import * as render from '~/src/render';
import { promises as fsPromises } from 'fs';
import { Organization, PolicyBuilderConfig } from '~/src/types';

const tfile = 'test/fixtures/templates/test.tmpl';

test('fillTemplate fills a template file with config data', async () => {
  const config = {
    color: 'orange',
    adjective: 'mighty',
  } as Organization;
  const rendered = render.test.fillTemplate(tfile, config);
  expect(rendered).toBe('the quick orange fox jumps over the mighty dog.');
});

test('renderTemplateFile writes the filled data to an output path', async () => {
  const config = {};
  await render.renderTemplateFile(tfile, config, './foo/test');
  expect((await fsPromises.stat('./foo/test')).isFile()).toBe(true);
  await fsPromises.rmdir('./foo', {
    recursive: true,
  });
});

test('mergeAutomaticPSPVars sets a defaultRevision', async () => {
  const merged = render.test.mergeAutomaticPSPVars({} as PolicyBuilderConfig);
  expect(merged.organization.defaultRevision).toBe('2020.1');
});
