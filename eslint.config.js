import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'dist/'] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      eqeqeq: 'error',
      'max-len': ['error', { code: 120, ignoreUrls: true, ignoreRegExpLiterals: true }],
      'prefer-const': 'error',
      'no-var': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { files: ['js/**/*.js'], languageOptions: { globals: globals.browser } },
  // Data tables keep one record per line, so long prose lines are fine there.
  { files: ['js/data/**/*.js'], rules: { 'max-len': 'off' } },
  {
    files: ['server.js', 'api/**/*.js', 'netlify/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
];
