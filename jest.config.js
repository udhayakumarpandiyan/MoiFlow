module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@features/(.*)$': '<rootDir>/src/features/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@models/(.*)$': '<rootDir>/src/models/$1',
    '^@repository/(.*)$': '<rootDir>/src/repository/$1',
    '^@database/(.*)$': '<rootDir>/src/database/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@i18n/(.*)$': '<rootDir>/src/i18n/$1',
    '^@voice/(.*)$': '<rootDir>/src/voice/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@theme/(.*)$': '<rootDir>/src/theme/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-sqlite-storage|react-native-safe-area-context|react-native-screens|@react-native-async-storage|react-native-vision-camera|react-native-fs|uuid)/)',
  ],
  setupFilesAfterFramework: ['<rootDir>/jest.setup.js'],
};
