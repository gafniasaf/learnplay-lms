import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests/unit'],
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/*.test.[jt]s?(x)',
    '**/*.spec.[jt]s?(x)',
  ],
  // Ignore vitest test files
  testPathIgnorePatterns: [
    '/node_modules/',
    'src/lib/gameLogic.test.ts',
    'tests/unit/hooks/useCoursePublishing.test.tsx',
    'tests/unit/hooks/useMCP-expanded.test.tsx',
  ],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          transform: {
            react: {
              runtime: 'automatic',
            },
          },
        },
      },
    ],
  },
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: '<rootDir>/reports',
        outputName: 'junit.xml',
        ancestorSeparator: ' › ',
        addFileAttribute: 'true',
      },
    ],
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/lib/contracts.ts',
    'src/lib/gameLogic.ts',
    'src/lib/utils.ts',
    'src/lib/computed/**/*.ts',
    'src/lib/validation/**/*.ts',
    'src/lib/utils/**/*.ts',
    '!src/lib/utils/telemetry.ts', // Exclude - uses import.meta.env which Jest doesn't support
    'src/lib/constants.ts',
    'src/lib/enums.ts',
    'src/lib/pipeline/**/*.ts',
    'src/lib/levels.ts',
    'src/lib/sanitize.ts',
    '!src/lib/api/common.ts', // Exclude - uses import.meta.env which Jest doesn't support
    'src/store/**/*.ts',
    '!src/lib/env.ts', // Exclude env.ts - uses import.meta.env which Jest doesn't support
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 80,
      lines: 90,
      statements: 90,
    },
  },
};

export default config;
