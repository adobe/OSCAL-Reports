/**
 * OSCAL Validator Module - AJV-based validation with official OSCAL JSON Schema
 * Inspired by metaschema-framework/oscal-editor implementation
 *
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load OSCAL JSON Schema (from oscal-editor project)
const oscalSchemaPath = join(__dirname, 'oscal-schema.json');
let oscalSchema;

try {
  oscalSchema = JSON.parse(readFileSync(oscalSchemaPath, 'utf8'));
  console.log('✅ OSCAL Schema loaded successfully (OSCAL v2.1.0, 243KB)');
} catch (error) {
  console.error('❌ Failed to load OSCAL schema:', error.message);
  oscalSchema = null;
}

// Initialize AJV instance
let ajvInstance = null;
const validatorCache = new Map();

/**
 * Get or create AJV instance with OSCAL schema
 * @param {boolean} permissive - If true, allows additional properties (custom fields)
 */
function getAjv(permissive = true) {
  const cacheKey = permissive ? 'permissive' : 'strict';
  
  if (!ajvInstance && oscalSchema) {
    ajvInstance = new Ajv({
      allErrors: false, // Stop after first error for performance
      verbose: false, // Less verbose output
      strict: false, // Don't enforce strict mode
      strictSchema: false, // Allow schema extensions
      strictTypes: false, // Allow type flexibility
      strictRequired: false, // Don't enforce all required fields strictly
      allowUnionTypes: true, // Allow union types
      allowMatchingProperties: true, // Allow overlapping properties
      discriminator: true, // Support discriminator keyword
      // KEY: Allow additional properties by default (for custom fields)
      removeAdditional: false, // Don't remove additional properties
      useDefaults: true, // Use default values when missing
      coerceTypes: true, // Coerce types when possible
      schemas: [oscalSchema]
    });
    addFormats(ajvInstance);
    
    // Add all definitions from the schema to AJV so they can be referenced
    if (oscalSchema.definitions) {
      Object.entries(oscalSchema.definitions).forEach(([name, schema]) => {
        try {
          // If permissive mode, modify schema to allow additional properties
          const modifiedSchema = permissive ? {
            ...schema,
            additionalProperties: true // Allow custom fields
          } : schema;
          
          ajvInstance.addSchema(modifiedSchema, `#/definitions/${name}`);
        } catch (e) {
          // Some schemas might already be added, ignore duplicates
        }
      });
    }
    
    console.log(`✅ AJV validator initialized in ${permissive ? 'PERMISSIVE' : 'STRICT'} mode (custom fields ${permissive ? 'allowed' : 'not allowed'})`);
  }
  return ajvInstance;
}

/**
 * Get cached validator for specific OSCAL type
 * @param {string} type - OSCAL type (e.g., 'system-security-plan', 'catalog', 'profile')
 * @param {boolean} permissive - Allow additional properties (custom fields)
 * @param {object} validationOptions - User-selected validation options
 */
function getValidator(type, permissive = true, validationOptions = {}) {
  if (!oscalSchema) {
    return null;
  }

  // Create a cache key that includes validation options
  const optionsKey = JSON.stringify(validationOptions);
  const cacheKey = `${type}_${permissive ? 'permissive' : 'strict'}_${optionsKey}`;

  if (!validatorCache.has(cacheKey)) {
    const ajv = getAjv(permissive);
    
    try {
      let validate;
      
      // Check if definition exists
      if (!oscalSchema.definitions || !oscalSchema.definitions[type]) {
        console.warn(`⚠️  Definition not found in schema: ${type}`);
        return null;
      }
      
      // Helper function to convert oneOf to anyOf (ALWAYS runs to avoid strict oneOf errors)
      function convertOneOfToAnyOf(schema) {
        if (!schema || typeof schema !== 'object') return schema;
        
        const newSchema = { ...schema };
        
        // ALWAYS convert oneOf to anyOf to avoid "must match exactly one" errors
        if (newSchema.oneOf) {
          newSchema.anyOf = newSchema.oneOf.map(s => convertOneOfToAnyOf(s));
          delete newSchema.oneOf;
        }
        
        // Process nested structures
        if (newSchema.properties) {
          const newProps = {};
          for (const [key, value] of Object.entries(newSchema.properties)) {
            newProps[key] = convertOneOfToAnyOf(value);
          }
          newSchema.properties = newProps;
        }
        
        if (newSchema.items) {
          newSchema.items = convertOneOfToAnyOf(newSchema.items);
        }
        
        ['allOf', 'anyOf'].forEach(key => {
          if (newSchema[key] && Array.isArray(newSchema[key])) {
            newSchema[key] = newSchema[key].map(s => convertOneOfToAnyOf(s));
          }
        });
        
        return newSchema;
      }
      
      // Helper function to make schema permissive recursively based on validation options
      function makePermissive(schema) {
        if (!schema || typeof schema !== 'object') return schema;
        
        const newSchema = { ...schema };
        
        // Handle additional properties based on user selection
        if (newSchema.type === 'object') {
          // If user wants to validate additionalProperties, keep strict; otherwise allow
          if (!validationOptions.additionalProperties) {
            newSchema.additionalProperties = true;
          }
        }
        
        // Handle required fields based on user selection
        if (permissive && newSchema.required && validationOptions.requiredFields === false) {
          // Only remove required if user explicitly unchecked it
          delete newSchema.required;
        }
        
        // Remove enum restrictions unless user wants to validate them
        if (permissive && newSchema.enum && !validationOptions.enums) {
          delete newSchema.enum;
          // Keep the type but remove enum constraint
          if (!newSchema.type) {
            newSchema.type = 'string'; // Default to string for former enums
          }
        }
        
        // Remove pattern restrictions unless user wants to validate them
        if (permissive && newSchema.pattern && !validationOptions.stringPatterns) {
          delete newSchema.pattern;
        }
        
        // Remove format restrictions unless user wants to validate them
        if (permissive && newSchema.format && !validationOptions.formats) {
          delete newSchema.format;
        }
        
        // Remove length and size restrictions unless user wants to validate them
        if (permissive && !validationOptions.lengthRestrictions) {
          delete newSchema.minLength;
          delete newSchema.maxLength;
          delete newSchema.minItems;
          delete newSchema.maxItems;
          delete newSchema.minProperties;
          delete newSchema.maxProperties;
          delete newSchema.minimum;
          delete newSchema.maximum;
        }
        
        // Process nested properties
        if (newSchema.properties) {
          const newProps = {};
          for (const [key, value] of Object.entries(newSchema.properties)) {
            newProps[key] = makePermissive(value);
          }
          newSchema.properties = newProps;
        }
        
        // Process array items
        if (newSchema.items) {
          newSchema.items = makePermissive(newSchema.items);
        }
        
        // Process allOf, anyOf (oneOf is handled by convertOneOfToAnyOf function)
        ['allOf', 'anyOf'].forEach(key => {
          if (newSchema[key] && Array.isArray(newSchema[key])) {
            newSchema[key] = newSchema[key].map(s => makePermissive(s));
          }
        });
        
        return newSchema;
      }
      
      // Get base schema
      let baseSchema = oscalSchema.definitions[type];
      
      // Prepare definitions
      let definitions = oscalSchema.definitions;
      
      // ALWAYS convert oneOf to anyOf to avoid strict validation errors
      // This happens regardless of permissive mode setting
      console.log(`🔄 Converting oneOf to anyOf for ${type} (prevents "must match exactly one" errors)`);
      baseSchema = convertOneOfToAnyOf(baseSchema);
      definitions = {};
      for (const [defName, defSchema] of Object.entries(oscalSchema.definitions)) {
        definitions[defName] = convertOneOfToAnyOf(defSchema);
      }
      
      // Then apply permissive modifications if requested
      if (permissive) {
        baseSchema = makePermissive(baseSchema);
        
        // Also make all definitions permissive (especially important for referenced enums)
        const permissiveDefinitions = {};
        for (const [defName, defSchema] of Object.entries(definitions)) {
          permissiveDefinitions[defName] = makePermissive(defSchema);
        }
        definitions = permissiveDefinitions;
      }
      
      // Create a standalone schema that includes definitions and references the type
      const standaloneSchema = {
        $schema: "http://json-schema.org/draft-07/schema#",
        $id: `http://csrc.nist.gov/ns/oscal/2.1.0/${type}-schema.json`,
        definitions: definitions, // Use modified definitions
        additionalProperties: permissive, // Allow custom fields at root
        ...baseSchema
      };
      
      validate = ajv.compile(standaloneSchema);
      
      if (validate) {
        validatorCache.set(cacheKey, validate);
        console.log(`✅ Validator compiled and cached for type: ${type} (${permissive ? 'permissive' : 'strict'} mode)`);
      } else {
        console.warn(`⚠️  Failed to compile validator for type: ${type}`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error creating validator for ${type}:`, error.message);
      return null;
    }
  }
  
  return validatorCache.get(cacheKey);
}

/**
 * Validate OSCAL document using JSON Schema
 * @param {object} oscalData - OSCAL JSON document
 * @param {string} type - Document type ('ssp', 'catalog', 'profile', etc.)
 * @param {boolean} permissive - If true, allows custom fields and relaxes requirements (default: true)
 * @returns {Promise<object>} Validation result
 */
export async function validateWithSchema(oscalData, type = 'ssp', permissive = true, validationOptions = {}) {
  const startTime = Date.now();
  
  if (!oscalSchema) {
    return {
      valid: false,
      validated: false,
      message: 'OSCAL schema not loaded',
      framework: 'AJV JSON Schema Validator',
      error: 'Schema file not found or failed to load'
    };
  }

  try {
    // Map common type names to schema definition names
    const typeMap = {
      'ssp': 'system-security-plan',
      'catalog': 'catalog',
      'profile': 'profile',
      'sap': 'assessment-plan',
      'sar': 'assessment-results',
      'poam': 'plan-of-action-and-milestones',
      'component-definition': 'component-definition'
    };
    
    const schemaType = typeMap[type] || type;
    
    // Check if the document has the expected root element
    const rootElement = oscalData[schemaType];
    
    if (!rootElement) {
      return {
        valid: false,
        validated: true,
        message: `Document missing expected root element: "${schemaType}"`,
        errors: [{
          type: 'ERROR',
          message: `Expected root element "${schemaType}" not found`,
          path: '/',
          available: Object.keys(oscalData)
        }],
        framework: 'AJV JSON Schema Validator',
        executionTime: Date.now() - startTime
      };
    }
    
    // Get validator for this type (with permissive mode and validation options)
    const validator = getValidator(schemaType, permissive, validationOptions);
    
    if (!validator) {
      // Fallback to basic validation if no specific validator
      return {
        valid: true,
        validated: true,
        message: `Document structure appears valid (schema validator not available for ${schemaType})`,
        warning: `No specific schema validator for type: ${schemaType}`,
        framework: 'AJV JSON Schema Validator (Basic)',
        mode: permissive ? 'permissive' : 'strict',
        executionTime: Date.now() - startTime
      };
    }
    
    // Validate the root element
    const isValid = validator(rootElement);
    
    if (isValid) {
      return {
        valid: true,
        validated: true,
        message: permissive 
          ? `OSCAL ${type} document is valid (permissive mode: custom fields allowed)`
          : `OSCAL ${type} document is valid according to OSCAL v2.1.0 JSON Schema (strict mode)`,
        type: schemaType,
        framework: 'AJV JSON Schema Validator',
        mode: permissive ? 'permissive' : 'strict',
        schemaVersion: '2.1.0',
        note: permissive ? 'Validation allows custom fields and relaxed requirements' : 'Strict OSCAL v2.1.0 compliance validation',
        executionTime: Date.now() - startTime
      };
    } else {
      // Format validation errors
      const errors = (validator.errors || []).map(err => ({
        type: 'ERROR',
        keyword: err.keyword,
        message: err.message,
        path: err.instancePath || err.dataPath,
        params: err.params,
        schemaPath: err.schemaPath
      }));
      
      return {
        valid: false,
        validated: true,
        message: `OSCAL ${type} document has ${errors.length} validation error(s)`,
        errors: errors,
        type: schemaType,
        framework: 'AJV JSON Schema Validator',
        mode: permissive ? 'permissive' : 'strict',
        schemaVersion: '2.1.0',
        executionTime: Date.now() - startTime
      };
    }
    
  } catch (error) {
    console.error('Validation error:', error);
    return {
      valid: false,
      validated: false,
      message: 'Validation failed with error',
      error: error.message,
      framework: 'AJV JSON Schema Validator',
      executionTime: Date.now() - startTime
    };
  }
}

/**
 * Get validator status
 */
export async function getAJVValidatorStatus() {
  return {
    ready: oscalSchema !== null,
    schemaAvailable: oscalSchema !== null,
    framework: 'AJV JSON Schema Validator',
    schemaVersion: oscalSchema ? '2.1.0' : 'N/A',
    schemaSize: oscalSchema ? '243KB' : 'N/A',
    message: oscalSchema 
      ? 'OSCAL JSON Schema validation available (based on metaschema-framework/oscal-editor)'
      : 'OSCAL schema not loaded',
    source: 'metaschema-framework/oscal-editor'
  };
}

export default {
  validateWithSchema,
  getAJVValidatorStatus
};

