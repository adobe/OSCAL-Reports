/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import axiosRoot from 'axios';

/** Axios default header buckets (see mergeConfig / AxiosHeaders). */
const AXIOS_HEADER_GROUPS = new Set([
  'common', 'delete', 'get', 'head', 'post', 'put', 'patch', 'link', 'unlink', 'purge',
]);

/**
 * @param {unknown} headers AxiosHeaders-like or plain object
 * @returns {Array<[string, unknown]>}
 */
function headerEntries(headers) {
  if (!headers || typeof headers !== 'object') {
    return [];
  }
  if (typeof headers.toJSON === 'function') {
    const flat = headers.toJSON();
    if (!flat || typeof flat !== 'object') {
      return [];
    }
    return Object.entries(flat);
  }
  /** @type {Array<[string, unknown]>} */
  const pairs = [];
  for (const k in headers) {
    const val = headers[k];
    if (typeof val === 'function') {
      continue;
    }
    if (val && typeof val === 'object' && !Array.isArray(val) && AXIOS_HEADER_GROUPS.has(String(k).toLowerCase())) {
      for (const nk in val) {
        const nv = val[nk];
        if (typeof nv === 'function') {
          continue;
        }
        pairs.push([nk, nv]);
      }
      continue;
    }
    pairs.push([k, val]);
  }
  return pairs;
}

/**
 * @param {unknown} name
 */
function assertSafeHeaderName(name) {
  if (name === undefined || name === null) {
    return;
  }
  const s = String(name);
  if (/[\r\n]/.test(s)) {
    const err = new Error('HTTP header name contains CR or LF, which is not allowed');
    err.code = 'E_HTTP_HEADER_CRLF';
    throw err;
  }
}

/**
 * @param {unknown} name For error context only
 * @param {unknown} value
 */
function assertSafeHeaderValue(name, value) {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      assertSafeHeaderValue(name, item);
    }
    return;
  }
  const s = String(value);
  if (/[\r\n]/.test(s)) {
    const err = new Error('HTTP header value contains CR or LF, which is not allowed');
    err.code = 'E_HTTP_HEADER_CRLF';
    throw err;
  }
}

/**
 * Validates merged outbound headers. Exported for unit tests.
 * @param {unknown} headers
 */
export function validateOutgoingHeadersForCrlf(headers) {
  for (const [rawName, val] of headerEntries(headers)) {
    assertSafeHeaderName(rawName);
    assertSafeHeaderValue(rawName, val);
  }
}

function validateAuthCredentials(auth) {
  if (!auth || typeof auth !== 'object') {
    return;
  }
  assertSafeHeaderValue('auth.username', auth.username);
  assertSafeHeaderValue('auth.password', auth.password);
}

const axios = axiosRoot.create();

axios.interceptors.request.use((config) => {
  validateOutgoingHeadersForCrlf(config.headers);
  validateAuthCredentials(config.auth);
  return config;
});

axios.interceptors.response.use(
  (response) => {
    if (response.config?.ssrfStrict && response.status >= 300 && response.status < 400) {
      const err = new Error('Redirects are not allowed for SSRF-protected requests');
      err.code = 'E_SSRF_REDIRECT';
      return Promise.reject(err);
    }
    return response;
  },
  (error) => Promise.reject(error),
);

axios.isAxiosError = axiosRoot.isAxiosError;

export default axios;
