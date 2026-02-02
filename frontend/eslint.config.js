/**
 * ESLint v9 Flat Configuration - Frontend
 * 
 * React frontend with JSX support
 */

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**'
    ]
  },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        fetch: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        prompt: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        
        // React globals
        React: 'readonly'
      }
    },
    rules: {
      // Error prevention
      'no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true
      }],
      'no-undef': 'error',
      'no-console': 'warn', // Warn for console in production code
      
      // Code quality
      'no-debugger': 'warn',
      'no-unreachable': 'error',
      'no-constant-condition': 'warn',
      'no-empty': 'warn',
      'no-duplicate-imports': 'error',
      
      // Best practices
      'eqeqeq': ['warn', 'always'],
      'curly': ['warn', 'all'],
      'no-var': 'warn',
      'prefer-const': 'warn',
      
      // React best practices (basic rules without plugin)
      'no-direct-mutation-state': 'off', // Would need React plugin
      
      // Security
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error'
    }
  }
];
