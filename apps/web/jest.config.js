const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.{js,jsx}'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
});
