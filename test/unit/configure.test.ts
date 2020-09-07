import * as configure from '~/src/configure';
import { baseQuestions as questions } from '~/src/questions/base';
import * as validate from '~/src/questions/helpers/validate';

test('configure.missingOrganizationValues shows all values when {} is passed', () => {
  expect(questions.length).toBe(configure.missingOrganizationValues({}).length);
});

test('configure.missingOrEmptyOrganizationValues filters inquirer questions array for missing values', () => {
  expect(
    configure.missingOrEmptyOrganizationValues({ companyShortName: 'FooCorp' })
      .length
  ).toBe(questions.length - 1);
});

test('configure.missingOrEmptyOrganizationValues inquires on empty values', () => {
  expect(
    configure.missingOrEmptyOrganizationValues({ companyShortName: '' }).length
  ).toBe(questions.length);
});

test('inquiries validates email addresses', () => {
  expect(validate.validateEmail('not-an-address')).toBe(
    'Please enter a valid email address'
  );
  expect(validate.validateEmail('me@privacy.net')).toBe(true);
});

test('inquiries validates web urls', () => {
  expect(validate.validateWebURL('git://foo/**/../@')).toBe(
    'Please enter a valid Web URL'
  );
  expect(validate.validateWebURL('http://bit.ly')).toBe(true);
});
