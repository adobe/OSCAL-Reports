/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
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
