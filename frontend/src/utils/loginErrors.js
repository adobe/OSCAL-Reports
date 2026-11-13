/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Turns the sign-in error the server reported (in the query string of the redirect back to the login page) into a message
 * built from what actually failed: the host, the real system error, the setting that is missing or the address refused.
 * The query string is attacker-controllable, so only values that match a strict pattern are used, and nothing is printed raw.
 */
const SAFE = {
  host: /^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/,
  detail: /^[A-Z][A-Z0-9_]{1,59}$/,
  status: /^[1-5][0-9]{2}$/,
  missing: /^[a-z][a-z-]{1,30}$/,
  redirect: /^https?:\/\/[A-Za-z0-9.:[\]-]{1,200}(\/[A-Za-z0-9._~/-]{0,100})?$/,
};

const NETWORK_REASON = {
  EHOSTUNREACH: 'no route to the host',
  ENETUNREACH: 'the network is unreachable',
  ECONNREFUSED: 'the connection was refused',
  ENOTFOUND: 'the name could not be resolved',
  EAI_AGAIN: 'the name could not be resolved',
  ETIMEDOUT: 'the connection timed out',
  ECONNABORTED: 'the connection timed out',
  ECONNRESET: 'the connection was reset',
};

const MISSING_REASON = {
  'oauth-disabled': 'SSO sign-in is turned off in Settings',
  'provider-missing': 'the Generic SSO provider has no settings',
  'provider-disabled': 'the Generic SSO provider is disabled in Settings',
  'client-id': 'the client ID is missing',
  'discovery-url': 'the discovery URL is missing',
  'client-secret': 'the client secret is missing or could not be read',
};

export function loginErrorMessageFromSearch(search) {
  const params = new globalThis.URLSearchParams(search || '');
  const error = params.get('error');
  const field = name => {
    const value = params.get(name);
    return value && SAFE[name].test(value) ? value : '';
  };
  const server = field('host') ? `the SSO server ${field('host')}` : 'the SSO server';

  switch (error) {
    case 'okta_not_configured':
      return 'Okta sign-in is not configured. Enable OAuth and Okta in Settings → SSO Integration.';
    case 'generic_oidc_not_configured': {
      const reason = MISSING_REASON[field('missing')] || 'one or more required settings are missing';
      return `Generic SSO is not configured: ${reason}. Check Settings → SSO Integration.`;
    }
    case 'generic_oidc_redirect_not_allowed': {
      const redirect = field('redirect');
      return `The sign-in callback address${redirect ? ` ${redirect}` : ''} is not in the allowed redirect list for Generic SSO. ` +
        'Add it under Settings → SSO Integration, or sign in from an allowed address.';
    }
    case 'generic_oidc_unreachable': {
      const code = field('detail') || 'UNKNOWN';
      const reason = NETWORK_REASON[code] || `network error ${code}`;
      return `Could not reach ${server}: ${reason} (${code}). The OSCAL server is running, but it could not connect to the ` +
        "identity provider. Check the OSCAL server's network connection, VPN, DNS and firewall.";
    }
    case 'generic_oidc_tls':
      return `The certificate of ${server} could not be verified (${field('detail') || 'UNKNOWN'}). ` +
        'The identity provider may be serving an incomplete or expired certificate chain.';
    case 'generic_oidc_discovery_failed':
      return `${server.charAt(0).toUpperCase()}${server.slice(1)} answered with HTTP ${field('status') || 'an error'} instead of its sign-in configuration.`;
    case 'generic_oidc_discovery_invalid':
      return `${server.charAt(0).toUpperCase()}${server.slice(1)} responded, but its configuration has no authorization endpoint.`;
    default:
      return null;
  }
}
