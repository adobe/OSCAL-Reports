/**
 * AI Model Router
 * Routes AI generation requests to the appropriate service based on model type
 * Supports Mistral, Gemma, and future model families
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import { generateImplementationWithMistral, checkMistralAvailability, loadMistralConfig } from './mistralService.js';
import { generateImplementationWithGemma, checkGemmaAvailability, loadGemmaConfig } from './gemmaService.js';
import { getResolvedConfig } from './configManager.js';

/**
 * Detect which model family is being used based on configuration
 * @returns {Promise<string>} Model family: 'mistral', 'gemma', or 'unknown'
 */
export async function detectModelFamily() {
  try {
    const config = getResolvedConfig();
    
    if (!config.aiConfig || !config.aiConfig.enabled) {
      return 'unknown';
    }
    
    const model = (config.aiConfig.model || '').toLowerCase();
    
    // Detect Gemma models (gemma, gemma2, gemma3, gemma-2-9b-it, etc.)
    if (model.includes('gemma')) {
      return 'gemma';
    }
    
    // Detect Mistral models (mistral, mistral:7b, mistral-7b-instruct, mixtral, etc.)
    if (model.includes('mistral') || model.includes('mixtral')) {
      return 'mistral';
    }
    
    // Check AWS Bedrock models
    const bedrockModelId = (config.aiConfig.bedrockModelId || '').toLowerCase();
    if (bedrockModelId.includes('gemma')) {
      return 'gemma';
    }
    if (bedrockModelId.includes('mistral') || bedrockModelId.includes('mixtral')) {
      return 'mistral';
    }
    
    // Default to mistral for backward compatibility
    console.log(`⚠️ Could not detect model family from model name: ${model}. Defaulting to mistral.`);
    return 'mistral';
  } catch (error) {
    console.error('❌ Error detecting model family:', error.message);
    return 'mistral'; // Default to mistral for backward compatibility
  }
}

/**
 * Generate implementation text using the appropriate AI service based on model
 * Automatically routes to mistralService or gemmaService based on configured model
 * 
 * @param {Object} control - Control object with id, title, description, parts
 * @param {Function} fallbackGenerator - Function to generate fallback implementation
 * @param {Array} existingControls - Array of existing controls to learn writing style from
 * @returns {Promise<Object|string|null>} - Generated implementation (format depends on service)
 */
export async function generateImplementationWithAI(control, fallbackGenerator, existingControls = []) {
  const modelFamily = await detectModelFamily();
  
  console.log(`🎯 Model family detected: ${modelFamily}`);
  
  switch (modelFamily) {
    case 'gemma':
      console.log(`📍 Routing to Gemma service for control: ${control.id}`);
      return await generateImplementationWithGemma(control, fallbackGenerator, existingControls);
    
    case 'mistral':
      console.log(`📍 Routing to Mistral service for control: ${control.id}`);
      return await generateImplementationWithMistral(control, fallbackGenerator, existingControls);
    
    default:
      // Default to Mistral for backward compatibility
      console.log(`📍 Using default Mistral service for control: ${control.id}`);
      return await generateImplementationWithMistral(control, fallbackGenerator, existingControls);
  }
}

/**
 * Check AI service availability based on configured model
 * Routes to the appropriate availability check function
 * 
 * @returns {Promise<Object>} Availability status object
 */
export async function checkAIAvailability() {
  const modelFamily = await detectModelFamily();
  
  console.log(`🎯 Checking availability for model family: ${modelFamily}`);
  
  switch (modelFamily) {
    case 'gemma':
      return await checkGemmaAvailability();
    
    case 'mistral':
      return await checkMistralAvailability();
    
    default:
      // Default to Mistral for backward compatibility
      return await checkMistralAvailability();
  }
}

/**
 * Load AI configuration based on detected model family
 * @returns {Promise<Object>} AI configuration object
 */
export async function loadAIConfig() {
  const modelFamily = await detectModelFamily();
  
  switch (modelFamily) {
    case 'gemma':
      return await loadGemmaConfig();
    
    case 'mistral':
      return await loadMistralConfig();
    
    default:
      // Default to Mistral for backward compatibility
      return await loadMistralConfig();
  }
}

/**
 * Get model family display name for UI
 * @param {string} modelFamily - Model family identifier
 * @returns {string} Display name
 */
export function getModelFamilyDisplayName(modelFamily) {
  const displayNames = {
    'mistral': 'Mistral AI',
    'gemma': 'Google Gemma',
    'unknown': 'Unknown Model'
  };
  
  return displayNames[modelFamily] || displayNames['unknown'];
}

export default {
  detectModelFamily,
  generateImplementationWithAI,
  checkAIAvailability,
  loadAIConfig,
  getModelFamilyDisplayName
};
