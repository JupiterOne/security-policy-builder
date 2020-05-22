const test = require("ava");

const assessment = require("../../lib/assessment");
const path = require("path");
const fs = require("fs-extra");

test("assessment.validateOrgValues returns true when org values are populated", (t) => {
  const org = require("../fixtures/populated_config.json").organization;
  t.is(true, assessment.validateOrgValues(org));
});

test("assessment.validateOrgValues returns false when org values are missing", (t) => {
  t.is(false, assessment.validateOrgValues({}));
});

test("assessment.validateOrgValues returns false when org values are blank", (t) => {
  const org = require("../fixtures/populated_config.json").organization;
  org.securityOfficerName = "";
  t.is(false, assessment.validateOrgValues(org));
});

test("assessment.questions returns parsed inquirer structure when valid standard is given", (t) => {
  t.truthy(assessment.questions("HIPAA")[0].message);
});

test("assessment.questions throws when invalid standard is given", (t) => {
  t.throws(() => {
    assessment.questions("INVALID");
  });
});

test("assessment.generateReport creates a reportfile", async (t) => {
  const outputDir = path.join(
    __dirname,
    "../fixtures",
    "test_" + Math.random().toString(36).substring(2, 5)
  );
  const expectedOutputFile = path.join(outputDir, "hipaa-20180704-000000.md");
  const org = {
    date: new Date("2018/07/04"),
  };
  const paths = {
    templates: path.join(__dirname, "../fixtures/templates"),
    output: outputDir,
  };
  await assessment.generateReport(org, "HIPAA", paths);
  t.is(true, fs.existsSync(expectedOutputFile));
  fs.removeSync(outputDir);
});

test("assessment.generateGapSummary yields positive report when there are no gaps", (t) => {
  const config = require("../fixtures/populated_config.json");
  t.truthy(
    assessment
      .generateGapSummary([], config, "HIPAA")
      .match(/^.*met or exceeded all requirements.*$/)
  );
  t.truthy(
    assessment
      .generateGapSummary(["gap"], config, "HIPAA")
      .match(/^.*has compliance gaps.*$/)
  );
});

test("assessment.generateGapList yields one line of markdown per gap", (t) => {
  const gaps = [
    { ref: "test", title: "title" },
    { ref: "test2", title: "title2" },
  ];
  t.is(true, assessment.generateGapList(gaps).match(/\n/g).length === 2);
});

test("assessment.calculateCPGaps yields no gaps if all mapped standard requirements are adopted per config", async (t) => {
  const config = require("../fixtures/populated_config.json");
  const { cpGaps } = await assessment.calculateCPGaps("HIPAA", config);
  t.is(true, cpGaps.length === 0);
});

test("assessment.calculateCPGaps yields gaps if not all mapped standard requirements are adopted per config", async (t) => {
  const config = require("../fixtures/populated_config.json");
  config.procedures.filter((p) => p.id === "cp-policy-mgmt")[0].adopted = false;
  const { cpGaps } = await assessment.calculateCPGaps("HIPAA", config);
  t.is(true, cpGaps.length > 0);
});

test("assessment.generateStandardControlsMapping shows Gaps", async (t) => {
  const config = require("../fixtures/populated_config.json");
  config.procedures.filter((p) => p.id === "cp-policy-mgmt")[0].adopted = false;
  const { annotatedRefs } = await assessment.calculateCPGaps("HIPAA", config);
  const mapping = assessment.generateStandardControlsMapping(
    annotatedRefs,
    config
  );
  t.truthy(
    mapping.match(/No applicable controls or procedures have been adopted/)
  );
});
