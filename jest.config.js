process.env.RUNNING_TESTS = 'true';

module.exports = {
  ...require('@jupiterone/typescript-tools/config/jest'),
  setupFilesAfterEnv: ['./jest.setup.ts'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: {
      statements: 24,
      branches: 18,
      lines: 24,
      functions: 31,
    },
  },
};
