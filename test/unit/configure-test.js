import test from 'ava';

const configure = require('../../lib/configure');
const questions = require('../../lib/questions/base').list;
const validate = require('../../lib/questions/helpers/validate');

test('configure.missingOrganizationValues shows all values when {} is passed', t => {
  t.is(
    (questions.map(q => q.name)).length,
    configure.missingOrganizationValues({}).length
  );
});

test('configure.missingOrEmptyOrganizationValues filters inquirer questions array for missing values', t => {
  t.is(
    questions.length - 1,
    configure.missingOrEmptyOrganizationValues({ companyShortName: 'FooCorp' }).length
  );
});

test('configure.missingOrEmptyOrganizationValues inquires on empty values', t => {
  t.is(
    questions.length,
    configure.missingOrEmptyOrganizationValues({ companyShortName: '' }).length
  );
});

test('inquiries validates email addresses', t => {
  t.not(
    true,
    validate.email('not-an-address')
  );
  t.is(
    true,
    validate.email('me@privacy.net')
  );
});

test('inquiries validates web urls', t => {
  t.not(
    true,
    validate.webURL('git://foo/**/../@')
  );
  t.is(
    true,
    validate.webURL('http://bit.ly')
  );
});
