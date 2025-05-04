module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    // Add custom rules here if needed
  },
  overrides: [
    {
      files: ['tests/**/*.ts'],
      env: {
        'vitest-globals/env': true,
      },
      plugins: ['vitest-globals'],
    },
  ],
}; 