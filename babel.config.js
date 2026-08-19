module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module-resolver',
      {
        root: ['.'],
        alias: {
          '@': './src',
          '@features': './src/features',
          '@services': './src/services',
          '@models': './src/models',
          '@repository': './src/repository',
          '@database': './src/database',
          '@navigation': './src/navigation',
          '@components': './src/components',
          '@i18n': './src/i18n',
          '@voice': './src/voice',
          '@utils': './src/utils',
          '@hooks': './src/hooks',
          '@theme': './src/theme',
        },
      },
    ],
  ],
  env: {
    production: {
      plugins: ['transform-remove-console'],
    },
  },
};
