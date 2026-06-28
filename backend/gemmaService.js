/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import axios from './utils/safeAxios.js';
import http from 'http';
import https from 'https';
import { getResolvedConfig } from './configManager.js';
import { logAIInteraction, logAIError, buildLogContext } from './aiLogger.js';
import {
  extractControlTitleForPrompt,
  extractControlDescriptionText,
  pickDiverseImplementationExamples,
  controlFamilyFromId,
} from './utils/controlPromptContext.js';

let gemmaConfig = null;

/**
 * Load Gemma configuration from config file
 * Priority: Settings AI Config > Environment Variable > Config File > Defaults
 * @returns {Promise<Object>} Gemma configuration object
 */
export async function loadGemmaConfig() {
  // Always reload config to pick up changes from Settings UI
  // Don't cache gemmaConfig since it can change via Settings
  gemmaConfig = null;
  
  try {
    const config = getResolvedConfig();
    
    // Priority 1: Check Settings AI Config (highest priority - user configured)
    let aiUrl = null;
    let aiEnabled = false;
    let aiModel = 'gemma2';
    let aiTimeout = 30000;
    let aiApiToken = '';
    let aiProvider = 'aws-bedrock';
    
    if (config.aiConfig && config.aiConfig.enabled) {
      aiEnabled = true;
      aiProvider = config.aiConfig.provider || 'aws-bedrock';
      aiTimeout = config.aiConfig.timeout || 180000;

      if (config.aiConfig.url) {
        // Ollama or Google AI API - requires URL
        let baseUrl = config.aiConfig.url.trim();
        
        // Handle migration from old format (url + port) to new format (full URL)
        if (config.aiConfig.port && !baseUrl.includes('://')) {
          // Old format: separate url and port
          const hostname = baseUrl || 'localhost';
          const port = config.aiConfig.port || 11434;
          baseUrl = `http://${hostname}:${port}`;
        }
        
        // Add protocol if missing (default to http for ollama, https for google-ai)
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
          baseUrl = aiProvider === 'google-ai' ? `https://${baseUrl}` : `http://${baseUrl}`;
        }
        
        // Parse and normalize URL
        try {
          const urlObj = new URL(baseUrl);
          aiUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ''}${urlObj.pathname}`;
          aiModel = config.aiConfig.model || 'gemma2';
          aiApiToken = config.aiConfig.apiToken || '';
          console.log(`🔧 Using AI Engine URL from Settings: ${aiUrl}`);
          console.log(`   Provider: ${aiProvider}`);
          console.log(`   Timeout: ${aiTimeout}ms (${aiTimeout/1000}s)`);
          if (aiApiToken) {
            console.log(`   Using API token for authentication`);
          }
        } catch (e) {
          console.warn(`⚠️ Invalid AI Engine URL format: ${baseUrl}, error: ${e.message}`);
        }
      }
    }
    
    // Priority 2: Environment variable (for Docker deployments)
    const dockerOllamaUrl = process.env.OLLAMA_URL || process.env.OLLAMA_HOST || null;
    
    // Priority 3: Config file defaults
    const defaultOllamaUrl = aiUrl || dockerOllamaUrl || config.gemmaConfig?.ollamaUrl || 'http://localhost:11434';
    
    gemmaConfig = {
      enabled: aiEnabled || config.gemmaConfig?.enabled || false,
      provider: aiProvider || 'ollama', // 'ollama' or 'google-ai' (Bedrock Gemma is in bedrockGemmaService)
      ollamaUrl: defaultOllamaUrl,
      model: aiModel || config.gemmaConfig?.model || 'gemma2',
      apiToken: aiApiToken || config.gemmaConfig?.apiToken || '',
      googleApiKey: config.gemmaConfig?.googleApiKey || '',
      googleApiUrl: config.gemmaConfig?.googleApiUrl || 'https://generativelanguage.googleapis.com/v1/models',
      timeout: aiTimeout || config.gemmaConfig?.timeout || 180000, // 180 seconds default for model loading and processing
      maxRetries: config.gemmaConfig?.maxRetries || 2,
      fallbackToPatternMatching: config.gemmaConfig?.fallbackToPatternMatching !== false,
      // Max tokens configuration
      maxTokens: {
        connectionTest: config.aiConfig?.maxTokens?.connectionTest || 10,
        controlGeneration: config.aiConfig?.maxTokens?.controlGeneration || 150,
        general: config.aiConfig?.maxTokens?.general || 512
      }
    };
    
    // Log which source was used
    if (aiUrl) {
      console.log(`✅ Using AI Engine from Settings configuration: ${aiUrl}`);
    } else if (dockerOllamaUrl) {
      console.log(`🔧 Using OLLAMA_URL from environment: ${dockerOllamaUrl}`);
    } else if (config.gemmaConfig?.ollamaUrl) {
      console.log(`📝 Using Ollama URL from config file: ${gemmaConfig.ollamaUrl}`);
    } else {
      console.log(`⚠️  Using default Ollama URL: ${gemmaConfig.ollamaUrl}`);
      console.log(`   Configure AI Engine in Settings → AI Integration for production use`);
    }
    
    return gemmaConfig;
  } catch (error) {
    console.warn('⚠️ Could not load Gemma config, using defaults:', error.message);
    gemmaConfig = {
      enabled: false,
      provider: 'ollama',
      ollamaUrl: 'http://localhost:11434',
      model: 'gemma2',
      timeout: 180000, // Match the generate endpoint timeout
      maxRetries: 2,
      fallbackToPatternMatching: true
    };
    return gemmaConfig;
  }
}

/**
 * Generate implementation text using Ollama (local Gemma)
 */
async function generateWithOllama(control, config, existingControls = [], promptOverride = null, logContext = {}) {
  const prompt = promptOverride || buildPrompt(control, existingControls);
  const startTime = Date.now();
  
  console.log(`🔗 Attempting to connect to Ollama at: ${config.ollamaUrl}`);
  console.log(`   Model: ${config.model || 'gemma2'}`);
  const actualTimeout = config.timeout || 180000;
  console.log(`   Timeout: ${actualTimeout}ms (${actualTimeout/1000}s)`);
  console.log(`   Config enabled: ${config.enabled}`);
  
  // Prepare headers with API token if provided
  const headers = {
    'Content-Type': 'application/json'
  };
  if (config.apiToken && config.apiToken.trim()) {
    headers['Authorization'] = `Bearer ${config.apiToken.trim()}`;
  }
  
  // Handle URLs that may or may not end with /
  const generateUrl = config.ollamaUrl.endsWith('/') 
    ? `${config.ollamaUrl}api/generate` 
    : `${config.ollamaUrl}/api/generate`;

  const isOllamaUnreachable = (err) =>
    err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND' ||
    err?.code === 'ETIMEDOUT' || err?.code === 'ECONNABORTED' || err?.message?.includes('timeout');

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await axios.post(
      generateUrl,
      {
        model: config.model || 'gemma2',
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: config.maxTokens?.controlGeneration || 150 // Configurable max tokens for control generation
        }
      },
      {
        timeout: config.timeout || 180000, // 180 seconds to allow for model loading and processing
        headers: headers,
        // Use HTTP agent with keepAlive to maintain connection
        // Increase socket timeout to match request timeout
        httpAgent: config.ollamaUrl.startsWith('http://') ? new http.Agent({ 
          keepAlive: true,
          keepAliveMsecs: 30000, // Keep connection alive for 30 seconds
          timeout: (config.timeout || 180000) + 10000, // Socket timeout slightly longer than request timeout
          socketKeepAlive: true,
          socketKeepAliveInitialDelay: 10000
        }) : undefined,
        // For Docker networking, don't reject unauthorized certs
        httpsAgent: config.ollamaUrl.startsWith('https') ? new https.Agent({ 
          rejectUnauthorized: false,
          keepAlive: true,
          keepAliveMsecs: 30000, // Keep connection alive for 30 seconds
          timeout: (config.timeout || 180000) + 10000, // Socket timeout slightly longer than request timeout
          socketKeepAlive: true,
          socketKeepAliveInitialDelay: 10000
        }) : undefined,
        // Don't automatically follow redirects (can cause connection issues)
        maxRedirects: 0
      }
    );

    if (response.data && response.data.response) {
      const latency = Date.now() - startTime;
      const cleanedResponse = cleanResponse(response.data.response);
      
      // Log successful AI interaction (OTel GenAI Semantic Conventions)
      logAIInteraction({
        provider: 'ollama',
        model: config.model || 'gemma2',
        operation: 'generate',
        prompt: prompt,
        response: cleanedResponse,
        metadata: {
          controlId: control.id,
          controlTitle: control.title,
          controlFamily: control.id?.split('-')[0] || 'unknown',
          temperature: 0.7,
          topP: 0.9,
          maxTokens: config.maxTokens?.controlGeneration || 150
        },
        tokenUsage: {
          inputTokens: Math.ceil(prompt.length / 4), // Approximate
          outputTokens: Math.ceil(cleanedResponse.length / 4), // Approximate
          totalTokens: Math.ceil((prompt.length + cleanedResponse.length) / 4)
        },
        latency: latency,
        status: 'success',
        context: logContext
      });
      
      console.log(`✅ Successfully received response from Ollama (${response.data.response.length} chars)`);
      return cleanedResponse;
    }

    console.warn(`⚠️ Invalid response format from Ollama:`, response.data);
    throw new Error('Invalid response format from Ollama');
    } catch (error) {
      lastError = error;
      const unreachable = attempt === 0 && isOllamaUnreachable(error);
      if (unreachable) {
        break;
      }
    }
  }

  const error = lastError;
  const latency = Date.now() - startTime;
  logAIError({
    provider: 'ollama',
    model: config.model || 'gemma2',
    operation: 'generate',
    prompt: prompt,
    error: error,
    metadata: {
      controlId: control.id,
      controlTitle: control.title,
      controlFamily: control.id?.split('-')[0] || 'unknown',
      errorCode: error?.code,
      latency: latency
    },
    context: logContext
  });

  if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
    const errorMsg = `Ollama service not reachable at ${config.ollamaUrl}. ` +
      `Error: ${error.code}. ` +
      `Please ensure: ` +
      `1. Ollama container is running (docker ps | grep ollama), ` +
      `2. Containers are on the same Docker network, ` +
      `3. OLLAMA_URL environment variable is set correctly (current: ${config.ollamaUrl}). ` +
      `On EC2: set OLLAMA_WAKE_LAMBDA to the Terraform lambda_ollama_controller_name so the first request can wake the instance.`;
    console.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }
  if (error?.code === 'ETIMEDOUT' || error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
    const errorMsg = `Ollama request timed out after ${config.timeout || 180000}ms. ` +
      `The service may be overloaded or the model may not be loaded.`;
    console.warn(`⚠️ ${errorMsg}`);
    throw new Error(errorMsg);
  }
  if (error?.response) {
    const errorMsg = `Ollama returned error ${error.response.status}: ${error.response.statusText}. ` +
      `Response: ${JSON.stringify(error.response.data)}`;
    console.error(`❌ ${errorMsg}`);
    throw new Error(errorMsg);
  }
  console.error(`❌ Unexpected error connecting to Ollama:`, error?.message);
  console.error(`   Code: ${error?.code}`);
  throw error;
}

/**
 * Generate implementation text using Google AI API (cloud)
 */
async function generateWithGoogleAI(control, config, existingControls = [], promptOverride = null, logContext = {}) {
  if (!config.googleApiKey) {
    throw new Error('Google AI API key not configured');
  }

  const prompt = promptOverride || buildPrompt(control, existingControls);
  const startTime = Date.now();
  
  try {
    // Use Gemini API format (Gemma models on Google AI)
    const modelName = config.model || 'gemma-2-9b-it';
    const apiUrl = `${config.googleApiUrl || 'https://generativelanguage.googleapis.com/v1/models'}/${modelName}:generateContent?key=${config.googleApiKey}`;
    
    const response = await axios.post(
      apiUrl,
      {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: config.maxTokens?.controlGeneration || 150,
          topP: 0.9
        }
      },
      {
        timeout: config.timeout || 180000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.candidates && response.data.candidates[0]) {
      const latency = Date.now() - startTime;
      const responseText = response.data.candidates[0].content.parts[0].text;
      const cleanedResponse = cleanResponse(responseText);
      
      // Log successful AI interaction (OTel GenAI Semantic Conventions)
      logAIInteraction({
        provider: 'google-ai',
        model: modelName,
        operation: 'generateContent',
        prompt: prompt,
        response: cleanedResponse,
        metadata: {
          controlId: control.id,
          controlTitle: control.title,
          controlFamily: control.id?.split('-')[0] || 'unknown',
          temperature: 0.7,
          topP: 0.9,
          maxTokens: config.maxTokens?.controlGeneration || 150
        },
        tokenUsage: {
          inputTokens: response.data.usageMetadata?.promptTokenCount || Math.ceil(prompt.length / 4),
          outputTokens: response.data.usageMetadata?.candidatesTokenCount || Math.ceil(cleanedResponse.length / 4),
          totalTokens: response.data.usageMetadata?.totalTokenCount || Math.ceil((prompt.length + cleanedResponse.length) / 4)
        },
        latency: latency,
        status: 'success',
        context: logContext
      });
      
      return cleanedResponse;
    }
    
    throw new Error('Invalid response format from Google AI API');
  } catch (error) {
    const latency = Date.now() - startTime;
    
    // Log AI error (OTel GenAI Semantic Conventions)
    logAIError({
      provider: 'google-ai',
      model: config.model || 'gemma-2-9b-it',
      operation: 'generateContent',
      prompt: prompt,
      error: error,
      metadata: {
        controlId: control.id,
        controlTitle: control.title,
        controlFamily: control.id?.split('-')[0] || 'unknown',
        errorCode: error.response?.status,
        latency: latency
      },
      context: logContext
    });
    
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error('Invalid Google AI API key');
    }
    throw error;
  }
}

/**
 * Analyze existing controls to extract writing style patterns
 */
function analyzeWritingStyle(existingControls) {
  if (!existingControls || existingControls.length === 0) {
    return null;
  }
  
  const implementations = pickDiverseImplementationExamples(existingControls);

  if (implementations.length === 0) {
    return null;
  }
  
  // Analyze common patterns
  const styleNotes = [];
  
  // Check sentence structure
  const avgLength = implementations.reduce((sum, impl) => sum + impl.length, 0) / implementations.length;
  if (avgLength < 200) {
    styleNotes.push('concise sentences');
  }
  
  // Check for common phrases/patterns
  const commonPhrases = [];
  implementations.forEach(impl => {
    // Extract key phrases (first part of sentences)
    const sentences = impl.split(/[.!?]+/).filter(s => s.trim().length > 0);
    sentences.forEach(sentence => {
      const firstPart = sentence.trim().split(/\s+/).slice(0, 5).join(' ');
      if (firstPart.length > 10) {
        commonPhrases.push(firstPart);
      }
    });
  });
  
  return {
    examples: implementations,
    avgLength: Math.round(avgLength),
    commonPhrases: commonPhrases.slice(0, 3)
  };
}

/**
 * Extract non-empty Additional Notes / Consumer Guidance (remarks) from existing controls
 * so the AI can match style and suggest similar wording when relevant.
 */
function getRemarksExamples(existingControls) {
  if (!existingControls || existingControls.length === 0) return [];
  return existingControls
    .map(c => (c.remarks != null ? String(c.remarks).trim() : ''))
    .filter(r => r.length > 10)
    .slice(0, 15);
}

/**
 * Build prompt for Gemma based on control information
 */
function buildPrompt(control, existingControls = []) {
  const controlId = control.id || 'Unknown';
  const controlTitle = extractControlTitleForPrompt(control);
  const controlDescription = extractControlDescriptionText(control);
  const controlFamily = controlFamilyFromId(controlId);
  const groupTitle = (control.groupTitle || '').trim();

  const styleAnalysis = analyzeWritingStyle(existingControls);

  let styleGuidance = '';
  if (styleAnalysis && styleAnalysis.examples.length > 0) {
    styleGuidance = `

STYLE GUIDANCE - Match TONE and SENTENCE STRUCTURE only (not implementation content):
${styleAnalysis.examples.map((ex, idx) => {
      const preview = ex.length > 180 ? `${ex.substring(0, 180)}...` : ex;
      return `${idx + 1}. "${preview}"`;
    }).join('\n')}

IMPORTANT: Use the examples only for writing style. Your implementation MUST address the unique requirements of ${controlId} (${controlTitle}). Do NOT reuse boilerplate phrases from the examples unless they directly apply to this control.`;
  }

  const groupContext = groupTitle ? `\nControl Group: ${groupTitle}` : '';
  const descriptionBlock = controlDescription
    || `No detailed catalog statement was provided. Infer specifics from the control ID and title (${controlId}: ${controlTitle}) rather than generic security language.`;

  return `Generate a professional implementation description for the following security control:

Control ID: ${controlId}
Control Title: ${controlTitle}
Control Family: ${controlFamily}${groupContext}

Control Requirements (catalog statement):
${descriptionBlock}${styleGuidance}

UNIQUENESS: The implementation must be specific to ${controlId} — "${controlTitle}". Do NOT produce text that could apply equally to unrelated controls.

Requirements:
1. Write 2-3 concise sentences describing what HAS BEEN implemented (past/present perfect tense)
2. Use descriptive language: "X is implemented by...", "We have implemented...", "The system uses...", "X are configured to..."
3. Focus on practical, technical implementation details that exist for THIS control
4. Use professional cybersecurity terminology
5. Be specific about security measures, processes, or technologies relevant to the control statement above
6. Do not include generic phrases like "Board of Directors" unless specifically relevant
7. Do NOT use imperative/instructional language (avoid "Implement...", "Create...", "Ensure...")
8. CRITICAL: Your response MUST be exactly 250 characters or less - count your characters carefully
9. Be concise and precise - prioritize essential information, omit unnecessary words
10. Reference at least one requirement or concept from the control statement (or title when no statement is available)
11. ${styleAnalysis ? 'Match writing style from examples without copying their implementation details.' : 'Keep the response aligned with standard OSCAL implementation descriptions'}

${styleAnalysis ? '' : 'Example format (exactly 250 characters): "Break Glass accounts are implemented by creating high-privileged, emergency-access accounts that are activated only when regular authentication processes fail or are compromised. These accounts have least privilege access and are monitored for usage."'}

Implementation Description:`;
}

/**
 * Build extended prompt requesting JSON with implementation, testingObjective, testingProcedure, remarks
 * Includes existing implementation AND remarks examples so the AI can suggest Additional Notes in the same style.
 */
function buildExtendedPrompt(control, existingControls = []) {
  const basePrompt = buildPrompt(control, existingControls);
  const remarksExamples = getRemarksExamples(existingControls);
  const remarksGuidance = remarksExamples.length > 0
    ? `

EXAMPLES of Additional Notes / Consumer Guidance from your existing controls (match this style when you suggest remarks):
${remarksExamples.map((r, idx) => `${idx + 1}. "${r}"`).join('\n')}

When relevant, suggest a brief additional note or consumer guidance in the same style as above; otherwise use empty string for "remarks".`
    : '';

  const controlId = control.id || 'Unknown';
  const controlTitle = extractControlTitleForPrompt(control);

  return `${basePrompt}

Alternatively, respond with a JSON object containing all of the following (use this format so we can fill Implementation, Assessment/Testing Objective, Testing Method, and Additional Notes):${remarksGuidance}

Respond with ONLY a valid JSON object, no other text. Use this exact structure:
{
  "implementation": "2-3 sentences, 250 chars or less, describing what has been implemented for ${controlId} (past/present perfect tense).",
  "testingObjective": "One sentence specific to ${controlId} (${controlTitle}): what to verify when assessing this control.",
  "testingProcedure": "One sentence describing how to test ${controlId} specifically (e.g., review evidence of..., inspect configuration for...).",
  "remarks": "Optional brief additional notes or consumer guidance for ${controlId}, or empty string if none."
}

Requirements for each field: implementation (250 chars or less, unique to this control); testingObjective and testingProcedure (must mention ${controlId} or its title, not generic assessment language); remarks (short or empty). Respond with ONLY the JSON object.`;
}

/**
 * Parse structured JSON response into { implementation, testingObjective, testingProcedure, remarks }
 * Handles responses with leading text (e.g. "Implementation Description: {...}") or markdown code blocks.
 */
function parseStructuredResponse(rawResponse) {
  if (!rawResponse || typeof rawResponse !== 'string') return null;
  let text = rawResponse.trim();
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) text = codeBlockMatch[1].trim();
  text = text.replace(/^(Implementation Description|Description|Implementation):\s*/i, '').trim();
  const start = text.indexOf('{');
  if (start !== -1) {
    const end = text.lastIndexOf('}') + 1;
    if (end > start) text = text.slice(start, end);
  }
  text = text.replace(/\.\s*$/, '').trim(); // strip trailing period that some models add
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    const implementation = typeof parsed.implementation === 'string' ? cleanResponse(parsed.implementation) : null;
    const testingObjective = typeof parsed.testingObjective === 'string' ? parsed.testingObjective.trim() : null;
    const testingProcedure = typeof parsed.testingProcedure === 'string' ? parsed.testingProcedure.trim() : null;
    const remarks = typeof parsed.remarks === 'string' ? parsed.remarks.trim() : '';
    return {
      implementation: implementation && implementation.length > 10 ? implementation : null,
      testingObjective: testingObjective && testingObjective.length > 5 ? testingObjective : null,
      testingProcedure: testingProcedure && testingProcedure.length > 5 ? testingProcedure : null,
      remarks: remarks || ''
    };
  } catch (_) {
    return null;
  }
}

/**
 * Clean and format the AI response
 */
function cleanResponse(response) {
  if (!response) return null;
  
  // Remove markdown formatting if present
  let cleaned = response
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .trim();
  
  // Remove common prefixes/suffixes
  cleaned = cleaned
    .replace(/^(Implementation Description:|Description:|Implementation:)\s*/i, '')
    .replace(/\s*(This control|The control|This implementation).*$/i, '')
    .trim();
  
  // Convert imperative/instructional language to descriptive language
  // Common patterns: "Implement X by..." -> "X is implemented by..."
  // "Create X..." -> "X is created..."
  // "Ensure X..." -> "X is ensured..."
  const imperativeConversions = [
    { pattern: /^Implement\s+(.+?)\s+by\s+(.+)$/i, replacement: '$1 is implemented by $2' },
    { pattern: /^Implement\s+(.+)$/i, replacement: '$1 is implemented' },
    { pattern: /^Create\s+(.+?)\s+by\s+(.+)$/i, replacement: '$1 is created by $2' },
    { pattern: /^Create\s+(.+)$/i, replacement: '$1 is created' },
    { pattern: /^Ensure\s+(.+)$/i, replacement: '$1 is ensured' },
    { pattern: /^Configure\s+(.+)$/i, replacement: '$1 is configured' },
    { pattern: /^Establish\s+(.+)$/i, replacement: '$1 is established' },
    { pattern: /^Maintain\s+(.+)$/i, replacement: '$1 is maintained' },
    { pattern: /^Monitor\s+(.+)$/i, replacement: '$1 is monitored' },
    { pattern: /^Protect\s+(.+)$/i, replacement: '$1 is protected' },
    { pattern: /^Manage\s+(.+)$/i, replacement: '$1 is managed' },
    { pattern: /^Enforce\s+(.+)$/i, replacement: '$1 is enforced' }
  ];
  
  for (const conversion of imperativeConversions) {
    if (conversion.pattern.test(cleaned)) {
      cleaned = cleaned.replace(conversion.pattern, conversion.replacement);
      break; // Only apply first match
    }
  }
  
  // Remove extra whitespace and normalize spacing
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Do NOT truncate - rely on prompt to generate within 250 characters
  // Just ensure it ends with a period if it doesn't already
  if (cleaned && !cleaned.endsWith('.') && !cleaned.endsWith('!') && !cleaned.endsWith('?')) {
    cleaned += '.';
  }
  
  return cleaned || null;
}

/**
 * Try to generate with a specific AI provider
 * @param {string} provider - Provider name
 * @param {Object} control - Control object
 * @param {Object} config - Provider config
 * @param {Array} existingControls - Existing controls for context
 * @param {{ extended?: boolean }} [options] - When extended, use prompt that returns JSON and parse to { implementation, testingObjective, testingProcedure, remarks }
 * @returns {Promise<string|Object|null>} Implementation text, or extended object, or null
 */
async function tryGenerateWithProvider(provider, control, config, existingControls, options = {}) {
  const maxRetries = config.maxRetries || 2;
  const extended = !!options.extended;
  const prompt = extended ? buildExtendedPrompt(control, existingControls) : null;
  const logContext = buildLogContext(options.requestUser);
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let raw = null;
      if (provider === 'ollama') {
        raw = await generateWithOllama(control, config, existingControls, prompt, logContext);
      } else if (provider === 'google-ai') {
        raw = await generateWithGoogleAI(control, config, existingControls, prompt, logContext);
      } else {
        throw new Error(`Unknown AI provider: ${provider}`);
      }

      if (extended && raw && typeof raw === 'string') {
        const parsed = parseStructuredResponse(raw);
        if (parsed && parsed.implementation && parsed.implementation.length > 50) {
          console.log(`✅ Successfully generated extended suggestions with ${provider} (attempt ${attempt + 1})`);
          return parsed;
        }
        // Extended mode: never use raw response as implementation (it may be JSON); retry or throw
        continue;
      }
      if (raw && typeof raw === 'string' && raw.length > 50) {
        console.log(`✅ Successfully generated implementation with ${provider} (attempt ${attempt + 1})`);
        return raw;
      }
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ ${provider} generation attempt ${attempt + 1} failed:`, error.message);

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError || new Error(`${provider} generation failed after all retries`);
}

function normalizeAIResult(result, provider, extra = {}) {
  if (!result) return null;
  if (typeof result === 'object' && result.implementation) {
    return {
      text: result.implementation,
      testingObjective: result.testingObjective || undefined,
      testingProcedure: result.testingProcedure || undefined,
      remarks: result.remarks !== undefined ? result.remarks : undefined,
      aiGenerated: true,
      attempted: true,
      provider,
      ...extra
    };
  }
  if (typeof result === 'string' && result.length > 50) {
    return { text: result, aiGenerated: true, attempted: true, provider, ...extra };
  }
  return null;
}

/**
 * Generate implementation with dual-method fallback pattern
 * @param {{ extended?: boolean }} [options] - When extended, request implementation + testingObjective + testingProcedure + remarks
 */
export async function generateImplementationWithGemma(control, fallbackGenerator, existingControls = [], options = {}) {
  try {
    const config = await loadGemmaConfig();
    const extended = !!options.extended;

    if (!config.enabled) {
      console.log('🤖 Gemma is disabled, using fallback');
      const fallback = fallbackGenerator ? fallbackGenerator(control) : null;
      return fallback ? { text: fallback, aiGenerated: false, attempted: false } : null;
    }

    console.log(`🤖 Generating implementation with ${config.provider} for control: ${control.id}${extended ? ' (extended fields)' : ''}`);
    
    let implementation = null;
    let primaryProvider = config.provider;
    let fallbackProvider = null;
    let primaryError = null;
    const providerOptions = { extended: !!extended, requestUser: options.requestUser };

    // Only fall back to Ollama for google-ai (aws-bedrock+gemma is handled by bedrockGemmaService)
    if (config.provider === 'google-ai') {
      fallbackProvider = 'ollama';
    }
    
    try {
      implementation = await tryGenerateWithProvider(primaryProvider, control, config, existingControls, providerOptions);
      const normalized = normalizeAIResult(implementation, primaryProvider);
      if (normalized) return normalized;
    } catch (error) {
      primaryError = error;
      console.warn(`⚠️ Primary provider (${primaryProvider}) failed:`, error.message);
    }
    
    // Try fallback provider if available
    if (fallbackProvider && !implementation) {
      console.log(`🔄 Attempting fallback to ${fallbackProvider}...`);
      
      try {
        // Create fallback config (use default Ollama settings)
        const fallbackConfig = {
          ...config,
          provider: fallbackProvider,
          ollamaUrl: config.ollamaUrl || 'http://localhost:11434',
          model: 'gemma2', // Default to gemma2 for fallback
          maxRetries: 1 // Fewer retries for fallback
        };
        
        implementation = await tryGenerateWithProvider(fallbackProvider, control, fallbackConfig, existingControls, providerOptions);
        const normalized = normalizeAIResult(implementation, fallbackProvider, { usedFallback: true, primaryError: primaryError?.message });
        if (normalized) return normalized;
      } catch (fallbackError) {
        console.warn(`⚠️ Fallback provider (${fallbackProvider}) also failed:`, fallbackError.message);
      }
    }
    
    // All AI providers failed, use pattern matching fallback
    if (config.fallbackToPatternMatching !== false) {
      console.log('⚠️ All AI providers failed, using pattern matching fallback');
      const fallback = fallbackGenerator ? fallbackGenerator(control) : null;
      // Return with flag indicating fallback was used after attempting AI
      return fallback ? { 
        text: fallback, 
        aiGenerated: false, 
        attempted: true, 
        error: primaryError?.message,
        fallbackReason: 'All AI providers unavailable'
      } : null;
    }
    
    throw primaryError || new Error('AI generation failed after all attempts');
    
  } catch (error) {
    console.error('❌ Error in Gemma service:', error.message);
    
    // Fallback to pattern matching if enabled
    const config = await loadGemmaConfig();
    if (config.fallbackToPatternMatching !== false && fallbackGenerator) {
      console.log('🔄 Falling back to pattern matching due to error');
      const fallback = fallbackGenerator(control);
      return fallback ? { 
        text: fallback, 
        aiGenerated: false, 
        attempted: true, 
        error: error.message,
        fallbackReason: 'Service error'
      } : null;
    }
    
    return null;
  }
}

/**
 * Check if Gemma service is available
 */
export async function checkGemmaAvailability() {
  try {
    const config = await loadGemmaConfig();
    
    if (!config.enabled) {
      return {
        available: false,
        reason: 'Gemma is disabled in configuration'
      };
    }
    
    if (config.provider === 'ollama') {
      // Check Ollama health
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Checking Ollama availability at: ${config.ollamaUrl}`);
      }
      // Prepare headers with API token if provided
      const headers = {};
      if (config.apiToken && config.apiToken.trim()) {
        headers['Authorization'] = `Bearer ${config.apiToken.trim()}`;
      }
      
      // Handle URLs that may or may not end with /
      const tagsUrl = config.ollamaUrl.endsWith('/') 
        ? `${config.ollamaUrl}api/tags` 
        : `${config.ollamaUrl}/api/tags`;
      
      try {
        const response = await axios.get(tagsUrl, {
          timeout: 5000,
          headers: headers,
          httpsAgent: config.ollamaUrl.startsWith('https') ? new https.Agent({ rejectUnauthorized: false }) : undefined
        });
        
        // Check if gemma model is available
        const models = response.data?.models || [];
        const modelName = config.model || 'gemma2';
        const hasModel = models.some(m => m.name === modelName || m.name.includes('gemma'));
        
        console.log(`✅ Ollama is reachable. Models: ${models.map(m => m.name).join(', ')}`);
        console.log(`   Looking for: ${modelName}, Found: ${hasModel}`);
        
        return {
          available: hasModel,
          provider: 'ollama',
          ollamaUrl: config.ollamaUrl,
          models: models.map(m => m.name),
          configuredModel: modelName,
          reason: hasModel ? 'Available' : `Model ${modelName} not found. Available models: ${models.map(m => m.name).join(', ')}`
        };
      } catch (error) {
        const errorDetails = {
          code: error.code,
          message: error.message,
          response: error.response ? {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          } : null
        };
        
        console.error(`❌ Ollama health check failed:`, errorDetails);
        
        let reason = `Ollama service not reachable at ${config.ollamaUrl}`;
        if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          reason += `. Connection refused or host not found. ` +
            `Please ensure: ` +
            `1. Ollama container is running, ` +
            `2. Containers are on the same Docker network, ` +
            `3. OLLAMA_URL is set correctly (current: ${config.ollamaUrl})`;
        } else if (error.code === 'ETIMEDOUT') {
          reason += `. Request timed out. The service may be overloaded.`;
        } else {
          reason += `. Error: ${error.message}`;
        }
        
        return {
          available: false,
          provider: 'ollama',
          ollamaUrl: config.ollamaUrl,
          reason: reason,
          error: errorDetails
        };
      }
    } else if (config.provider === 'google-ai') {
      if (!config.googleApiKey) {
        return {
          available: false,
          provider: 'google-ai',
          reason: 'Google AI API key not configured'
        };
      }
      return {
        available: true,
        provider: 'google-ai',
        reason: 'Google AI API configured (availability not tested)'
      };
    }
    
    return {
      available: false,
      reason: `Unknown provider: ${config.provider}`
    };
  } catch (error) {
    return {
      available: false,
      reason: `Error checking availability: ${error.message}`
    };
  }
}

export { buildPrompt, buildExtendedPrompt, cleanResponse, parseStructuredResponse };

export default {
  generateImplementationWithGemma,
  checkGemmaAvailability,
  loadGemmaConfig
};
