const colors = require("./helpers/colors");
const validate = require("./helpers/validate");

exports.list = [
  {
    type: "input",
    name: "companyFullName",
    message: "Company Full Name (e.g. ACME, Inc.)",
  },
  {
    type: "input",
    name: "companyShortName",
    message: "Company Short Name (e.g. ACME)",
  },
  {
    type: "input",
    name: "companyOverview",
    message:
      "Describe the company, its products and operations (to be used in report generation)",
  },
  {
    type: "input",
    name: "companyEmailDomain",
    message: "Company email domain (without the @ sign)",
  },
  {
    type: "input",
    name: "companyMailingAddress",
    message: "Company mailing address",
  },
  {
    type: "input",
    name: "contactPhoneNumber",
    message: "Company contact phone number",
  },
  {
    type: "input",
    name: "ctoName",
    message: "Your Head of Engineering's full name",
  },
  {
    type: "input",
    name: "ctoEmail",
    message: "Your Head of Engineering's email address",
    validate: validate.email,
  },
  {
    type: "input",
    name: "cooName",
    message: "Your Chief Operating Officer's full name",
  },
  {
    type: "input",
    name: "cooEmail",
    message: "Your Chief Operating Officer's email address",
    validate: validate.email,
  },
  {
    type: "input",
    name: "ceoName",
    message: "Your Chief Executive Officer's full name",
  },
  {
    type: "input",
    name: "ceoEmail",
    message: "Your Chief Executive Officer's email address",
    validate: validate.email,
  },
  {
    type: "input",
    name: "securityOfficerName",
    message: "Your Security Officer's full name",
  },
  {
    type: "input",
    name: "securityOfficerEmail",
    message: "Your Security Officer's email address",
    validate: validate.email,
  },
  {
    type: "input",
    name: "privacyOfficerName",
    message: "Your Privacy Officer's full name",
  },
  {
    type: "input",
    name: "privacyOfficerEmail",
    message: "Your Privacy Officer's email address",
  },
  {
    type: "input",
    name: "securityCommitteeMembers",
    message:
      "List members of the Security Committee (e.g. Security Officer, Privacy Officer, CTO, COO, etc.)",
  },
  {
    type: "confirm",
    name: "needStandardHIPAA",
    message: "Do you need to be HIPAA compliant",
    default: false,
  },
  {
    type: "confirm",
    name: "needStandardHITRUST",
    message: "Are you targeting HITRUST certification",
    default: false,
  },
  {
    type: "confirm",
    name: "wantCustomMkdocsTemplate",
    message:
      "Do you want to customize the look and feel of your policy HTML output files (i.e. MkDocs styling)",
    default: false,
  },
  {
    type: "input",
    name: "mkdocsLogoURL",
    message: "Link to company logo",
    validate: validate.webURL,
    when: function (answers) {
      return answers.wantCustomMkdocsTemplate === true;
    },
  },
  {
    type: "list",
    name: "mkdocsThemeColorPrimary",
    message: `Primary theme color`,
    choices: colors.primaryColorChoices,
    when: function (answers) {
      return answers.wantCustomMkdocsTemplate === true;
    },
  },
  {
    type: "list",
    name: "mkdocsThemeColorAccent",
    message: `Accent theme color`,
    choices: colors.accentColorChoices,
    when: function (answers) {
      return answers.wantCustomMkdocsTemplate === true;
    },
  },
  {
    type: "input",
    name: "securityPolicyURL",
    message:
      "Where will publish your Security Policies (e.g. https://yourcompany.com/security)",
    validate: validate.webURL,
  },
  {
    type: "input",
    name: "privacyPolicyURL",
    message:
      "Where will publish your Privacy Policies (e.g. https://yourcompany.com/privacy)",
    validate: validate.webURL,
  },
  {
    type: "input",
    name: "privacyPolicyURL",
    message:
      "Where will publish your Cookie Policy (e.g. https://yourcompany.com/cookie-policy)",
    validate: validate.webURL,
  },
  {
    type: "input",
    name: "ticketingSystem",
    message: "Which source control system do you use (e.g. Github, Bitbucket)",
  },
  {
    type: "input",
    name: "ticketingSystem",
    message:
      "Name of ticketing system in use for issue/change management (e.g. Jira)",
  },
  {
    type: "input",
    name: "cmPortal",
    message:
      "Link to system/portal that implements the production change management ticketing and workflow",
    validate: validate.webURL,
  },
  {
    type: "input",
    name: "ciSystem",
    message:
      "Name of Continuous Integration/Build system in use (e.g. Jenkins)",
  },
  {
    type: "input",
    name: "ciSystem",
    message:
      "Name of the HR system your organization uses (e.g. Bamboo HR, EaseCentral)",
  },
  {
    type: "confirm",
    name: "haveSecurityScorecard",
    message:
      "Do you produce a periodic security metrics scorecard / executive report",
    default: false,
  },
];
