/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { describe, it, expect } from '@jest/globals';
import axiosRoot from 'axios';
import axios, { validateOutgoingHeadersForCrlf } from '../../../backend/utils/safeAxios.js';

describe('safeAxios — CRLF header hardening', () => {
  it('validateOutgoingHeadersForCrlf accepts normal AxiosHeaders', () => {
    const h = new axiosRoot.AxiosHeaders();
    h.set('Accept', 'application/json');
    h.set('X-Custom', 'ok-value');
    expect(() => validateOutgoingHeadersForCrlf(h)).not.toThrow();
  });

  it('validateOutgoingHeadersForCrlf rejects LF in plain header object', () => {
    expect(() => validateOutgoingHeadersForCrlf({ 'X-Evil': 'a\nb' })).toThrow(/CR or LF/);
    try {
      validateOutgoingHeadersForCrlf({ 'X-Evil': 'a\nb' });
    } catch (e) {
      expect(e.code).toBe('E_HTTP_HEADER_CRLF');
    }
  });

  it('validateOutgoingHeadersForCrlf rejects CR in plain header object', () => {
    expect(() => validateOutgoingHeadersForCrlf({ 'X-Evil': 'a\rb' })).toThrow(/CR or LF/);
  });

  it('validateOutgoingHeadersForCrlf rejects CRLF in array header values', () => {
    expect(() => validateOutgoingHeadersForCrlf({ 'X-Multi': ['ok', 'bad\r\n'] })).toThrow(/CR or LF/);
  });

  it('validateOutgoingHeadersForCrlf rejects CR/LF in header name', () => {
    expect(() => validateOutgoingHeadersForCrlf({ 'X-Bad\nName': 'v' })).toThrow(/header name/);
  });

  it('validateOutgoingHeadersForCrlf walks inherited enumerable keys (prototype chain)', () => {
    const proto = { 'X-Inherited': 'line1\nline2' };
    const headers = Object.create(proto);
    expect(() => validateOutgoingHeadersForCrlf(headers)).toThrow(/CR or LF/);
  });

  it('validateOutgoingHeadersForCrlf expands axios common header bucket', () => {
    expect(() =>
      validateOutgoingHeadersForCrlf({
        common: { 'X-Evil': 'a\r\nb' },
      }),
    ).toThrow(/CR or LF/);
  });

  it('shared axios instance exposes isAxiosError like root axios', () => {
    expect(typeof axios.isAxiosError).toBe('function');
  });

  it('axios 1.16+ strips CR/LF from merged outbound headers (no Invalid character throw)', async () => {
    const client = axiosRoot.create();
    let mergedHeaders;
    client.interceptors.request.use((config) => {
      mergedHeaders = config.headers?.toJSON?.() ?? config.headers;
      return Promise.reject(new Error('stop-before-network'));
    });
    await expect(
      client.get('http://127.0.0.1:9/nope', {
        timeout: 500,
        headers: { 'X-Injected': 'x\r\n\r\nGET / HTTP/1.1' },
        validateStatus: () => true,
      }),
    ).rejects.toThrow('stop-before-network');
    expect(mergedHeaders['X-Injected']).toBe('xGET / HTTP/1.1');
    expect(mergedHeaders['X-Injected']).not.toMatch(/[\r\n]/);
  });
});
