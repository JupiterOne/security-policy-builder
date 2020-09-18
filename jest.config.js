process.env.RUNNING_TESTS = 'true';

module.exports = {
  ...require('@jupiterone/typescript-tools/config/jest'),
  setupFilesAfterEnv: ['./jest.setup.ts'],
  collectCoverage: true,
  collectCoverageFrom: ['src/**/*.ts'],
  coverageThreshold: {
    global: {
      statements: 22,
      branches: 16,
      lines: 22,
      functions: 29,
    },
  },
};
