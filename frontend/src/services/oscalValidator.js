/**
 * OSCAL Validation Service - Frontend Client
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

/**
 * Get validator status from backend
 * 
 * @returns {Promise<Object>} Validator status
 */
export async function getValidatorStatus() {
  try {
    const response = await fetch('/api/validator/status');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error getting validator status:', error);
    return {
      dockerAvailable: false,
      oscalCliAvailable: false,
      ready: false,
      error: error.message
    };
  }
}

/**
 * Validate OSCAL document using Metaschema Framework OSCAL CLI
 * 
 * @param {Object} oscalData - OSCAL JSON data
 * @param {string} type - OSCAL type: 'catalog', 'profile', 'ssp', 'sap', 'sar', 'poam'
 * @param {Object} validationOptions - User-selected validation options
 * @returns {Promise<Object>} Validation result
 */
export async function validateOSCAL(oscalData, type = 'ssp', validationOptions = {}) {
  try {
    const response = await fetch('/api/validate-oscal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ oscalData, type, validationOptions })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error validating OSCAL:', error);
    return {
      valid: false,
      validated: false,
      message: 'Validation request failed',
      error: error.message
    };
  }
}

/**
 * Validate OSCAL SSP before export
 * 
 * @param {Object} sspData - SSP JSON data
 * @param {Object} validationOptions - User-selected validation options
 * @returns {Promise<Object>} Validation result
 */
export async function validateSSP(sspData, validationOptions = {}) {
  return validateOSCAL(sspData, 'ssp', validationOptions);
}

/**
 * Validate OSCAL Catalog
 * 
 * @param {Object} catalogData - Catalog JSON data
 * @returns {Promise<Object>} Validation result
 */
export async function validateCatalog(catalogData) {
  return validateOSCAL(catalogData, 'catalog');
}

/**
 * Validate OSCAL Profile
 * 
 * @param {Object} profileData - Profile JSON data
 * @returns {Promise<Object>} Validation result
 */
export async function validateProfile(profileData) {
  return validateOSCAL(profileData, 'profile');
}

