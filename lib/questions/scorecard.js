const validate = require('./helpers/validate');

exports.list = [
  {
    type: 'input',
    name: 'securityScorecardPeriod',
    message: 'How often do you publish updates to the scorecard? Every:'
  },
  {
    type: 'input',
    name: 'securityScorecardURL',
    message: 'Link to the published scorecard',
    validate: validate.webURL
  }
];
