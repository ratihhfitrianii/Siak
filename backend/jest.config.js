/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
    '!src/lib/pg.ts',
    '!src/types/**',
    '!src/test/**',
    '!src/modules/student-profile/**',
    '!src/modules/payroll/**',
  ],
  coverageThreshold: {
    global: {
      lines: 75,
      branches: 74,
      functions: 80,
      statements: 80,
    },
  },
  clearMocks: true,
  forceExit: true,
  // T1.9: detectOpenHandles dimatikan — suite TIDAK memanggil pgPool.end() lagi
  // (pool dibagikan antar suite dalam worker; menutupnya = race "pool after end").
  // forceExit: true sudah menutup proses (dan pool) setelah semua suite selesai.
};
