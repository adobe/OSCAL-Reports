/**
 * ESLint v9 Flat Configuration - Root
 * 
 * This is a minimal configuration to prevent ESLint errors.
 * Customize as needed for your coding standards.
 */

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.git/**',
      '**/backend/public/**',
      '**/sample_output/**'
    ]
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly'
      }
    },
    rules: {
      // Error prevention (recommended)
      'no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_' 
      }],
      'no-undef': 'error',
      'no-console': 'off', // Allow console in this project
      
      // Code quality
      'no-debugger': 'warn',
      'no-unreachable': 'error',
      'no-constant-condition': 'warn',
      'no-empty': 'warn',
      
      // Best practices
      'eqeqeq': ['warn', 'always'],
      'curly': ['warn', 'all'],
      'no-var': 'warn',
      'prefer-const': 'warn'
    }
  }
];
