import * as colors from '~/src/questions/helpers/colors';

test('colors.primary has more options than colors.accent', () => {
  expect(
    colors.primaryColorChoices().length > colors.accentColorChoices().length
  ).toBe(true);
});
