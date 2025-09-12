module.exports = {
  env: {
    browser: false,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'airbnb-base'
  ],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },
  rules: {
    // Customize rules for our API
    'no-console': 'off', // We use console for logging in some places
    'consistent-return': 'off',
    'no-param-reassign': ['error', { props: false }],
    'max-len': ['error', { code: 120 }],
    'no-underscore-dangle': 'off',
    'class-methods-use-this': 'off',
    
    // Import rules
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    
    // Async/await
    'prefer-promise-reject-errors': 'off',
    
    // Allow certain patterns for our API structure
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'object-curly-newline': ['error', { consistent: true }]
  },
  ignorePatterns: [
    'node_modules/',
    'build/',
    'dist/',
    'coverage/',
    '*.min.js'
  ]
};
