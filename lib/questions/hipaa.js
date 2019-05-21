exports.list = [
  {
    type: 'confirm',
    name: 'isHIPAACoveredEntity',
    message: 'Is your organization a Covered Entity?',
    default: false
  },
  {
    type: 'confirm',
    name: 'isHIPAABusinessAssociate',
    message: 'Is your organization a Business Associate?',
    default: false
  },
  {
    type: 'confirm',
    name: 'isHIPAAGovernmentEntity',
    message: 'Is your organization a Government Entity?',
    default: false
  },
  {
    type: 'confirm',
    name: 'isHIPAAPlanSponsor',
    message: 'Is your organization a Plan Sponsor?',
    default: false
  },
  {
    type: 'confirm',
    name: 'isHIPAAHealthcareClearinghouse',
    message: 'Is your organization a Healthcare Clearinghouse?',
    default: false
  }
];
