#!/usr/bin/env node
/* Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import http from 'node:http';
import { URL, pathToFileURL } from 'node:url';

const MAX_BYTES = 1024 * 1024;
const DEFAULT_PROVIDER_MODULE = new URL('../../GuardianAgent/scripts/local-guardian-integration.mjs', import.meta.url);
const DEFAULT_ORIGIN = 'http://127.0.0.1:3021';

class DemoRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function isLoopbackHost(value) {
  try {
    const url = new URL(`http://${value}`);
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}

async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] || '')) {
    throw new DemoRequestError(415, 'JSON content type required.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      throw new DemoRequestError(413, 'Request exceeds the 1 MiB local demo limit.');
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Expected object.');
    }
    return body;
  } catch {
    throw new DemoRequestError(400, 'Invalid JSON object.');
  }
}

async function parseProviderResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!/^application\/json(?:;|$)/i.test(contentType) || !response.body) {
    throw new DemoRequestError(502, 'Local Guardian returned an invalid response.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) { break; }
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw new DemoRequestError(502, 'Local Guardian response exceeds the 1 MiB limit.');
    }
    chunks.push(value);
  }
  try {
    const text = new TextDecoder().decode(Buffer.concat(chunks.map(chunk => Buffer.from(chunk))));
    return JSON.parse(text);
  } catch {
    throw new DemoRequestError(502, 'Local Guardian returned invalid JSON.');
  }
}

export async function startLocalGuardianDemo({
  port = 8767,
  origin = DEFAULT_ORIGIN,
  providerModule = DEFAULT_PROVIDER_MODULE,
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Invalid local demo port.');
  }
  const originUrl = new URL(origin);
  if (originUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(originUrl.hostname) ||
    originUrl.pathname !== '/' || originUrl.search || originUrl.hash) {
    throw new Error('The local demo origin must be an HTTP loopback origin.');
  }

  const providerModuleUrl = providerModule instanceof URL ? providerModule.href : providerModule;
  const { startLocalGuardian } = await import(providerModuleUrl);
  const provider = await startLocalGuardian({ port: 0 });
  const providerUrl = new URL(provider.baseUrl);
  if (providerUrl.protocol !== 'http:' || providerUrl.hostname !== '127.0.0.1') {
    await provider.close();
    throw new Error('The local Guardian provider must bind to IPv4 loopback.');
  }

  async function forward(request, response, pathname, body) {
    const token = provider.tokenForTest();
    let upstream;
    try {
      upstream = await fetch(new URL(pathname, provider.baseUrl), {
        method: request.method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new DemoRequestError(502, 'Local Guardian could not be reached.');
    }
    const result = await parseProviderResponse(upstream);
    sendJson(response, upstream.status, result);
  }

  async function dispatch(request, response) {
    if (!isLoopbackHost(request.headers.host || '')) {
      throw new DemoRequestError(403, 'Loopback requests only.');
    }
    if (request.headers.origin && request.headers.origin !== originUrl.origin) {
      throw new DemoRequestError(403, 'Unexpected local demo origin.');
    }
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.search) { throw new DemoRequestError(400, 'Query parameters are not accepted.'); }

    if (request.method === 'GET' && url.pathname === '/api/local-guardian/fixture') {
      return sendJson(response, 200, { ssp: provider.fixtures.ssp });
    }

    const assessmentPath = /^\/api\/local-guardian\/assessments\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})\/([A-Za-z0-9_-]{1,128})$/
      .exec(url.pathname);
    if (request.method === 'GET' && assessmentPath) {
      const [, assessmentProvider, runId, targetId] = assessmentPath;
      return forward(request, response,
        `/v1/guardian/assessments/${encodeURIComponent(assessmentProvider)}/${encodeURIComponent(runId)}/${encodeURIComponent(targetId)}`);
    }

    if (request.method === 'POST' &&
      ['/api/local-guardian/ssp/preview', '/api/local-guardian/ssp/apply'].includes(url.pathname)) {
      const body = await readJson(request);
      const path = url.pathname.endsWith('/preview')
        ? '/v1/guardian/ssp/preview' : '/v1/guardian/ssp/apply';
      return forward(request, response, path, body);
    }

    throw new DemoRequestError(404, 'Local demo route not found.');
  }

  const server = http.createServer({ maxHeaderSize: 16384, requestTimeout: 10000, headersTimeout: 10000 },
    (request, response) => {
      dispatch(request, response).catch(error => {
        const status = error instanceof DemoRequestError ? error.status : 500;
        if (!(error instanceof DemoRequestError)) {
          console.error(JSON.stringify({
            severity: 'ERROR',
            'service.name': 'oscal-local-guardian-demo',
            'event.action': 'provider_request',
            'event.outcome': 'failure',
            reason: 'internal_error',
          }));
        }
        if (!response.headersSent) {
          sendJson(response, status, {
            status: 'error',
            message: error instanceof DemoRequestError ? error.message : 'Local integration failed.',
          });
        } else {
          response.destroy();
        }
      });
    });

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', resolve);
    });
  } catch (error) {
    await provider.close();
    throw error;
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeIdleConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      await provider.close();
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.OSCAL_GUARDIAN_DEMO_PORT || 8767);
  const demo = await startLocalGuardianDemo({ port });
  console.log(`Synthetic Guardian bridge listening at ${demo.baseUrl}; no token is printed.`);
  let closing = false;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      if (closing) { return; }
      closing = true;
      demo.close().catch(() => { process.exitCode = 1; });
    });
  }
}
