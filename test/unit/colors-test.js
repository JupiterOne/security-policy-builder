const test = require("ava");

const colors = require("../../lib/questions/helpers/colors");

test("colors.primary has more options than colors.accent", (t) => {
  t.is(
    true,
    colors.primaryColorChoices().length > colors.accentColorChoices().length
  );
});
