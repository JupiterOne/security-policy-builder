import { PolicyBuilderQuestion } from '~/src/types';
import { validateWebURL } from './helpers/validate';

export const scorecardQuestions: PolicyBuilderQuestion[] = [
  {
    type: 'input',
    name: 'securityScorecardPeriod',
    message: 'How often do you publish updates to the scorecard? Every:',
  },
  {
    type: 'input',
    name: 'securityScorecardURL',
    message: 'Link to the published scorecard',
    validate: validateWebURL,
  },
];
