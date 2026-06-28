/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { generateImplementationWithMistral, checkMistralAvailability, loadMistralConfig } from './mistralService.js';
import { generateImplementationWithGemma, checkGemmaAvailability, loadGemmaConfig } from './gemmaService.js';
import { generateImplementationWithBedrockGemma, checkBedrockGemmaAvailability, loadBedrockGemmaConfig } from './bedrockGemmaService.js';
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
    
    const provider = (config.aiConfig.provider || 'aws-bedrock').toLowerCase();
    const model = (config.aiConfig.model || '').toLowerCase();
    const bedrockModelId = (config.aiConfig.bedrockModelId || '').toLowerCase();
    
    // When using AWS Bedrock, the selected model is in bedrockModelId (dropdown), not in model.
    // Prefer bedrockModelId so selecting "Gemma 3 12B" routes to Gemma service, not Mistral.
    if (provider === 'aws-bedrock' && bedrockModelId) {
      if (bedrockModelId.includes('gemma')) return 'gemma';
      if (bedrockModelId.includes('mistral') || bedrockModelId.includes('mixtral')) return 'mistral';
    }
    
    // Google AI / local: use model field
    if (model.includes('gemma')) return 'gemma';
    if (model.includes('mistral') || model.includes('mixtral')) return 'mistral';
    
    // Fallback: bedrockModelId (e.g. saved but provider changed)
    if (bedrockModelId.includes('gemma')) return 'gemma';
    if (bedrockModelId.includes('mistral') || bedrockModelId.includes('mixtral')) return 'mistral';
    
    console.log(`⚠️ Could not detect model family (provider: ${provider}, model: ${model}, bedrockModelId: ${bedrockModelId}). Defaulting to mistral.`);
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
 * @param {{ extended?: boolean }} [options] - When extended, request implementation + testingObjective + testingProcedure + remarks
 * @returns {Promise<Object|string|null>} - Generated implementation (format depends on service)
 */
export async function generateImplementationWithAI(control, fallbackGenerator, existingControls = [], options = {}) {
  const modelFamily = await detectModelFamily();
  const config = getResolvedConfig();
  const provider = config.aiConfig?.provider || 'aws-bedrock';
  const bedrockModelId = config.aiConfig?.bedrockModelId || '';
  const model = config.aiConfig?.model || '';
  console.log(`🎯 Model family detected: ${modelFamily} (provider: ${provider}, model: ${model}, bedrockModelId: ${bedrockModelId})`);
  
  switch (modelFamily) {
    case 'gemma':
      if (provider === 'aws-bedrock') {
        console.log(`📍 Routing to Bedrock Gemma service for control: ${control.id}`);
        return await generateImplementationWithBedrockGemma(control, fallbackGenerator, existingControls, options);
      }
      console.log(`📍 Routing to Gemma service (Google AI) for control: ${control.id}`);
      return await generateImplementationWithGemma(control, fallbackGenerator, existingControls, options);
    
    case 'mistral':
      console.log(`📍 Routing to Mistral service for control: ${control.id}`);
      return await generateImplementationWithMistral(control, fallbackGenerator, existingControls, options);
    
    default:
      console.log(`📍 Using default Mistral service for control: ${control.id}`);
      return await generateImplementationWithMistral(control, fallbackGenerator, existingControls, options);
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
  
  const config = getResolvedConfig();
  const provider = config.aiConfig?.provider || 'aws-bedrock';
  switch (modelFamily) {
    case 'gemma':
      if (provider === 'aws-bedrock') return await checkBedrockGemmaAvailability();
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
  const config = getResolvedConfig();
  const provider = config.aiConfig?.provider || 'aws-bedrock';
  switch (modelFamily) {
    case 'gemma':
      if (provider === 'aws-bedrock') return await loadBedrockGemmaConfig();
      return await loadGemmaConfig();
    
    case 'mistral':
      return await loadMistralConfig();
    
    default:
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
