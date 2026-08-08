/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, '../../../backend/server.js');
const allowlistPath = path.join(__dirname, '../fixtures/public-api-allowlist.json');
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));

const AUTH_MIDDLEWARE = ['authenticate', 'requireRole', 'authorize'];
const ROUTE_LINE = /^app\.(get|post|put|delete|patch)\(\s*['"]([^'"]+)['"]\s*,\s*(.+)$/;

function routeKey(method, routePath) {
  return `${method.toUpperCase()} ${routePath}`;
}

function isAllowlisted(method, routePath, entries) {
  return entries.some((entry) => {
    if (entry.method.toUpperCase() !== method.toUpperCase()) {
      return false;
    }
    if (entry.path === routePath) {
      return true;
    }
    const pattern = entry.path.replace(/:[^/]+/g, '[^/]+');
    return new RegExp(`^${pattern}$`).test(routePath);
  });
}

function parseMiddlewareChain(chain) {
  const middleware = [];
  const tokens = chain.match(/[a-zA-Z_$][\w$]*/g) || [];
  for (const token of tokens) {
    if (['async', 'req', 'res', 'next', 'function'].includes(token)) {
      break;
    }
    middleware.push(token);
  }
  return middleware;
}

function parseRoutes(serverCode) {
  const routes = [];
  for (const line of serverCode.split('\n')) {
    const trimmed = line.trim();
    const match = trimmed.match(ROUTE_LINE);
    if (!match) {
      continue;
    }
    const [, method, routePath, chain] = match;
    routes.push({
      method: method.toUpperCase(),
      path: routePath,
      middleware: parseMiddlewareChain(chain),
    });
  }
  return routes;
}

function hasAuthMiddleware(middleware) {
  return middleware.some((name) => AUTH_MIDDLEWARE.includes(name));
}

describe('API auth inventory (proactive)', () => {
  let routes;

  beforeAll(() => {
    const serverCode = fs.readFileSync(serverPath, 'utf8');
    routes = parseRoutes(serverCode);
    expect(routes.length).toBeGreaterThan(50);
  });

  test('job routes require authenticate and do not use optionalAuth on create', () => {
    const jobCreateRoutes = routes.filter((route) =>
      route.method === 'POST' && /^\/api\/jobs\/(pdf|excel|ccm)$/.test(route.path)
    );
    expect(jobCreateRoutes).toHaveLength(3);
    for (const route of jobCreateRoutes) {
      expect(route.middleware).toContain('authenticate');
      expect(route.middleware).not.toContain('optionalAuth');
    }

    const jobAccessRoutes = routes.filter((route) =>
      route.method === 'GET' && /^\/api\/jobs\/:jobId(\/download)?$/.test(route.path)
    );
    expect(jobAccessRoutes).toHaveLength(2);
    for (const route of jobAccessRoutes) {
      expect(route.middleware).toContain('authenticate');
    }
  });

  test('object-reference routes require auth unless allowlisted', () => {
    const violations = routes.filter((route) => {
      if (!route.path.includes(':')) {
        return false;
      }
      if (isAllowlisted(route.method, route.path, allowlist.publicRoutes)) {
        return false;
      }
      return !hasAuthMiddleware(route.middleware);
    });

    expect(violations).toEqual([]);
  });

  test('mutating /api routes require auth unless allowlisted', () => {
    const violations = routes.filter((route) => {
      if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(route.method)) {
        return false;
      }
      if (!route.path.startsWith('/api/')) {
        return false;
      }
      if (isAllowlisted(route.method, route.path, allowlist.publicRoutes)) {
        return false;
      }
      return !hasAuthMiddleware(route.middleware);
    });

    if (violations.length > 0) {
      const summary = violations.map((route) => routeKey(route.method, route.path)).join(', ');
      throw new Error(`Unauthenticated mutating routes (review allowlist or add auth): ${summary}`);
    }
    expect(violations).toEqual([]);
  });

  test('optionalAuth is not used on sensitive mutating or download routes unless allowlisted', () => {
    const violations = routes.filter((route) => {
      if (!route.middleware.includes('optionalAuth')) {
        return false;
      }
      const isMutating = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(route.method);
      const isDownload = route.method === 'GET' && route.path.includes('download');
      if (!isMutating && !isDownload) {
        return false;
      }
      return !isAllowlisted(route.method, route.path, allowlist.optionalAuthAllowed);
    });

    expect(violations).toEqual([]);
  });
});
