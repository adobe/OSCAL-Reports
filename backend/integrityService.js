/**
 * OSCAL File Integrity Service - FIPS 140-2 Compliant
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 * 
 * Provides FIPS 140-2 compliant file integrity checking for OSCAL exports.
 * Uses SHA-256 (FIPS 180-4 approved) for cryptographic hashing.
 */

import crypto from 'crypto';

/**
 * FIPS 140-2 Compliant Integrity Hash Property Name
 * Stored in OSCAL metadata properties array
 */
export const INTEGRITY_PROPERTY_NAME = 'file-integrity-hash';
export const INTEGRITY_ALGORITHM = 'sha256'; // FIPS 180-4 approved
export const INTEGRITY_PROPERTY_NAMESPACE = 'https://oscal-report-generator.adobe.com/ns/integrity';

/**
 * Recursively normalize JSON object by sorting all keys at all levels
 * This ensures consistent hashing regardless of key order
 * 
 * @param {any} obj - Object, array, or primitive value to normalize
 * @returns {any} Normalized object with sorted keys
 */
function normalizeJsonRecursive(obj) {
  // Handle null and undefined
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  // Handle primitives (string, number, boolean)
  if (typeof obj !== 'object') {
    return obj;
  }
  
  // Handle arrays - normalize each element but maintain order
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeJsonRecursive(item));
  }
  
  // Handle objects - sort keys and recursively normalize values
  const sortedKeys = Object.keys(obj).sort();
  const normalized = {};
  
  for (const key of sortedKeys) {
    normalized[key] = normalizeJsonRecursive(obj[key]);
  }
  
  return normalized;
}

/**
 * Calculate SHA-256 hash of OSCAL JSON content (FIPS 140-2 compliant)
 * Uses recursive key sorting to ensure consistent hashing
 * 
 * @param {object} oscalData - OSCAL JSON object
 * @returns {string} Hexadecimal SHA-256 hash
 */
export function calculateIntegrityHash(oscalData) {
  try {
    // Create a copy of the data without the integrity property to avoid circular dependency
    const dataToHash = removeIntegrityProperty(JSON.parse(JSON.stringify(oscalData)));
    
    // Log metadata props for debugging
    const metadata = dataToHash['system-security-plan']?.metadata || dataToHash.metadata;
    const props = metadata?.props || [];
    console.log(`   Props in data to hash: ${props.length} properties`);
    props.forEach((p, i) => {
      console.log(`     [${i}] ${p.name} (ns: ${p.ns?.split('/').pop() || 'none'})`);
    });
    
    // Recursively normalize the entire structure (sort all keys at all levels)
    const normalizedData = normalizeJsonRecursive(dataToHash);
    
    // Convert to normalized JSON string (no whitespace, deterministic order)
    const normalizedJson = JSON.stringify(normalizedData);
    
    // Log JSON characteristics for debugging
    console.log(`   Normalized JSON length: ${normalizedJson.length} chars`);
    console.log(`   First 200 chars: ${normalizedJson.substring(0, 200)}...`);
    console.log(`   Last 200 chars: ...${normalizedJson.substring(normalizedJson.length - 200)}`);
    
    // Calculate SHA-256 hash (FIPS 180-4 approved)
    const hash = crypto.createHash(INTEGRITY_ALGORITHM);
    hash.update(normalizedJson, 'utf8');
    
    return hash.digest('hex');
  } catch (error) {
    console.error('❌ Error calculating integrity hash:', error);
    console.error('❌ Error stack:', error.stack);
    throw new Error(`Failed to calculate integrity hash: ${error.message}`);
  }
}

/**
 * Remove integrity property from OSCAL data before hashing
 * This prevents circular dependency where hash includes itself
 * 
 * @param {object} oscalData - OSCAL JSON object
 * @returns {object} OSCAL data without integrity property
 */
function removeIntegrityProperty(oscalData) {
  // Handle different OSCAL structures
  if (oscalData['system-security-plan']) {
    const ssp = oscalData['system-security-plan'];
    if (ssp.metadata && ssp.metadata.props) {
      ssp.metadata.props = ssp.metadata.props.filter(
        prop => !(prop.name === INTEGRITY_PROPERTY_NAME && 
                  prop.ns === INTEGRITY_PROPERTY_NAMESPACE) &&
                !(prop.name === 'file-integrity-timestamp' && 
                  prop.ns === INTEGRITY_PROPERTY_NAMESPACE)
      );
    }
  } else if (oscalData.metadata && oscalData.metadata.props) {
    oscalData.metadata.props = oscalData.metadata.props.filter(
      prop => !(prop.name === INTEGRITY_PROPERTY_NAME && 
                prop.ns === INTEGRITY_PROPERTY_NAMESPACE) &&
                !(prop.name === 'file-integrity-timestamp' && 
                  prop.ns === INTEGRITY_PROPERTY_NAMESPACE)
    );
  }
  
  return oscalData;
}

/**
 * Add integrity hash to OSCAL metadata properties
 * 
 * @param {object} oscalData - OSCAL JSON object
 * @returns {object} OSCAL data with integrity hash added
 */
export function addIntegrityHash(oscalData) {
  try {
    console.log('🔐 Starting integrity hash addition...');
    console.log('📊 OSCAL data structure:', oscalData ? 'exists' : 'missing');
    console.log('📊 Has system-security-plan:', !!oscalData?.['system-security-plan']);
    
    const hash = calculateIntegrityHash(oscalData);
    console.log('✅ Hash calculated:', hash.substring(0, 16) + '...');
    
    // Ensure metadata structure exists
    let metadata;
    if (oscalData['system-security-plan']) {
      if (!oscalData['system-security-plan'].metadata) {
        console.log('⚠️ Creating metadata object');
        oscalData['system-security-plan'].metadata = {};
      }
      metadata = oscalData['system-security-plan'].metadata;
      console.log('✅ Found metadata in system-security-plan');
    } else {
      if (!oscalData.metadata) {
        console.log('⚠️ Creating metadata object at root');
        oscalData.metadata = {};
      }
      metadata = oscalData.metadata;
      console.log('✅ Found metadata at root');
    }
    
    // Ensure props array exists (create new array if needed to avoid mutation issues)
    if (!metadata.props || !Array.isArray(metadata.props)) {
      console.log('⚠️ Creating props array');
      metadata.props = [];
    } else {
      // Create a new array to avoid mutating the original
      console.log('📋 Existing props count:', metadata.props.length);
      metadata.props = [...metadata.props];
    }
    
    // Remove existing integrity hash if present
    const beforeFilter = metadata.props.length;
    metadata.props = metadata.props.filter(
      prop => !(prop.name === INTEGRITY_PROPERTY_NAME && 
                prop.ns === INTEGRITY_PROPERTY_NAMESPACE) &&
              !(prop.name === 'file-integrity-timestamp' && 
                prop.ns === INTEGRITY_PROPERTY_NAMESPACE)
    );
    const afterFilter = metadata.props.length;
    if (beforeFilter !== afterFilter) {
      console.log(`🧹 Removed ${beforeFilter - afterFilter} existing integrity properties`);
    }
    
    // Add new integrity hash property
    const hashProp = {
      name: INTEGRITY_PROPERTY_NAME,
      ns: INTEGRITY_PROPERTY_NAMESPACE,
      value: hash,
      'class': 'integrity',
      remarks: `FIPS 140-2 compliant SHA-256 hash for file integrity verification. Algorithm: ${INTEGRITY_ALGORITHM.toUpperCase()}.`
    };
    metadata.props.push(hashProp);
    console.log('✅ Added integrity hash property');
    
    // Add timestamp
    const timestampProp = {
      name: 'file-integrity-timestamp',
      ns: INTEGRITY_PROPERTY_NAMESPACE,
      value: new Date().toISOString(),
      'class': 'integrity',
      remarks: 'Timestamp when integrity hash was calculated.'
    };
    metadata.props.push(timestampProp);
    console.log('✅ Added integrity timestamp property');
    console.log('📊 Final props count:', metadata.props.length);
    
    return oscalData;
  } catch (error) {
    console.error('❌ Error adding integrity hash:', error);
    console.error('❌ Error stack:', error.stack);
    throw new Error(`Failed to add integrity hash: ${error.message}`);
  }
}

/**
 * Verify integrity hash of OSCAL file
 * 
 * @param {object} oscalData - OSCAL JSON object
 * @returns {object} Verification result with status and details
 */
export function verifyIntegrityHash(oscalData) {
  try {
    console.log('🔐 Starting integrity verification...');
    console.log('📊 OSCAL structure:', oscalData ? (oscalData['system-security-plan'] ? 'SSP format' : 'Other format') : 'Missing');
    
    // Extract integrity hash from OSCAL metadata
    const storedHash = extractIntegrityHash(oscalData);
    
    if (!storedHash) {
      console.log('ℹ️ No integrity hash found in file');
      return {
        valid: false,
        verified: false,
        reason: 'No integrity hash found in OSCAL file. File may not have been exported by this tool.',
        hasHash: false
      };
    }
    
    console.log('✅ Stored hash found:', storedHash.substring(0, 16) + '...');
    console.log('   Full stored hash:', storedHash);
    
    // Calculate hash of current content
    console.log('🔄 Calculating hash of current file content...');
    const calculatedHash = calculateIntegrityHash(oscalData);
    console.log('✅ Calculated hash:', calculatedHash.substring(0, 16) + '...');
    console.log('   Full calculated hash:', calculatedHash);
    
    // Compare hashes
    const isValid = storedHash === calculatedHash;
    
    if (isValid) {
      console.log('✅ File integrity verified - hashes match');
    } else {
      console.warn('⚠️ File integrity check FAILED - hashes do not match');
      console.warn('   Stored:   ', storedHash.substring(0, 32) + '...');
      console.warn('   Calculated:', calculatedHash.substring(0, 32) + '...');
    }
    
    return {
      valid: isValid,
      verified: true,
      hasHash: true,
      storedHash: storedHash,
      calculatedHash: calculatedHash,
      algorithm: INTEGRITY_ALGORITHM.toUpperCase(),
      reason: isValid 
        ? 'File integrity verified. File has not been modified since export.' 
        : 'File integrity check failed. File has been modified since export.',
      timestamp: extractIntegrityTimestamp(oscalData)
    };
  } catch (error) {
    console.error('❌ Error verifying integrity hash:', error);
    console.error('❌ Error stack:', error.stack);
    return {
      valid: false,
      verified: false,
      hasHash: false,
      reason: `Integrity verification error: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Extract integrity hash from OSCAL metadata properties
 * 
 * @param {object} oscalData - OSCAL JSON object
 * @returns {string|null} Integrity hash or null if not found
 */
function extractIntegrityHash(oscalData) {
  try {
    let metadata;
    
    if (oscalData['system-security-plan']) {
      metadata = oscalData['system-security-plan'].metadata;
    } else {
      metadata = oscalData.metadata;
    }
    
    if (!metadata || !metadata.props) {
      return null;
    }
    
    const integrityProp = metadata.props.find(
      prop => prop.name === INTEGRITY_PROPERTY_NAME && 
              prop.ns === INTEGRITY_PROPERTY_NAMESPACE
    );
    
    return integrityProp ? integrityProp.value : null;
  } catch (error) {
    console.error('❌ Error extracting integrity hash:', error);
    return null;
  }
}

/**
 * Extract integrity timestamp from OSCAL metadata properties
 * 
 * @param {object} oscalData - OSCAL JSON object
 * @returns {string|null} Timestamp or null if not found
 */
function extractIntegrityTimestamp(oscalData) {
  try {
    let metadata;
    
    if (oscalData['system-security-plan']) {
      metadata = oscalData['system-security-plan'].metadata;
    } else {
      metadata = oscalData.metadata;
    }
    
    if (!metadata || !metadata.props) {
      return null;
    }
    
    const timestampProp = metadata.props.find(
      prop => prop.name === 'file-integrity-timestamp' && 
              prop.ns === INTEGRITY_PROPERTY_NAMESPACE
    );
    
    return timestampProp ? timestampProp.value : null;
  } catch (error) {
    return null;
  }
}

/**
 * Get integrity information from OSCAL file (without verification)
 * Useful for displaying hash information
 * 
 * @param {object} oscalData - OSCAL JSON object
 * @returns {object} Integrity information
 */
export function getIntegrityInfo(oscalData) {
  const hash = extractIntegrityHash(oscalData);
  const timestamp = extractIntegrityTimestamp(oscalData);
  
  return {
    hasIntegrityHash: !!hash,
    hash: hash,
    timestamp: timestamp,
    algorithm: INTEGRITY_ALGORITHM.toUpperCase(),
    fipsCompliant: true,
    fipsStandard: 'FIPS 140-2 / FIPS 180-4'
  };
}

