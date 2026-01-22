/**
 * Configuration Manager - Server-side settings persistence
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { atomicWriteJSON } from './utils/atomicWrite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config file path: prioritize config/app/config.json, fallback to backend/config.json for compatibility
const CONFIG_DIR = path.join(__dirname, '..', 'config', 'app');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const LEGACY_CONFIG_FILE = path.join(__dirname, 'config.json');

// Default configuration
const DEFAULT_CONFIG = {
  apiGateways: {
    aws: {
      enabled: false,
      url: '',
      region: 'ap-southeast-2'
    },
    azure: {
      enabled: false,
      url: ''
    }
  },
  publishedSoaUrl: '',
  messagingConfig: {
    enabled: false,
    channel: 'email', // 'email' or 'slack'
    email: {
      enabled: false,
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false, // true for 465, false for other ports
      smtpUser: '',
      smtpPassword: '',
      fromEmail: '',
      fromName: 'OSCAL Report Generator',
      loginUrl: ''
    },
    slack: {
      enabled: false,
      webhookUrl: '',
      channel: '#general'
    }
  },
  aiConfig: {
    enabled: false,
    url: '',
    apiToken: '',
    model: 'mistral:7b',
    timeout: 180000, // 180 seconds (3 minutes) to allow for model loading and processing
    organizationName: 'Adobe' // Default organization name
  },
  lastModified: new Date().toISOString(),
  version: '1.0.0'
};

/**
 * Load configuration from file
 * Creates default config if file doesn't exist
 */
function loadConfig() {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    // Try primary location first (config/app/config.json)
    let configPath = CONFIG_FILE;
    if (!fs.existsSync(CONFIG_FILE)) {
      // Fallback to legacy location (backend/config.json)
      if (fs.existsSync(LEGACY_CONFIG_FILE)) {
        console.log('📝 Found legacy config file, migrating to config/app/config.json...');
        configPath = LEGACY_CONFIG_FILE;
        // Will migrate after reading
      } else {
        console.log('📝 Config file not found, creating default configuration...');
        saveConfig(DEFAULT_CONFIG);
        return DEFAULT_CONFIG;
      }
    }

    const data = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(data);
    
    // Migrate legacy config to new location
    if (configPath === LEGACY_CONFIG_FILE) {
      console.log('📦 Migrating config to config/app/config.json...');
      saveConfig(config);
      // Optionally remove legacy file after successful migration
      try {
        fs.unlinkSync(LEGACY_CONFIG_FILE);
        console.log('✅ Legacy config file removed');
      } catch (err) {
        console.warn('⚠️ Could not remove legacy config file:', err.message);
      }
    }
    
    console.log('✅ Configuration loaded successfully');
    return config;
  } catch (error) {
    console.error('❌ Error loading configuration:', error.message);
    console.log('🔄 Returning default configuration');
    return DEFAULT_CONFIG;
  }
}

/**
 * Save configuration to file
 * 
 * Uses atomic write operations to prevent config corruption on crashes.
 * Returns verification object with save status and disk verification.
 */
async function saveConfig(config) {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    // Ensure all required fields are present (merge with defaults)
    const configToSave = {
      ...DEFAULT_CONFIG,
      ...config,
      // Ensure apiGateways structure is complete
      apiGateways: {
        ...DEFAULT_CONFIG.apiGateways,
        ...config.apiGateways,
        aws: {
          ...DEFAULT_CONFIG.apiGateways.aws,
          ...config.apiGateways?.aws
        },
        azure: {
          ...DEFAULT_CONFIG.apiGateways.azure,
          ...config.apiGateways?.azure
        }
      },
      // Ensure messagingConfig structure is complete
      messagingConfig: {
        ...DEFAULT_CONFIG.messagingConfig,
        ...config.messagingConfig,
        email: {
          ...DEFAULT_CONFIG.messagingConfig.email,
          ...config.messagingConfig?.email
        },
        slack: {
          ...DEFAULT_CONFIG.messagingConfig.slack,
          ...config.messagingConfig?.slack
        }
      },
      // Ensure aiConfig structure is complete
      aiConfig: {
        ...DEFAULT_CONFIG.aiConfig,
        ...config.aiConfig
      },
      // Explicitly preserve publishedSoaUrl (even if empty string)
      publishedSoaUrl: config.publishedSoaUrl !== undefined 
        ? config.publishedSoaUrl 
        : DEFAULT_CONFIG.publishedSoaUrl
    };
    
    // Add metadata
    const saveTimestamp = new Date().toISOString();
    configToSave.lastModified = saveTimestamp;
    
    // Preserve version if it exists
    if (config.version) {
      configToSave.version = config.version;
    }
    
    console.log('💾 Saving config - publishedSoaUrl:', configToSave.publishedSoaUrl);
    
    // Write to file with atomic operations (crash-resistant)
    // Creates backup automatically and uses temp file + rename pattern
    await atomicWriteJSON(CONFIG_FILE, configToSave, { backup: true });
    
    console.log('✅ Configuration saved successfully (atomic write)');
    
    // DISK VERIFICATION: Read back from disk to ensure save was successful
    console.log('🔍 Verifying config was written to disk...');
    const verifiedConfig = verifyConfigOnDisk(configToSave);
    
    if (verifiedConfig.success) {
      console.log('✅ Disk verification successful - config matches what was saved');
      return {
        success: true,
        verified: true,
        timestamp: saveTimestamp,
        configPath: CONFIG_FILE,
        message: 'Configuration saved and verified on disk'
      };
    } else {
      console.warn('⚠️ Disk verification found discrepancies:', verifiedConfig.discrepancies);
      return {
        success: true,
        verified: false,
        timestamp: saveTimestamp,
        configPath: CONFIG_FILE,
        discrepancies: verifiedConfig.discrepancies,
        message: 'Configuration saved but verification found discrepancies'
      };
    }
  } catch (error) {
    console.error('❌ Error saving configuration:', error.message);
    return {
      success: false,
      verified: false,
      error: error.message,
      message: 'Failed to save configuration'
    };
  }
}

/**
 * Verify that config on disk matches what was intended to be saved
 * Reads back from disk and compares critical fields
 */
function verifyConfigOnDisk(expectedConfig) {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return {
        success: false,
        discrepancies: ['Config file does not exist on disk']
      };
    }
    
    const diskData = fs.readFileSync(CONFIG_FILE, 'utf8');
    const diskConfig = JSON.parse(diskData);
    const discrepancies = [];
    
    // Verify critical email settings
    if (expectedConfig.messagingConfig?.email) {
      const expected = expectedConfig.messagingConfig.email;
      const actual = diskConfig.messagingConfig?.email || {};
      
      if (expected.enabled !== actual.enabled) {
        discrepancies.push('email.enabled mismatch');
      }
      if (expected.smtpHost !== actual.smtpHost) {
        discrepancies.push('email.smtpHost mismatch');
      }
      if (expected.smtpPort !== actual.smtpPort) {
        discrepancies.push('email.smtpPort mismatch');
      }
      if (expected.smtpUser !== actual.smtpUser) {
        discrepancies.push('email.smtpUser mismatch');
      }
    }
    
    // Verify critical AI settings
    if (expectedConfig.aiConfig) {
      const expected = expectedConfig.aiConfig;
      const actual = diskConfig.aiConfig || {};
      
      if (expected.enabled !== actual.enabled) {
        discrepancies.push('aiConfig.enabled mismatch');
      }
      if (expected.url !== actual.url) {
        discrepancies.push('aiConfig.url mismatch');
      }
    }
    
    // Verify publishedSoaUrl
    if (expectedConfig.publishedSoaUrl !== diskConfig.publishedSoaUrl) {
      discrepancies.push('publishedSoaUrl mismatch');
    }
    
    return {
      success: discrepancies.length === 0,
      discrepancies: discrepancies.length > 0 ? discrepancies : undefined
    };
  } catch (error) {
    return {
      success: false,
      discrepancies: [`Verification error: ${error.message}`]
    };
  }
}

/**
 * Update specific configuration section
 */
async function updateConfig(updates) {
  try {
    const currentConfig = loadConfig();
    const newConfig = {
      ...currentConfig,
      ...updates
    };
    
    return await saveConfig(newConfig);
  } catch (error) {
    console.error('❌ Error updating configuration:', error.message);
    return false;
  }
}

/**
 * Get specific configuration value
 */
function getConfigValue(key) {
  const config = loadConfig();
  return config[key];
}

/**
 * Reset configuration to defaults
 */
async function resetConfig() {
  console.log('🔄 Resetting configuration to defaults...');
  return await saveConfig(DEFAULT_CONFIG);
}

/**
 * Validate configuration structure
 */
function validateConfig(config) {
  const errors = [];
  
  // Validate AWS gateway URL if enabled
  if (config.apiGateways?.aws?.enabled && config.apiGateways.aws.url) {
    try {
      new URL(config.apiGateways.aws.url);
    } catch (e) {
      errors.push('Invalid AWS API Gateway URL');
    }
  }
  
  // Validate Azure gateway URL if enabled
  if (config.apiGateways?.azure?.enabled && config.apiGateways.azure.url) {
    try {
      new URL(config.apiGateways.azure.url);
    } catch (e) {
      errors.push('Invalid Azure API Gateway URL');
    }
  }
  
  // Validate Published SOA URL if provided
  if (config.publishedSoaUrl && config.publishedSoaUrl.trim() !== '') {
    try {
      new URL(config.publishedSoaUrl);
    } catch (e) {
      errors.push('Invalid Published SOA/CCM URL');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get configuration file path (for backup/restore)
 */
function getConfigFilePath() {
  return CONFIG_FILE;
}

/**
 * Check if config file exists
 */
function configExists() {
  return fs.existsSync(CONFIG_FILE);
}

export {
  loadConfig,
  saveConfig,
  updateConfig,
  getConfigValue,
  resetConfig,
  validateConfig,
  getConfigFilePath,
  configExists,
  DEFAULT_CONFIG
};

