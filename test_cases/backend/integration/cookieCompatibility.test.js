/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Guards against dependency drift in the cookie and routing stack. In November 2026 a dependency refresh installed a
 * `cookie` major that Express could not call (`cookie.serialize is not a function`), which made every request that sets
 * a cookie, including sign-in, fail with HTTP 500 while the rest of the suite stayed green.
 */
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from '../../../backend/node_modules/express/index.js';
import cookieParser from '../../../backend/node_modules/cookie-parser/index.js';
import request from '../../../backend/node_modules/supertest/index.js';
import semver from '../../../backend/node_modules/semver/semver.js';
import { csrfProtection } from '../../../backend/middleware/csrfProtection.js';
import { SECURITY_CONFIG } from '../../../backend/utils/securityConfig.js';

const modules = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../backend/node_modules');
const manifest = (...parts) => JSON.parse(fs.readFileSync(path.join(modules, ...parts, 'package.json'), 'utf8'));
// Same resolution Node uses: a copy nested under the dependent wins over the top-level one.
const installed = (dependent, dependency) => {
  const nested = path.join(modules, dependent, 'node_modules', dependency, 'package.json');
  return JSON.parse(fs.readFileSync(fs.existsSync(nested) ? nested : path.join(modules, dependency, 'package.json'), 'utf8')).version;
};

describe('real cookie-setting paths', () => {
  it('sets the CSRF cookie and issues a token through the real middleware (the call the front end makes on load)', async () => {
    const app = express();
    app.use(cookieParser());
    app.get('/api/csrf-token', csrfProtection, (req, res) => res.json({ csrfToken: req.csrfToken() }));
    const response = await request(app).get('/api/csrf-token');
    expect(response.status).toBe(200);
    expect(typeof response.body.csrfToken).toBe('string');
    expect(response.headers['set-cookie'].join(';')).toContain(SECURITY_CONFIG.csrf.cookieName);
  });

  it('serializes a session-style cookie with every security attribute', async () => {
    const app = express();
    app.get('/c', (req, res) => {
      res.cookie('sessionToken', 'value', { httpOnly: true, secure: true, sameSite: 'strict', maxAge: 60000, path: '/' });
      res.send('ok');
    });
    const response = await request(app).get('/c');
    expect(response.status).toBe(200);
    const header = response.headers['set-cookie'][0];
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=Strict/i);
  });
});

describe('runtime-critical dependencies stay inside the ranges their dependents declare', () => {
  const pairs = [
    ['express', 'cookie'], ['express', 'body-parser'], ['express', 'router'], ['router', 'path-to-regexp'],
    ['cookie-parser', 'cookie'], ['express-session', 'cookie'],
  ];
  it.each(pairs)('%s -> %s', (dependent, dependency) => {
    const range = manifest(dependent).dependencies?.[dependency];
    expect(range).toBeTruthy();
    const version = installed(dependent, dependency);
    expect({ dependent, dependency, version, range, satisfied: semver.satisfies(version, range) })
      .toEqual({ dependent, dependency, version, range, satisfied: true });
  });
});
