/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { URL } from 'url';
import dns from 'dns';
import { promisify } from 'util';
import ipaddr from 'ipaddr.js';

const dnsLookup = promisify(dns.lookup);

const PRIVATE_IP_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255', name: 'Private Class A' },
  { start: '172.16.0.0', end: '172.31.255.255', name: 'Private Class B' },
  { start: '192.168.0.0', end: '192.168.255.255', name: 'Private Class C' },
  { start: '127.0.0.0', end: '127.255.255.255', name: 'Loopback' },
  { start: '169.254.0.0', end: '169.254.255.255', name: 'Link-local / Cloud Metadata' },
  { start: '0.0.0.0', end: '0.255.255.255', name: 'Current network' },
  { start: '224.0.0.0', end: '239.255.255.255', name: 'Multicast' },
  { start: '240.0.0.0', end: '255.255.255.255', name: 'Reserved' },
];

const LOCALHOST_PATTERNS = [
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  '[::]',
];

const CLOUD_METADATA_ENDPOINTS = [
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.azure.internal',
  'metadata.aws.internal',
];

const DANGEROUS_PROTOCOLS = [
  'file:',
  'gopher:',
  'dict:',
  'ftp:',
  'data:',
  'javascript:',
];

const DOTTED_IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

function extractOriginalHostname(url) {
  const match = url.match(/^([a-z][a-z0-9+.-]*):\/\/(?:[^/@]*@)?(\[[^\]]+\]|[^/:?#]+)/i);
  if (!match) {
    return null;
  }
  let host = match[2];
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  return host;
}

function detectNonCanonicalIpEncoding(url, parsedHostname, rejectNonCanonicalIpEncoding) {
  if (!rejectNonCanonicalIpEncoding) {
    return null;
  }

  const originalHost = extractOriginalHostname(url);
  if (!originalHost) {
    return null;
  }

  const originalLower = originalHost.toLowerCase();
  const parsedLower = parsedHostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');

  if (/^0x[0-9a-f]+$/i.test(originalHost)) {
    return 'Non-canonical IP encoding is not allowed (hexadecimal hostname)';
  }

  if (/^0\d+$/.test(originalHost)) {
    return 'Non-canonical IP encoding is not allowed (octal hostname)';
  }

  if (/^\d+$/.test(originalHost) && !DOTTED_IPV4_REGEX.test(originalHost)) {
    return 'Non-canonical IP encoding is not allowed (decimal integer hostname)';
  }

  if (originalLower !== parsedLower && (ipaddr.isValid(originalHost) || ipaddr.isValid(parsedLower))) {
    return 'Non-canonical IP encoding is not allowed (hostname was normalized to a different IP form)';
  }

  if (/^::ffff:/i.test(originalHost) || /^::ffff:/i.test(parsedLower)) {
    if (originalLower !== parsedLower) {
      return 'Non-canonical IP encoding is not allowed (IPv4-mapped IPv6 hostname)';
    }
  }

  return null;
}

function parseIpAddress(hostname) {
  const clean = hostname.replace(/^\[/, '').replace(/\]$/, '');
  if (!ipaddr.isValid(clean)) {
    return null;
  }
  return ipaddr.parse(clean);
}

function isTrustedDomain(hostname, trustedDomains = []) {
  if (!Array.isArray(trustedDomains) || trustedDomains.length === 0) {
    return false;
  }
  const lowerHost = hostname.toLowerCase();
  return trustedDomains.some((domain) => {
    const lowerDomain = String(domain).toLowerCase();
    return lowerHost === lowerDomain || lowerHost.endsWith(`.${lowerDomain}`);
  });
}

function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  return parts[0] * 16777216 + parts[1] * 65536 + parts[2] * 256 + parts[3];
}

function isPrivateIP(ip) {
  const parsed = parseIpAddress(ip);
  if (parsed) {
    const range = parsed.range();
    if (range === 'loopback' || range === 'private' || range === 'linkLocal' || range === 'uniqueLocal') {
      const label = range === 'loopback' ? 'Loopback' : range === 'linkLocal' ? 'Link-local / Cloud Metadata' : 'Private';
      return { blocked: true, reason: `IP is in ${label} range`, isPrivateIP: true, isLocalhost: range === 'loopback' };
    }
    if (range === 'multicast' || range === 'reserved') {
      return { blocked: true, reason: `IP is in ${range} range`, isPrivateIP: true };
    }
    return false;
  }

  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }

  if (!ip.includes('.')) {
    return false;
  }

  const ipInt = ipToInt(ip);

  for (const range of PRIVATE_IP_RANGES) {
    const startInt = ipToInt(range.start);
    const endInt = ipToInt(range.end);

    if (ipInt >= startInt && ipInt <= endInt) {
      return { blocked: true, reason: `IP is in ${range.name} range (${range.start} - ${range.end})` };
    }
  }

  return false;
}

function isLocalhost(hostname) {
  const lowerHost = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (LOCALHOST_PATTERNS.some((pattern) => lowerHost === pattern || lowerHost.endsWith(`.${pattern}`))) {
    return true;
  }
  const parsed = parseIpAddress(lowerHost);
  return parsed?.range() === 'loopback';
}

function validateUrlStructure(url) {
  let parsedUrl;

  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  if (!['http:', 'https:'].includes(protocol)) {
    if (DANGEROUS_PROTOCOLS.includes(protocol)) {
      return {
        valid: false,
        error: `Dangerous protocol detected: ${protocol}`,
        blocked: true,
      };
    }
    return {
      valid: false,
      error: `Unsupported protocol: ${protocol}. Only HTTP and HTTPS are allowed.`,
    };
  }

  if (parsedUrl.username || parsedUrl.password) {
    return {
      valid: false,
      error: 'URLs with embedded credentials are not allowed',
      blocked: true,
    };
  }

  return { valid: true, parsedUrl };
}

function isCloudMetadata(hostname) {
  const lowerHost = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  if (CLOUD_METADATA_ENDPOINTS.some((endpoint) => lowerHost === endpoint || lowerHost.includes(endpoint))) {
    return true;
  }
  const parsed = parseIpAddress(lowerHost);
  if (parsed && parsed.kind() === 'ipv4') {
    return parsed.octets[0] === 169 && parsed.octets[1] === 254;
  }
  return false;
}

async function validateHostname(hostname) {
  const cleanHostname = hostname.replace(/^\[/, '').replace(/\]$/, '');

  if (isCloudMetadata(cleanHostname)) {
    return {
      valid: false,
      error: 'Cloud metadata endpoints are not allowed',
      blocked: true,
      isCloudMetadata: true,
    };
  }

  if (isLocalhost(cleanHostname)) {
    return {
      valid: false,
      error: 'Localhost URLs are not allowed',
      blocked: true,
      isLocalhost: true,
    };
  }

  if (cleanHostname.includes(':') || cleanHostname.startsWith('[')) {
    if (cleanHostname === '::1' || cleanHostname.startsWith('fe80:') || cleanHostname.startsWith('fc') || cleanHostname.startsWith('fd')) {
      return {
        valid: false,
        error: 'IPv6 private/loopback addresses are not allowed',
        blocked: true,
        isIPv6Private: true,
        isLocalhost: cleanHostname === '::1',
      };
    }
  }

  if (DOTTED_IPV4_REGEX.test(cleanHostname) || parseIpAddress(cleanHostname)) {
    if (isCloudMetadata(cleanHostname)) {
      return {
        valid: false,
        error: 'Cloud metadata endpoints are not allowed',
        blocked: true,
        isCloudMetadata: true,
      };
    }

    const privateCheck = isPrivateIP(cleanHostname);
    if (privateCheck) {
      return {
        valid: false,
        error: privateCheck.reason,
        blocked: true,
        isPrivateIP: true,
        isLocalhost: privateCheck.isLocalhost || false,
      };
    }
    return { valid: true, resolvedIp: cleanHostname };
  }

  try {
    const { address } = await dnsLookup(cleanHostname, { family: 4 });

    if (isCloudMetadata(address)) {
      return {
        valid: false,
        error: 'Hostname resolves to cloud metadata endpoint',
        blocked: true,
        resolvedIp: address,
        isCloudMetadata: true,
      };
    }

    const privateCheck = isPrivateIP(address);
    if (privateCheck) {
      return {
        valid: false,
        error: `Hostname resolves to private IP: ${privateCheck.reason}`,
        blocked: true,
        resolvedIp: address,
        isPrivateIP: true,
      };
    }

    return { valid: true, resolvedIp: address };
  } catch (error) {
    return {
      valid: false,
      error: `DNS resolution failed: ${error.message}`,
      blocked: false,
    };
  }
}

export async function validateUrl(url, options = {}) {
  const {
    allowPrivateIPs = false,
    allowLocalhost = false,
    skipDNSCheck = false,
    rejectNonCanonicalIpEncoding = true,
    requireTrustedDomain = false,
    trustedDomains = [],
  } = options;

  const structureCheck = validateUrlStructure(url);
  if (!structureCheck.valid) {
    return {
      valid: false,
      error: structureCheck.error,
      blocked: structureCheck.blocked || false,
    };
  }

  const { parsedUrl } = structureCheck;
  const parsedHostname = parsedUrl.hostname;

  const encodingError = detectNonCanonicalIpEncoding(url, parsedHostname, rejectNonCanonicalIpEncoding);
  if (encodingError) {
    return {
      valid: false,
      error: encodingError,
      blocked: true,
    };
  }

  if (requireTrustedDomain && !isTrustedDomain(parsedHostname, trustedDomains)) {
    return {
      valid: false,
      error: 'URL hostname is not in the trusted domain allowlist',
      blocked: true,
    };
  }

  if (!skipDNSCheck) {
    const hostnameCheck = await validateHostname(parsedHostname);

    if (!hostnameCheck.valid) {
      if (hostnameCheck.isCloudMetadata) {
        return {
          valid: false,
          error: hostnameCheck.error,
          blocked: true,
        };
      }

      if (hostnameCheck.blocked) {
        if (allowLocalhost && hostnameCheck.isLocalhost) {
          return {
            valid: true,
            warning: 'Localhost URL allowed by configuration',
            url: parsedUrl.href,
            hostname: parsedHostname,
            protocol: parsedUrl.protocol,
          };
        }

        if (allowPrivateIPs && hostnameCheck.isIPv6Private && !hostnameCheck.isLocalhost) {
          return {
            valid: true,
            warning: 'Private IPv6 address allowed by configuration',
            url: parsedUrl.href,
            hostname: parsedHostname,
            protocol: parsedUrl.protocol,
          };
        }

        if (allowPrivateIPs && (hostnameCheck.isPrivateIP || hostnameCheck.error.includes('private') || hostnameCheck.error.includes('Private'))) {
          if (!hostnameCheck.error.includes('Cloud Metadata') && !hostnameCheck.error.includes('Link-local')) {
            return {
              valid: true,
              warning: 'Private IP allowed by configuration',
              url: parsedUrl.href,
              hostname: parsedHostname,
              protocol: parsedUrl.protocol,
            };
          }
        }
      }

      return {
        valid: false,
        error: hostnameCheck.error,
        blocked: hostnameCheck.blocked,
        resolvedIp: hostnameCheck.resolvedIp,
      };
    }

    if (DOTTED_IPV4_REGEX.test(parsedHostname) && hostnameCheck.resolvedIp && hostnameCheck.resolvedIp !== parsedHostname) {
      return {
        valid: false,
        error: 'Resolved IP does not match hostname IP',
        blocked: true,
      };
    }
  }

  return {
    valid: true,
    url: parsedUrl.href,
    hostname: parsedHostname,
    protocol: parsedUrl.protocol,
  };
}

export function validateUrlMiddleware(source = 'body', fieldName = 'url', options = {}) {
  return async (req, res, next) => {
    const url = source === 'body' ? req.body[fieldName] : req.query[fieldName];

    if (!url) {
      return res.status(400).json({
        success: false,
        error: `${fieldName} is required`,
      });
    }

    try {
      const validation = await validateUrl(url, options);

      if (!validation.valid) {
        return res.status(validation.blocked ? 403 : 400).json({
          success: false,
          error: validation.error,
          blocked: validation.blocked,
          securityReason: validation.blocked ? 'SSRF_PREVENTION' : 'INVALID_URL',
        });
      }

      req.validatedUrl = validation.url;
      req.urlValidation = validation;

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'URL validation failed',
        details: error.message,
      });
    }
  };
}

export function validateUrlSync(url) {
  const structureCheck = validateUrlStructure(url);
  if (!structureCheck.valid) {
    return structureCheck;
  }

  const { parsedUrl } = structureCheck;
  const encodingError = detectNonCanonicalIpEncoding(url, parsedUrl.hostname, true);
  if (encodingError) {
    return {
      valid: false,
      error: encodingError,
      blocked: true,
    };
  }

  if (isLocalhost(parsedUrl.hostname)) {
    return {
      valid: false,
      error: 'Localhost URLs are not allowed',
      blocked: true,
    };
  }

  if (DOTTED_IPV4_REGEX.test(parsedUrl.hostname) || parseIpAddress(parsedUrl.hostname)) {
    const privateCheck = isPrivateIP(parsedUrl.hostname);
    if (privateCheck) {
      return {
        valid: false,
        error: privateCheck.reason,
        blocked: true,
      };
    }
  }

  return {
    valid: true,
    url: parsedUrl.href,
    warning: 'Only synchronous validation performed. DNS resolution skipped.',
  };
}

export default {
  validateUrl,
  validateUrlMiddleware,
  validateUrlSync,
};
