import js from '@eslint/js';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'src/service/**',
      'tests/**',
      'src/handler/menu/clientRequestHandlers.js',
      'src/handler/menu/oprRequestHandlers.js',
      'src/handler/menu/userMenuHandlers.js'
    ],
  },
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        describe: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly'
      }
    },
    rules: {},
  },
];
