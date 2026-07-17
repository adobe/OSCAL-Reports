/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { jest } from '@jest/globals';
import { execSync, spawnSync } from 'child_process';

const mockExecSync = jest.fn();
const mockSpawnSync = jest.fn();

jest.unstable_mockModule('child_process', () => ({
  execSync: mockExecSync,
  spawnSync: mockSpawnSync,
}));

const {
  getPassBundleEntry,
  readPassBundle,
  getPassBundleSecret,
  mergePassBundlePartial,
  clearPassBundleCache,
  isLogicalBundleKey,
} = await import('../../../backend/utils/passBundle.js');

const BUNDLE_JSON = JSON.stringify({
  entries: {
    'OSCAL/slack-webhook-url': 'slack-secret',
    'OSCAL/sso-oauth-okta-client-secret': 'line1\nclient-secret=okta-value',
  },
  _meta: { keys: { 'OSCAL/slack-webhook-url': { t: 1 } } },
});

describe('passBundle', () => {
  beforeEach(() => {
    delete process.env.OSCAL_PASS_DISABLED;
    delete process.env.OSCAL_PASS_BUNDLE_ENTRY;
    clearPassBundleCache();
    mockExecSync.mockReset();
    mockSpawnSync.mockReset();
  });

  it('getPassBundleEntry defaults to PROD/OSCAL/AWS_SM', () => {
    expect(getPassBundleEntry()).toBe('PROD/OSCAL/AWS_SM');
  });

  it('getPassBundleEntry respects OSCAL_PASS_BUNDLE_ENTRY', () => {
    process.env.OSCAL_PASS_BUNDLE_ENTRY = 'CUSTOM/bundle';
    expect(getPassBundleEntry()).toBe('CUSTOM/bundle');
  });

  it('isLogicalBundleKey recognizes sensitive config keys', () => {
    expect(isLogicalBundleKey('OSCAL/slack-webhook-url')).toBe(true);
    expect(isLogicalBundleKey('AWS/other')).toBe(false);
  });

  it('readPassBundle parses bundle JSON from pass show', () => {
    mockExecSync.mockReturnValue(BUNDLE_JSON);
    const bundle = readPassBundle(false);
    expect(bundle.entries['OSCAL/slack-webhook-url']).toBe('slack-secret');
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('pass show'),
      expect.objectContaining({ encoding: 'utf8' }),
    );
  });

  it('getPassBundleSecret returns normalized OAuth secret from bundle', () => {
    mockExecSync.mockReturnValue(BUNDLE_JSON);
    expect(getPassBundleSecret('OSCAL/slack-webhook-url')).toBe('slack-secret');
    expect(getPassBundleSecret('OSCAL/sso-oauth-okta-client-secret')).toBe('okta-value');
  });

  it('mergePassBundlePartial writes merged JSON via pass insert', () => {
    mockExecSync.mockReturnValue(JSON.stringify({ entries: {}, _meta: { keys: {} } }));
    mockSpawnSync.mockReturnValue({ status: 0, stderr: '' });
    const result = mergePassBundlePartial({ 'OSCAL/slack-webhook-url': 'new-slack' });
    expect(result.success).toBe(true);
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'pass',
      ['insert', '-m', '-f', 'PROD/OSCAL/AWS_SM'],
      expect.objectContaining({ input: expect.stringContaining('new-slack') }),
    );
  });

  it('mergePassBundlePartial skips when OSCAL_PASS_DISABLED', () => {
    process.env.OSCAL_PASS_DISABLED = '1';
    const result = mergePassBundlePartial({ 'OSCAL/slack-webhook-url': 'x' });
    expect(result.success).toBe(false);
    expect(mockSpawnSync).not.toHaveBeenCalled();
  });
});
