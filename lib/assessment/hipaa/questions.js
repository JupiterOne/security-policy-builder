exports.list = [
  {
    type: 'confirm',
    name: 'hasHIPAATrainingGap',
    message: 'Did everyone in your organization receive Annual HIPAA Awareness Training?',
    default: false
  },
  {
    type: 'confirm',
    name: 'hasInfoSecTrainingGap',
    message: 'Did everyone in your organization receive at least annual training on the information security policies?',
    default: false
  },
  {
    type: 'confirm',
    name: 'hasRiskAssessmentGap',
    message: 'Have you completed an annual Risk Assessment and documented the risks and action plans in a Risk Registry?',
    default: false
  },
  {
    type: 'confirm',
    name: 'hasPenTestGap',
    message: 'Have you completed at least one Penetration Test in the last year and documented the results and remediations?',
    default: false
  },
  {
    type: 'input',
    name: 'lastPenTestDate',
    message: 'What was the date of your last Penetration Test?',
    when: function (answers) {
      return answers.hasPenTestGap === true;
    }
  },
  {
    type: 'input',
    name: 'lastPenTestProvider',
    message: 'Who performed your last Penetration Test?',
    when: function (answers) {
      return answers.hasPenTestGap === true;
    }
  },
  {
    type: 'input',
    name: 'penTestFrequency',
    message: 'How often are Penetration Tests performed?',
    when: function (answers) {
      return answers.hasPenTestGap === true;
    },
    default: 'quarterly'
  },
  {
    type: 'input',
    name: 'nextPenTestDate',
    message: 'When is the date of your next scheduled Penetration Test?',
    when: function (answers) {
      return answers.hasPenTestGap === true;
    }
  },
  {
    type: 'confirm',
    name: 'hadDataBreach',
    message: 'Have you had a Data Breach in the last 12 months?',
    default: false
  }
];
