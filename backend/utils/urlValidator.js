/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { URL } from 'url';
import dns from 'dns';
import { promisify } from 'util';

const dnsLookup = promisify(dns.lookup);

// Private IP ranges (CIDR notation)
const PRIVATE_IP_RANGES = [
  // IPv4 Private Ranges
  { start: '10.0.0.0', end: '10.255.255.255', name: 'Private Class A' },
  { start: '172.16.0.0', end: '172.31.255.255', name: 'Private Class B' },
  { start: '192.168.0.0', end: '192.168.255.255', name: 'Private Class C' },
  { start: '127.0.0.0', end: '127.255.255.255', name: 'Loopback' },
  { start: '169.254.0.0', end: '169.254.255.255', name: 'Link-local / Cloud Metadata' },
  { start: '0.0.0.0', end: '0.255.255.255', name: 'Current network' },
  { start: '224.0.0.0', end: '239.255.255.255', name: 'Multicast' },
  { start: '240.0.0.0', end: '255.255.255.255', name: 'Reserved' },
];

// Localhost patterns
const LOCALHOST_PATTERNS = [
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  '[::]',
];

// Cloud metadata endpoints that should always be blocked
const CLOUD_METADATA_ENDPOINTS = [
  '169.254.169.254',
  'metadata.google.internal',
  'metadata.azure.internal',
  'metadata.aws.internal',
];

// Dangerous protocols
const DANGEROUS_PROTOCOLS = [
  'file:',
  'gopher:',
  'dict:',
  'ftp:',
  'data:',
  'javascript:',
];

/**
 * Convert IP address to integer for range checking
 */
function ipToInt(ip) {
  const parts = ip.split('.').map(Number);
  return parts[0] * 16777216 + parts[1] * 65536 + parts[2] * 256 + parts[3];
}

/**
 * Check if IP is in a private range
 */
function isPrivateIP(ip) {
  // Check IPv6 loopback
  if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
    return true;
  }

  // Check IPv4
  if (!ip.includes('.')) {
    return false; // Not IPv4, skip range check
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

/**
 * Check if hostname is localhost
 */
function isLocalhost(hostname) {
  const lowerHost = hostname.toLowerCase();
  return LOCALHOST_PATTERNS.some(pattern => lowerHost === pattern || lowerHost.endsWith(`.${pattern}`));
}

/**
 * Validate URL structure and protocol
 */
function validateUrlStructure(url) {
  let parsedUrl;
  
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Check protocol
  const protocol = parsedUrl.protocol.toLowerCase();
  if (!['http:', 'https:'].includes(protocol)) {
    if (DANGEROUS_PROTOCOLS.includes(protocol)) {
      return { 
        valid: false, 
        error: `Dangerous protocol detected: ${protocol}`,
        blocked: true 
      };
    }
    return { 
      valid: false, 
      error: `Unsupported protocol: ${protocol}. Only HTTP and HTTPS are allowed.` 
    };
  }

  // Check for credentials in URL
  if (parsedUrl.username || parsedUrl.password) {
    return { 
      valid: false, 
      error: 'URLs with embedded credentials are not allowed',
      blocked: true 
    };
  }

  return { valid: true, parsedUrl };
}

/**
 * Check if hostname/IP is a cloud metadata endpoint (always blocked)
 */
function isCloudMetadata(hostname) {
  const lowerHost = hostname.toLowerCase();
  return CLOUD_METADATA_ENDPOINTS.some(endpoint => 
    lowerHost === endpoint || lowerHost.includes(endpoint)
  );
}

/**
 * Resolve hostname to IP and validate
 */
async function validateHostname(hostname) {
  // Always block cloud metadata endpoints
  if (isCloudMetadata(hostname)) {
    return {
      valid: false,
      error: 'Cloud metadata endpoints are not allowed',
      blocked: true,
      isCloudMetadata: true
    };
  }

  // Check if hostname is localhost
  if (isLocalhost(hostname)) {
    return { 
      valid: false, 
      error: 'Localhost URLs are not allowed',
      blocked: true,
      isLocalhost: true
    };
  }

  // Check for IPv6 addresses
  if (hostname.includes(':') || hostname.startsWith('[')) {
    const cleanHost = hostname.replace(/[\[\]]/g, '');
    if (cleanHost === '::1' || cleanHost.startsWith('fe80:') || cleanHost.startsWith('fc') || cleanHost.startsWith('fd')) {
      return {
        valid: false,
        error: 'IPv6 private/loopback addresses are not allowed',
        blocked: true,
        isIPv6Private: true,
        isLocalhost: cleanHost === '::1'  // Mark if it's loopback
      };
    }
  }

  // If hostname is already an IP, validate it directly
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    // Check for cloud metadata IP
    if (isCloudMetadata(hostname)) {
      return {
        valid: false,
        error: 'Cloud metadata endpoints are not allowed',
        blocked: true,
        isCloudMetadata: true
      };
    }
    
    const privateCheck = isPrivateIP(hostname);
    if (privateCheck) {
      return { 
        valid: false, 
        error: privateCheck.reason,
        blocked: true,
        isPrivateIP: true
      };
    }
    return { valid: true };
  }

  // Resolve hostname to IP
  try {
    const { address } = await dnsLookup(hostname, { family: 4 });
    
    // Check if resolved IP is cloud metadata
    if (isCloudMetadata(address)) {
      return {
        valid: false,
        error: `Hostname resolves to cloud metadata endpoint`,
        blocked: true,
        resolvedIp: address,
        isCloudMetadata: true
      };
    }
    
    // Check if resolved IP is private
    const privateCheck = isPrivateIP(address);
    if (privateCheck) {
      return { 
        valid: false, 
        error: `Hostname resolves to private IP: ${privateCheck.reason}`,
        blocked: true,
        resolvedIp: address,
        isPrivateIP: true
      };
    }

    return { valid: true, resolvedIp: address };
  } catch (error) {
    return { 
      valid: false, 
      error: `DNS resolution failed: ${error.message}`,
      blocked: false // Not blocked, just unreachable
    };
  }
}

/**
 * Main validation function - validates URL against SSRF attacks
 * 
 * @param {string} url - The URL to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.allowPrivateIPs - Allow private IPs (default: false)
 * @param {boolean} options.allowLocalhost - Allow localhost (default: false)
 * @param {boolean} options.skipDNSCheck - Skip DNS resolution check (default: false)
 * @returns {Promise<Object>} - Validation result
 */
export async function validateUrl(url, options = {}) {
  const {
    allowPrivateIPs = false,
    allowLocalhost = false,
    skipDNSCheck = false,
  } = options;

  // Step 1: Validate URL structure and protocol
  const structureCheck = validateUrlStructure(url);
  if (!structureCheck.valid) {
    return {
      valid: false,
      error: structureCheck.error,
      blocked: structureCheck.blocked || false,
    };
  }

  const { parsedUrl } = structureCheck;

  // Step 2: Validate hostname
  if (!skipDNSCheck) {
    const hostnameCheck = await validateHostname(parsedUrl.hostname);
    
    if (!hostnameCheck.valid) {
      // Cloud metadata endpoints are NEVER allowed
      if (hostnameCheck.isCloudMetadata) {
        return {
          valid: false,
          error: hostnameCheck.error,
          blocked: true,
        };
      }
      
      // Allow override for private IPs/localhost if configured
      if (hostnameCheck.blocked) {
        // Check for localhost override (includes IPv6 loopback ::1)
        if (allowLocalhost && hostnameCheck.isLocalhost) {
          return { 
            valid: true, 
            warning: 'Localhost URL allowed by configuration',
            url: parsedUrl.href,
            hostname: parsedUrl.hostname,
            protocol: parsedUrl.protocol,
          };
        }
        
        // Check for private IP override (includes IPv6 private but NOT loopback)
        if (allowPrivateIPs && hostnameCheck.isIPv6Private && !hostnameCheck.isLocalhost) {
          return { 
            valid: true, 
            warning: 'Private IPv6 address allowed by configuration',
            url: parsedUrl.href,
            hostname: parsedUrl.hostname,
            protocol: parsedUrl.protocol,
          };
        }
        
        // Check for private IP override (IPv4 private ranges or resolved private IPs)
        if (allowPrivateIPs && (hostnameCheck.isPrivateIP || hostnameCheck.error.includes('private') || hostnameCheck.error.includes('Private'))) {
          // But NOT cloud metadata (169.254.x.x range)
          if (!hostnameCheck.error.includes('Cloud Metadata') && !hostnameCheck.error.includes('Link-local')) {
            return { 
              valid: true, 
              warning: 'Private IP allowed by configuration',
              url: parsedUrl.href,
              hostname: parsedUrl.hostname,
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
  }

  return {
    valid: true,
    url: parsedUrl.href,
    hostname: parsedUrl.hostname,
    protocol: parsedUrl.protocol,
  };
}

/**
 * Express middleware for URL validation
 * 
 * Usage:
 *   app.post('/api/fetch', validateUrlMiddleware('body', 'url'), handler);
 */
export function validateUrlMiddleware(source = 'body', fieldName = 'url', options = {}) {
  return async (req, res, next) => {
    const url = source === 'body' ? req.body[fieldName] : req.query[fieldName];
    
    if (!url) {
      return res.status(400).json({ 
        success: false,
        error: `${fieldName} is required` 
      });
    }

    try {
      const validation = await validateUrl(url, options);
      
      if (!validation.valid) {
        return res.status(400).json({ 
          success: false,
          error: validation.error,
          blocked: validation.blocked,
          securityReason: validation.blocked ? 'SSRF_PREVENTION' : 'INVALID_URL',
        });
      }

      // Attach validated URL to request
      req.validatedUrl = validation.url;
      req.urlValidation = validation;
      
      next();
    } catch (error) {
      return res.status(500).json({ 
        success: false,
        error: 'URL validation failed',
        details: error.message 
      });
    }
  };
}

/**
 * Quick synchronous validation (structure only, no DNS check)
 */
export function validateUrlSync(url) {
  const structureCheck = validateUrlStructure(url);
  if (!structureCheck.valid) {
    return structureCheck;
  }

  const { parsedUrl } = structureCheck;
  
  // Quick localhost check
  if (isLocalhost(parsedUrl.hostname)) {
    return { 
      valid: false, 
      error: 'Localhost URLs are not allowed',
      blocked: true 
    };
  }

  // Quick IP check (if hostname is an IP)
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(parsedUrl.hostname)) {
    const privateCheck = isPrivateIP(parsedUrl.hostname);
    if (privateCheck) {
      return { 
        valid: false, 
        error: privateCheck.reason,
        blocked: true 
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
