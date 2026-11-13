/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Generic SSO sign-in failures must be reported as what actually failed. These tests use real local servers (a closed port,
 * a 404, a 200 without the expected field) so the classification comes from real network behaviour, not from mocks.
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import http from 'node:http';
import {
  probeOidcDiscovery,
  classifyDiscoveryError,
  diagnoseGenericOidcConfig,
  genericOidcLoginErrorQuery,
  discoveryFailureToLoginError,
} from '../../../backend/auth/genericOidc.js';
import { loginErrorMessageFromSearch } from '../../../frontend/src/utils/loginErrors.js';

let server;
let base;
let closedPort;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/missing') { res.writeHead(404); res.end('nope'); return; }
    if (req.url === '/no-endpoint') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"issuer":"x"}'); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ issuer: 'x', authorization_endpoint: 'http://127.0.0.1/auth', token_endpoint: 'http://127.0.0.1/token' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const probe = http.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  closedPort = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
});
afterAll(() => new Promise(resolve => server.close(resolve)));

describe('probeOidcDiscovery reports the real failure', () => {
  it('a closed port is "unreachable" with the real system error code and the host', async () => {
    const result = await probeOidcDiscovery(`http://127.0.0.1:${closedPort}/.well-known/openid-configuration`);
    expect(result.discovery).toBeNull();
    expect(result.failure).toMatchObject({ kind: 'unreachable', code: 'ECONNREFUSED', host: '127.0.0.1' });
  });

  it('an HTTP error is reported with its status', async () => {
    const result = await probeOidcDiscovery(`${base}/missing`);
    expect(result.failure).toMatchObject({ kind: 'http', httpStatus: 404, host: '127.0.0.1' });
  });

  it('a reachable server with no authorization endpoint is reported as such', async () => {
    const result = await probeOidcDiscovery(`${base}/no-endpoint`);
    expect(result.failure).toMatchObject({ kind: 'no-authorization-endpoint', host: '127.0.0.1' });
  });

  it('a healthy server has no failure', async () => {
    const result = await probeOidcDiscovery(`${base}/ok`);
    expect(result.discovery?.authorization_endpoint).toBe('http://127.0.0.1/auth');
    expect(result.failure).toBeUndefined();
  });

  it('keeps the existing error text for callers that still read it', async () => {
    const result = await probeOidcDiscovery(`${base}/missing`);
    expect(typeof result.error).toBe('string');
    expect(result.error).toContain('404');
  });
});

describe('classifyDiscoveryError', () => {
  const host = 'sso.example.test';
  it.each([
    ['EHOSTUNREACH', 'unreachable'], ['ECONNREFUSED', 'unreachable'], ['ENOTFOUND', 'unreachable'], ['ETIMEDOUT', 'unreachable'],
    ['ECONNABORTED', 'unreachable'], ['ENETUNREACH', 'unreachable'], ['EAI_AGAIN', 'unreachable'],
    ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'tls'], ['CERT_HAS_EXPIRED', 'tls'], ['ERR_TLS_CERT_ALTNAME_INVALID', 'tls'],
  ])('%s is %s', (code, kind) => {
    expect(classifyDiscoveryError(Object.assign(new Error('x'), { code }), host)).toEqual({ kind, code, host });
  });

  it('finds the real code inside an AggregateError (Node tries several addresses) and inside a cause', () => {
    const inner = Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' });
    expect(classifyDiscoveryError(new AggregateError([inner], 'x'), host)).toMatchObject({ kind: 'unreachable', code: 'EHOSTUNREACH' });
    expect(classifyDiscoveryError(Object.assign(new Error('x'), { cause: inner }), host)).toMatchObject({ code: 'EHOSTUNREACH' });
  });

  it('never reports an unknown error as a configuration problem', () => {
    expect(classifyDiscoveryError(new Error('odd'), host)).toMatchObject({ kind: 'unreachable', code: 'UNKNOWN' });
  });
});

describe('diagnoseGenericOidcConfig names the setting that is missing', () => {
  const ok = { enabled: true };
  const provider = { enabled: true, clientId: 'id', discoveryUrl: 'https://sso.example.test/.well-known/openid-configuration' };
  it('returns null when everything needed is present', () => {
    expect(diagnoseGenericOidcConfig(ok, provider, 'secret')).toBeNull();
  });
  it.each([
    [{ enabled: false }, provider, 'secret', 'oauth-disabled'],
    [ok, undefined, 'secret', 'provider-missing'],
    [ok, { ...provider, enabled: false }, 'secret', 'provider-disabled'],
    [ok, { ...provider, clientId: '  ' }, 'secret', 'client-id'],
    [ok, { ...provider, discoveryUrl: '' }, 'secret', 'discovery-url'],
    [ok, provider, '', 'client-secret'],
  ])('%#', (oauth, prov, secret, expected) => {
    expect(diagnoseGenericOidcConfig(oauth, prov, secret)).toBe(expected);
  });
});

describe('discoveryFailureToLoginError maps what failed to the error the login page shows', () => {
  it.each([
    [{ kind: 'unreachable', code: 'EHOSTUNREACH', host: 'sso.example.test' }, { code: 'generic_oidc_unreachable', host: 'sso.example.test', detail: 'EHOSTUNREACH' }],
    [{ kind: 'tls', code: 'CERT_HAS_EXPIRED', host: 'h.test' }, { code: 'generic_oidc_tls', host: 'h.test', detail: 'CERT_HAS_EXPIRED' }],
    [{ kind: 'http', httpStatus: 503, host: 'h.test' }, { code: 'generic_oidc_discovery_failed', host: 'h.test', status: 503 }],
    [{ kind: 'no-authorization-endpoint', host: 'h.test' }, { code: 'generic_oidc_discovery_invalid', host: 'h.test' }],
    [{ kind: 'invalid-url', host: '' }, { code: 'generic_oidc_not_configured', missing: 'discovery-url' }],
  ])('%j', (failure, expected) => {
    expect(discoveryFailureToLoginError(failure)).toEqual(expected);
  });
  it('treats an unknown failure as unreachable, never as configuration', () => {
    expect(discoveryFailureToLoginError(undefined).code).toBe('generic_oidc_unreachable');
  });
});

describe('the redirect carries only sanitized facts', () => {
  it('builds a query from the failure, dropping unsafe values', () => {
    const query = new URLSearchParams(genericOidcLoginErrorQuery({ code: 'generic_oidc_unreachable', host: 'sso.example.test', detail: 'EHOSTUNREACH' }));
    expect(Object.fromEntries(query)).toEqual({ error: 'generic_oidc_unreachable', host: 'sso.example.test', detail: 'EHOSTUNREACH' });
    const hostile = new URLSearchParams(genericOidcLoginErrorQuery({ code: 'generic_oidc_unreachable', host: 'evil.test/<script>', detail: 'x y', status: 'abc' }));
    expect(hostile.get('host')).toBeNull();
    expect(hostile.get('detail')).toBeNull();
    expect(hostile.get('status')).toBeNull();
  });
  it('refuses an error code it does not know', () => {
    expect(new URLSearchParams(genericOidcLoginErrorQuery({ code: 'something_else' })).get('error')).toBe('generic_oidc_not_configured');
  });
});

describe('the login page text is built from the reported facts', () => {
  const text = search => loginErrorMessageFromSearch(search);
  it('unreachable names the host, the system error and what it means', () => {
    const message = text('?error=generic_oidc_unreachable&host=sso.example.test&detail=EHOSTUNREACH');
    expect(message).toContain('sso.example.test');
    expect(message).toContain('EHOSTUNREACH');
    expect(message.toLowerCase()).toContain('no route');
    expect(message.toLowerCase()).not.toContain('not configured');
    expect(message.toLowerCase()).not.toContain('redirect uri');
  });
  it('a different system error gives a different message', () => {
    expect(text('?error=generic_oidc_unreachable&host=h.test&detail=ECONNREFUSED').toLowerCase()).toContain('refused');
    expect(text('?error=generic_oidc_unreachable&host=h.test&detail=ENOTFOUND').toLowerCase()).toContain('could not be resolved');
    expect(text('?error=generic_oidc_unreachable&host=h.test&detail=ETIMEDOUT').toLowerCase()).toContain('timed out');
  });
  it('an unknown system error code is shown as it is', () => {
    expect(text('?error=generic_oidc_unreachable&host=h.test&detail=EWEIRD')).toContain('EWEIRD');
  });
  it('configuration failures name the missing setting', () => {
    expect(text('?error=generic_oidc_not_configured&missing=client-secret').toLowerCase()).toContain('client secret');
    expect(text('?error=generic_oidc_not_configured&missing=oauth-disabled').toLowerCase()).toContain('turned off');
    expect(text('?error=generic_oidc_not_configured&missing=discovery-url').toLowerCase()).toContain('discovery url');
  });
  it('a redirect failure names the address that was refused', () => {
    const message = text('?error=generic_oidc_redirect_not_allowed&redirect=http%3A%2F%2Foscal.example.test%3A3021%2Fauth%2Fcallback');
    expect(message).toContain('http://oscal.example.test:3021/auth/callback');
    expect(message.toLowerCase()).toContain('redirect');
  });
  it('http, certificate and missing-endpoint failures each say so', () => {
    expect(text('?error=generic_oidc_discovery_failed&host=h.test&status=503')).toContain('503');
    expect(text('?error=generic_oidc_tls&host=h.test&detail=CERT_HAS_EXPIRED').toLowerCase()).toContain('certificate');
    expect(text('?error=generic_oidc_discovery_invalid&host=h.test').toLowerCase()).toContain('authorization endpoint');
  });
  it('ignores unsafe values instead of printing them, and keeps the Okta message', () => {
    const message = text('?error=generic_oidc_unreachable&host=%3Cb%3Eevil%3C%2Fb%3E&detail=%3Cscript%3E');
    expect(message).not.toContain('<');
    expect(text('?error=okta_not_configured')).toContain('Okta');
    expect(text('?error=unrelated')).toBeNull();
    expect(text('')).toBeNull();
  });
});
