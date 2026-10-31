import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'dist/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      eqeqeq: 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { files: ['js/**/*.js'], languageOptions: { globals: globals.browser } },
  { files: ['server.js', 'api/**/*.js', 'netlify/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', 'eslint.config.js'], languageOptions: { globals: globals.node } },
];
