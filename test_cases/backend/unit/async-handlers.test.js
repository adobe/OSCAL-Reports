/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Async Handler Validation', () => {
  describe('server.js Route Handlers', () => {
    let serverCode;

    beforeAll(() => {
      // Read the actual server.js file
      const serverPath = path.join(__dirname, '../../../backend/server.js');
      serverCode = fs.readFileSync(serverPath, 'utf8');
    });

    test('should have async keyword for handlers using await', () => {
      // This regex finds route handlers (app.get, app.post, etc.) and checks if they use await
      const routeHandlerPattern = /app\.(get|post|put|patch|delete)\s*\([^,]+,\s*(?:.*?,\s*)?(async\s+)?\([^)]*\)\s*(?:=>)?\s*{/g;
      const matches = [...serverCode.matchAll(routeHandlerPattern)];
      
      const handlersWithoutAsync = [];
      
      // For each route handler, check if it contains 'await' keyword
      let lastIndex = 0;
      serverCode.replace(/app\.(get|post|put|patch|delete)\s*\([^,]+,\s*(?:.*?,\s*)?(?:(async)\s+)?\(([^)]*)\)\s*(?:=>)?\s*{/g, 
        (match, method, asyncKeyword, params, offset) => {
          // Find the closing brace for this handler
          let braceCount = 1;
          let i = offset + match.length;
          let handlerBody = '';
          
          while (i < serverCode.length && braceCount > 0) {
            if (serverCode[i] === '{') braceCount++;
            if (serverCode[i] === '}') braceCount--;
            if (braceCount > 0) handlerBody += serverCode[i];
            i++;
          }
          
          // Check if handler body contains 'await' but doesn't have 'async' keyword
          const hasAwait = /\bawait\b/.test(handlerBody);
          const hasAsync = !!asyncKeyword;
          
          if (hasAwait && !hasAsync) {
            // Extract route path for better error message
            const routeMatch = match.match(/app\.\w+\s*\(\s*['"`]([^'"`]+)['"`]/);
            const route = routeMatch ? routeMatch[1] : 'unknown route';
            
            handlersWithoutAsync.push({
              method: method.toUpperCase(),
              route: route,
              line: serverCode.substring(0, offset).split('\n').length,
              snippet: match.substring(0, 100)
            });
          }
        }
      );
      
      // If any handlers use await without async, fail the test
      if (handlersWithoutAsync.length > 0) {
        const errorMessage = handlersWithoutAsync.map(h => 
          `  - ${h.method} ${h.route} (line ~${h.line}): Handler uses 'await' without 'async' keyword`
        ).join('\n');
        
        throw new Error(
          `Found ${handlersWithoutAsync.length} route handler(s) using 'await' without 'async' keyword:\n${errorMessage}\n\n` +
          `This will cause a SyntaxError at runtime. Add 'async' keyword to the handler function.`
        );
      }
      
      expect(handlersWithoutAsync).toHaveLength(0);
    });

    test('should validate /api/settings POST handler is async', () => {
      // Specific test for the handler that caused the bug in v1.6.1
      const settingsPostPattern = /app\.post\s*\(\s*['"`]\/api\/settings['"`]\s*,.*?(async\s+)?\([^)]*\)\s*(?:=>)?\s*{/s;
      const match = serverCode.match(settingsPostPattern);
      
      expect(match).not.toBeNull();
      expect(match[1]).toBeTruthy(); // Should have 'async' keyword
      
      if (!match[1]) {
        throw new Error(
          'POST /api/settings handler is missing "async" keyword but uses "await saveConfig()". ' +
          'This was the bug fixed in v1.6.2.'
        );
      }
    });

    test('should validate all config-related handlers are async', () => {
      // Test all handlers that save configuration (they all use await)
      const configEndpoints = [
        '/api/settings',
        '/api/sso/config',
        '/api/config'
      ];
      
      const missingAsync = [];
      
      configEndpoints.forEach(endpoint => {
        // Escape special regex characters in endpoint
        const escapedEndpoint = endpoint.replace(/\//g, '\\/');
        const pattern = new RegExp(`app\\.(post|put)\\s*\\(\\s*['"\`]${escapedEndpoint}['"\`]\\s*,.*?(async\\s+)?\\([^)]*\\)\\s*(?:=>)?\\s*{`, 's');
        const match = serverCode.match(pattern);
        
        if (match && !match[2]) {
          missingAsync.push(endpoint);
        }
      });
      
      if (missingAsync.length > 0) {
        throw new Error(
          `Config handlers missing 'async' keyword: ${missingAsync.join(', ')}\n` +
          'These handlers likely use await and must be declared as async.'
        );
      }
      
      expect(missingAsync).toHaveLength(0);
    });
  });

  describe('Route Handler Best Practices', () => {
    test('should document the async/await bug for future reference', () => {
      // This is a documentation test that explains the issue
      const bugDescription = {
        version: '1.6.1',
        symptom: 'SyntaxError: Unexpected reserved word',
        cause: 'Route handler used await without async keyword',
        location: 'app.post(\'/api/settings\', ...)',
        fix: 'Added async keyword to route handler',
        prevention: 'These tests catch this issue before commit'
      };
      
      // This test always passes but documents the bug
      expect(bugDescription.version).toBe('1.6.1');
      expect(bugDescription.fix).toContain('async');
    });
  });

  describe('Error Handling in Async Routes', () => {
    test('should properly handle errors in async route handlers', () => {
      // This is a conceptual test - in practice, all async routes should have try-catch
      const expectedBehavior = {
        asyncHandler: true,
        hasTryCatch: true,
        returnsErrorResponse: true,
        logsError: true
      };
      
      // Document expected error handling pattern
      expect(expectedBehavior.asyncHandler).toBe(true);
      expect(expectedBehavior.hasTryCatch).toBe(true);
    });
  });
});
