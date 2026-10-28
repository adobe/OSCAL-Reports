/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const lookup = jest.fn();
const send = jest.fn();
jest.unstable_mockModule('node:dns/promises', () => ({ lookup }));
jest.unstable_mockModule('axios', () => ({ default: { request: send } }));
const { publicHttpsRequest } = await import('../../../backend/guardianService.js');

beforeEach(() => {
  lookup.mockReset();
  send.mockReset();
  lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
});

describe('Guardian HTTPS transport', () => {
  it.each(['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1'])('rejects nonpublic DNS answer %s', async address => {
    lookup.mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);
    await expect(publicHttpsRequest({ url: 'https://guardian.amsgovcloud.com.au/test' })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it('rejects mixed public/private DNS answers', async () => {
    lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 }]);
    await expect(publicHttpsRequest({ url: 'https://guardian.amsgovcloud.com.au/test' })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it('pins DNS to TLS requests and disables redirects/proxies', async () => {
    send.mockImplementation(async options => {
      expect(options).toMatchObject({ maxRedirects: 0, proxy: false, timeout: 15000 });
      await new Promise((resolve, reject) => options.httpsAgent.options.lookup('guardian.amsgovcloud.com.au', {}, (error, address, family) => {
        if (error) { reject(error); return; }
        expect(address).toBe('8.8.8.8');
        expect(family).toBe(4);
        resolve();
      }));
      return { status: 200 };
    });
    await expect(publicHttpsRequest({ url: 'https://guardian.amsgovcloud.com.au/test' })).resolves.toMatchObject({ status: 200 });
  });
  it.each(['http://guardian.amsgovcloud.com.au/test', 'https://user:password@guardian.amsgovcloud.com.au/test'])('rejects unsafe URL %s', async url => {
    await expect(publicHttpsRequest({ url })).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});