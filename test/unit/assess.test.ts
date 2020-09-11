/* eslint-disable @typescript-eslint/prefer-regexp-exec */
import * as assessment from '~/src/assessment';
import path from 'path';
import { promises as fsPromises } from 'fs';
import { AssessmentInput, PolicyBuilderPaths } from '~/src/types';

test('assessment.validateOrgValues returns true when org values are populated', () => {
  const org = require('../fixtures/populated_config.json').organization;
  expect(assessment.validateOrgValues(org)).toBe(true);
});

test('assessment.validateOrgValues returns false when org values are missing', () => {
  expect(assessment.validateOrgValues({})).toBe(false);
});

test('assessment.validateOrgValues returns false when org values are blank', () => {
  const org = require('../fixtures/populated_config.json').organization;
  org.securityOfficerName = '';
  expect(assessment.validateOrgValues(org)).toBe(false);
});

test('assessment.questions returns parsed inquirer structure when valid standard is given', () => {
  expect((assessment.questions('HIPAA')[0] as any).message).toBeTruthy();
});

test('assessment.questions throws when invalid standard is given', () => {
  expect(() => {
    assessment.questions('INVALID');
  }).toThrowError();
});

test('assessment.generateReport creates a reportfile', async () => {
  const outputDir = path.join(
    __dirname,
    '../fixtures',
    'test_' + Math.random().toString(36).substring(2, 5)
  );
  const expectedOutputFile = path.join(outputDir, 'hipaa-20180704-000000.md');
  const org = {
    date: new Date('2018/07/04'),
  } as AssessmentInput;
  const paths = {
    output: outputDir,
    templates: path.join(__dirname, '../fixtures/templates'),
  } as PolicyBuilderPaths;
  await assessment.generateReport(org, 'HIPAA', paths);
  expect((await fsPromises.stat(expectedOutputFile)).isFile()).toBe(true);
  await fsPromises.rmdir(outputDir, {
    recursive: true,
  });
});

test('assessment.generateGapSummary yields positive report when there are no gaps', () => {
  const config = require('../fixtures/populated_config.json');
  expect(
    assessment
      .generateGapSummary([], config, 'HIPAA')
      .match(/^.*met or exceeded all requirements.*$/)
  ).toBeTruthy();
  expect(
    assessment
      .generateGapSummary(
        [
          {
            ref: 'x',
            title: 'y',
          },
        ],
        config,
        'HIPAA'
      )
      .match(/^.*has compliance gaps.*$/)
  ).toBeTruthy();
});

test('assessment.generateGapList yields one line of markdown per gap', () => {
  const gaps = [
    { ref: 'test', title: 'title' },
    { ref: 'test2', title: 'title2' },
  ];
  expect(assessment.generateGapList(gaps).match(/\n/g)!.length).toBe(2);
});

test('assessment.calculateCPGaps yields no gaps if all mapped standard requirements are adopted per config', async () => {
  const config = require('../fixtures/populated_config.json');
  const { cpGaps } = await assessment.calculateCPGaps('HIPAA', config, {
    output: 'output',
    partials: 'partials',
    templates: undefined,
  });
  expect(cpGaps.length).toBe(0);
});

test('assessment.calculateCPGaps yields gaps if not all mapped standard requirements are adopted per config', async () => {
  const config = require('../fixtures/populated_config.json');
  config.procedures.filter(
    (p: any) => p.id === 'cp-policy-mgmt'
  )[0].adopted = false;
  const { cpGaps } = await assessment.calculateCPGaps('HIPAA', config, {
    output: 'output',
    partials: 'partials',
    templates: undefined,
  });
  expect(cpGaps.length).toBeGreaterThan(0);
});

test('assessment.generateStandardControlsMapping shows Gaps', async () => {
  const config = require('../fixtures/populated_config.json');
  config.procedures.filter(
    (p: any) => p.id === 'cp-policy-mgmt'
  )[0].adopted = false;
  const { annotatedRefs } = await assessment.calculateCPGaps('HIPAA', config, {
    output: 'output',
    partials: 'partials',
    templates: undefined,
  });
  const mapping = assessment.generateStandardControlsMapping(
    annotatedRefs,
    config
  );
  expect(
    mapping.match(/No applicable controls or procedures have been adopted/)
  ).toBeTruthy();
});
