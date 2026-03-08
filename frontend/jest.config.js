module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['<rootDir>/tests/**/*.js'],
  testPathIgnorePatterns: ['/node_modules/', '/build/'],
  verbose: true,
  testTimeout: 15000,
  maxWorkers: 1
};
