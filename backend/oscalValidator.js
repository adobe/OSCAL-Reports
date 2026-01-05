/**
 * OSCAL Validator - Metaschema Framework Integration
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { validateWithSchema, getAJVValidatorStatus } from './oscalValidatorAJV.js';

/**
 * Check if Docker is available on the system
 */
async function isDockerAvailable() {
  return new Promise((resolve) => {
    exec('docker --version', (error) => {
      resolve(!error);
    });
  });
}

/**
 * Check if OSCAL CLI Docker image is available
 */
async function isOSCALCLIAvailable() {
  return new Promise((resolve) => {
    exec('docker images ghcr.io/metaschema-framework/oscal-cli:latest -q', (error, stdout) => {
      resolve(!error && stdout.trim().length > 0);
    });
  });
}

/**
 * Pull OSCAL CLI Docker image if not present
 * Note: The official image may not be publicly available
 */
async function pullOSCALCLI() {
  return new Promise((resolve, reject) => {
    console.log('Attempting to pull OSCAL CLI Docker image...');
    // Try usnistgov/oscal-cli if it exists
    exec('docker pull usnistgov/oscal-cli:latest', (error, stdout, stderr) => {
      if (error) {
        console.warn('OSCAL CLI Docker image not available:', stderr);
        reject(new Error(`OSCAL CLI Docker image not available. This is expected as the image may not be publicly released yet.`));
      } else {
        console.log('OSCAL CLI image pulled successfully');
        resolve(stdout);
      }
    });
  });
}

/**
 * Basic OSCAL structure validation (without Docker/OSCAL CLI)
 * Validates basic JSON structure and required fields
 */
function validateOSCALStructure(oscalData, type = 'ssp') {
  const errors = [];
  
  try {
    // Check if it's valid JSON
    if (!oscalData || typeof oscalData !== 'object') {
      errors.push({ type: 'ERROR', message: 'Invalid JSON structure' });
      return { valid: false, errors };
    }
    
    // Check for required OSCAL root element
    if (type === 'ssp') {
      if (!oscalData['system-security-plan']) {
        errors.push({ type: 'ERROR', message: 'Missing required "system-security-plan" root element' });
      } else {
        const ssp = oscalData['system-security-plan'];
        if (!ssp.uuid) errors.push({ type: 'ERROR', message: 'Missing required "uuid" field' });
        if (!ssp.metadata) errors.push({ type: 'ERROR', message: 'Missing required "metadata" field' });
      }
    } else if (type === 'catalog') {
      if (!oscalData['catalog']) {
        errors.push({ type: 'ERROR', message: 'Missing required "catalog" root element' });
      }
    } else if (type === 'profile') {
      if (!oscalData['profile']) {
        errors.push({ type: 'ERROR', message: 'Missing required "profile" root element' });
      }
    }
    
    return { valid: errors.length === 0, errors };
  } catch (err) {
    errors.push({ type: 'ERROR', message: err.message });
    return { valid: false, errors };
  }
}

/**
 * Validate OSCAL document using Metaschema Framework's OSCAL CLI
 * Falls back to basic validation if Docker/OSCAL CLI not available
 * 
 * @param {Object} oscalData - OSCAL JSON data
 * @param {string} type - OSCAL type: 'catalog', 'profile', 'ssp', 'sap', 'sar', 'poam'
 * @returns {Promise<Object>} Validation result
 */
async function validateOSCAL(oscalData, type = 'ssp', validationOptions = {}) {
  const startTime = Date.now();
  
  // Try AJV JSON Schema validation first (best option - inspired by oscal-editor)
  // Use validation options to determine strictness
  try {
    const ajvStatus = await getAJVValidatorStatus();
    if (ajvStatus.ready) {
      // Determine permissive mode based on user selections
      // If any strict option is enabled, use stricter validation
      const strictMode = validationOptions.stringPatterns 
        || validationOptions.enums 
        || validationOptions.formats 
        || validationOptions.lengthRestrictions 
        || validationOptions.additionalProperties;
      
      const permissiveMode = !strictMode || validationOptions.requiredFields === false;
      
      console.log(`Using AJV JSON Schema validation in ${permissiveMode ? 'PERMISSIVE' : 'STRICT'} mode with options:`, validationOptions);
      return await validateWithSchema(oscalData, type, permissiveMode, validationOptions);
    }
  } catch (error) {
    console.warn('AJV validation failed, falling back to basic validation:', error.message);
  }
  
  // Fallback to basic structure validation
  console.log('Using basic structure validation (AJV not available)');
  const structureCheck = validateOSCALStructure(oscalData, type);
  
  if (!structureCheck.valid) {
    return {
      valid: false,
      validated: true,
      message: 'OSCAL document has structural errors',
      errors: structureCheck.errors,
      type: type,
      framework: 'Basic Structure Validation',
      executionTime: Date.now() - startTime,
      note: 'Full schema validation available with AJV + OSCAL JSON Schema'
    };
  }
  
  // Check if Docker is available for CLI-based validation (future)
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    return {
      valid: true,
      validated: true,
      message: `OSCAL ${type} document passes basic structure validation.`,
      type: type,
      framework: 'Basic Structure Validation',
      executionTime: Date.now() - startTime,
      warning: 'Using basic validation only (AJV schema validator not available)',
      note: 'Full schema validation requires OSCAL JSON Schema'
    };
  }

  // Check if OSCAL CLI image is available
  const cliAvailable = await isOSCALCLIAvailable();
  if (!cliAvailable) {
    // OSCAL CLI Docker image not available - return success with basic validation
    // Don't attempt to pull the image as it's not publicly available yet
    return {
      valid: true,
      validated: true,
      message: `OSCAL ${type} document passes basic structure validation. Full Metaschema Framework validation will be available when the official OSCAL CLI Docker image is released.`,
      type: type,
      framework: 'Basic Structure Validation',
      executionTime: Date.now() - startTime,
      warning: 'OSCAL CLI Docker image not available - only basic structure validation performed',
      note: 'Full validation requires: docker pull ghcr.io/metaschema-framework/oscal-cli:latest (not yet publicly available)'
    };
  }

  // Create temporary directory for validation
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oscal-validation-'));
  const tempFile = path.join(tempDir, `oscal-${type}-${Date.now()}.json`);
  
  try {
    // Write OSCAL data to temporary file
    await fs.writeFile(tempFile, JSON.stringify(oscalData, null, 2), 'utf8');
    
    // Construct Docker command
    const dockerCmd = `docker run --rm -v "${tempDir}:/data" ghcr.io/metaschema-framework/oscal-cli:latest validate ${type} "/data/${path.basename(tempFile)}"`;
    
    console.log(`Validating OSCAL ${type} document...`);
    console.log(`Docker command: ${dockerCmd}`);
    
    // Run validation
    return new Promise((resolve) => {
      exec(dockerCmd, { maxBuffer: 10 * 1024 * 1024 }, async (error, stdout, stderr) => {
        // Cleanup temp files
        try {
          await fs.unlink(tempFile);
          await fs.rmdir(tempDir);
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }

        const executionTime = Date.now() - startTime;
        
        if (error) {
          // Validation failed
          const errorOutput = stderr || stdout || error.message;
          
          resolve({
            valid: false,
            validated: true,
            message: 'OSCAL document validation failed',
            errors: parseValidationErrors(errorOutput),
            rawOutput: errorOutput,
            type: type,
            framework: 'Metaschema Framework OSCAL CLI',
            executionTime: executionTime
          });
        } else {
          // Validation succeeded
          resolve({
            valid: true,
            validated: true,
            message: `OSCAL ${type} document is valid and compliant with Metaschema Framework`,
            output: stdout,
            type: type,
            framework: 'Metaschema Framework OSCAL CLI',
            executionTime: executionTime
          });
        }
      });
    });
  } catch (err) {
    // Cleanup on error
    try {
      await fs.unlink(tempFile).catch(() => {});
      await fs.rmdir(tempDir).catch(() => {});
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    
    return {
      valid: false,
      validated: false,
      message: 'Validation error',
      error: err.message,
      executionTime: Date.now() - startTime
    };
  }
}

/**
 * Parse validation errors from OSCAL CLI output
 * 
 * @param {string} output - CLI error output
 * @returns {Array} Array of parsed error objects
 */
function parseValidationErrors(output) {
  const errors = [];
  
  // Split output into lines
  const lines = output.split('\n');
  
  let currentError = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Look for error patterns
    if (trimmed.includes('ERROR') || trimmed.includes('error')) {
      if (currentError) {
        errors.push(currentError);
      }
      currentError = {
        type: 'ERROR',
        message: trimmed,
        line: null
      };
    } else if (trimmed.includes('WARNING') || trimmed.includes('warning')) {
      if (currentError) {
        errors.push(currentError);
      }
      currentError = {
        type: 'WARNING',
        message: trimmed,
        line: null
      };
    } else if (currentError && trimmed) {
      // Additional context for current error
      currentError.message += '\n' + trimmed;
    }
  }
  
  if (currentError) {
    errors.push(currentError);
  }
  
  // If no structured errors found, return raw output
  if (errors.length === 0 && output.trim()) {
    errors.push({
      type: 'ERROR',
      message: output.trim(),
      line: null
    });
  }
  
  return errors;
}

/**
 * Get validation status for display
 * 
 * @returns {Promise<Object>} Validator status
 */
async function getValidatorStatus() {
  // Check AJV validation status (primary)
  let ajvStatus;
  try {
    ajvStatus = await getAJVValidatorStatus();
  } catch (error) {
    ajvStatus = { ready: false };
  }
  
  // Check Docker/CLI status (secondary)
  const dockerAvailable = await isDockerAvailable();
  const cliAvailable = dockerAvailable ? await isOSCALCLIAvailable() : false;
  const fullValidationReady = dockerAvailable && cliAvailable;
  
  // Determine best available validator
  let bestFramework, message;
  if (ajvStatus.ready) {
    bestFramework = 'AJV JSON Schema Validator (OSCAL v2.1.0)';
    message = 'Full OSCAL JSON Schema validation available (from metaschema-framework/oscal-editor)';
  } else if (fullValidationReady) {
    bestFramework = 'Metaschema Framework OSCAL CLI';
    message = 'OSCAL CLI validation available';
  } else {
    bestFramework = 'Basic Structure Validation';
    message = 'Basic OSCAL structure validation available';
  }
  
  return {
    ready: true, // Always ready (at least basic validation)
    ajvSchemaValidation: ajvStatus.ready,
    basicValidation: true,
    cliValidation: fullValidationReady,
    dockerAvailable,
    oscalCliAvailable: cliAvailable,
    framework: bestFramework,
    message: message,
    schemaVersion: ajvStatus.schemaVersion || 'N/A',
    source: ajvStatus.ready ? 'metaschema-framework/oscal-editor' : null,
    image: 'ghcr.io/metaschema-framework/oscal-cli:latest',
    note: ajvStatus.ready 
      ? 'Using official OSCAL JSON Schema for validation'
      : 'Install OSCAL schema for full validation support'
  };
}

export {
  validateOSCAL,
  getValidatorStatus,
  isDockerAvailable,
  isOSCALCLIAvailable,
  pullOSCALCLI
};

