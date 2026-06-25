/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { extractOAuthPassClientSecret } from '../../../backend/utils/passResolver.js';

describe('extractOAuthPassClientSecret', () => {
  it('returns bare single-line secret unchanged', () => {
    expect(extractOAuthPassClientSecret(['4WBpGuq_secret_value'])).toBe('4WBpGuq_secret_value');
  });

  it('parses okta-client-secret= from multi-line PROD-style pass entry', () => {
    const lines = [
      'okta-domain=adobe.okta.com',
      'okta-client-id=0oa25w11rdfgPBeZ80h8',
      'okta-client-secret=4WBpGuq_eZjGeZx--b2eD9K74_mKfdw88hvfN55awp4zqFhpcCK7EqKQxXgNawli',
    ];
    expect(extractOAuthPassClientSecret(lines)).toBe(
      '4WBpGuq_eZjGeZx--b2eD9K74_mKfdw88hvfN55awp4zqFhpcCK7EqKQxXgNawli',
    );
  });

  it('parses client-secret= alias prefix', () => {
    expect(extractOAuthPassClientSecret(['client-secret=abc123'])).toBe('abc123');
  });
});
