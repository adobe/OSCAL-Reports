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
import {
  bedrockCredentialsConfigured,
  createBedrockRuntimeClient,
  normalizeBedrockAuthMode
} from './utils/bedrockCredentials.js';
import { logAIInteraction, logAIError, buildLogContext } from './aiLogger.js';
import {
  buildPrompt,
  buildExtendedPrompt,
  cleanResponse,
  parseStructuredResponse,
} from './gemmaService.js';

// AWS SDK imports (lazy loaded when needed)
let BedrockRuntimeClient, ConverseCommand;
try {
  const awsModule = await import('@aws-sdk/client-bedrock-runtime');
  BedrockRuntimeClient = awsModule.BedrockRuntimeClient;
  ConverseCommand = awsModule.ConverseCommand;
} catch (error) {
  console.log('ℹ️ AWS SDK not installed. AWS Bedrock support disabled. Run: npm install @aws-sdk/client-bedrock-runtime');
}

let mistralConfig = null;

/**
 * Load Mistral configuration from config file
 * Priority: Settings AI Config > Environment Variable > Config File > Defaults
 * @returns {Promise<Object>} Mistral configuration object
 */
export async function loadMistralConfig() {
  // Always reload config to pick up changes from Settings UI
  // Don't cache mistralConfig since it can change via Settings
  mistralConfig = null;
  
  try {
    const config = getResolvedConfig();
    
    // Priority 1: Check Settings AI Config (highest priority - user configured)
    let aiUrl = null;
    let aiEnabled = false;
    let aiModel = 'mistral:7b';
    let aiTimeout = 30000;
    let aiApiToken = '';
    let aiProvider = 'aws-bedrock';
    let awsRegion = 'us-east-1';
    let awsAccessKeyId = '';
    let awsSecretAccessKey = '';
    let bedrockModelId = 'mistral.mistral-large-2402-v1:0';
    let bedrockAuthMode = 'access-keys';
    let bedrockAssumeRoleArn = '';
    let bedrockExternalId = '';
    
    if (config.aiConfig && config.aiConfig.enabled) {
      aiEnabled = true;
      aiProvider = config.aiConfig.provider || 'aws-bedrock';
      aiTimeout = config.aiConfig.timeout || 180000;
      
      // Provider-specific configuration
      if (aiProvider === 'aws-bedrock') {
        // AWS Bedrock configuration
        awsRegion = config.aiConfig.awsRegion || 'us-east-1';
        awsAccessKeyId = config.aiConfig.awsAccessKeyId || '';
        awsSecretAccessKey = config.aiConfig.awsSecretAccessKey || '';
        bedrockModelId = config.aiConfig.bedrockModelId || 'mistral.mistral-large-2402-v1:0';
        bedrockAuthMode = normalizeBedrockAuthMode(config.aiConfig);
        bedrockAssumeRoleArn = config.aiConfig.bedrockAssumeRoleArn || '';
        bedrockExternalId = config.aiConfig.bedrockExternalId || '';
        console.log(`🔧 Using AWS Bedrock in region: ${awsRegion}`);
        console.log(`   Model: ${bedrockModelId}`);
        console.log(`   Timeout: ${aiTimeout}ms (${aiTimeout/1000}s)`);
      } else if (config.aiConfig.url) {
        // Ollama or Mistral API - requires URL
        let baseUrl = config.aiConfig.url.trim();
        
        // Handle migration from old format (url + port) to new format (full URL)
        if (config.aiConfig.port && !baseUrl.includes('://')) {
          // Old format: separate url and port
          const hostname = baseUrl || 'localhost';
          const port = config.aiConfig.port || 11434;
          baseUrl = `http://${hostname}:${port}`;
        }
        
        // Add protocol if missing (default to http for ollama, https for mistral-api)
        if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
          baseUrl = aiProvider === 'mistral-api' ? `https://${baseUrl}` : `http://${baseUrl}`;
        }
        
        // Parse and normalize URL
        try {
          const urlObj = new URL(baseUrl);
          aiUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ''}${urlObj.pathname}`;
          aiModel = config.aiConfig.model || 'mistral:7b';
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
    
    // Priority 3: Config file mistralConfig (legacy)
    const defaultOllamaUrl = aiUrl || dockerOllamaUrl || config.mistralConfig?.ollamaUrl || 'http://localhost:11434';
    
    mistralConfig = {
      enabled: aiEnabled || config.mistralConfig?.enabled || false,
      provider: aiProvider || 'ollama', // 'ollama', 'mistral-api', or 'aws-bedrock'
      ollamaUrl: defaultOllamaUrl,
      model: aiModel || config.mistralConfig?.model || 'mistral:7b',
      apiToken: aiApiToken || config.mistralConfig?.apiToken || '',
      mistralApiKey: config.mistralConfig?.mistralApiKey || '',
      mistralApiUrl: config.mistralConfig?.mistralApiUrl || 'https://api.mistral.ai/v1/chat/completions',
      // AWS Bedrock configuration
      awsRegion: awsRegion,
      awsAccessKeyId: awsAccessKeyId,
      awsSecretAccessKey: awsSecretAccessKey,
      bedrockAuthMode,
      bedrockAssumeRoleArn,
      bedrockExternalId,
      bedrockModelId: bedrockModelId,
      timeout: aiTimeout || config.mistralConfig?.timeout || 180000, // 180 seconds default for model loading and processing
      maxRetries: config.mistralConfig?.maxRetries || 2,
      fallbackToPatternMatching: config.mistralConfig?.fallbackToPatternMatching !== false,
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
    } else if (config.mistralConfig?.ollamaUrl) {
      console.log(`📝 Using Ollama URL from config file: ${mistralConfig.ollamaUrl}`);
    } else {
      console.log(`⚠️  Using default Ollama URL: ${mistralConfig.ollamaUrl}`);
      console.log(`   Configure AI Engine in Settings → AI Integration for production use`);
    }
    
    return mistralConfig;
  } catch (error) {
    console.warn('⚠️ Could not load Mistral config, using defaults:', error.message);
    mistralConfig = {
      enabled: false,
      provider: 'ollama',
      ollamaUrl: 'http://localhost:11434',
      model: 'mistral:7b',
      timeout: 180000, // Match the generate endpoint timeout
      maxRetries: 2,
      fallbackToPatternMatching: true
    };
    return mistralConfig;
  }
}

/**
 * Generate implementation text using Ollama (local Mistral 7B)
 * @param {string} [promptOverride] - Optional prompt; when provided (e.g. extended prompt), used instead of buildPrompt
 */
async function generateWithOllama(control, config, existingControls = [], promptOverride = null, logContext = {}) {
  const prompt = promptOverride || buildPrompt(control, existingControls);
  const startTime = Date.now();
  
  console.log(`🔗 Attempting to connect to Ollama at: ${config.ollamaUrl}`);
  console.log(`   Model: ${config.model || 'mistral:7b'}`);
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
        model: config.model || 'mistral:7b',
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
        model: config.model || 'mistral:7b',
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
      break;
    }
  }

  const error = lastError;
  const latency = Date.now() - startTime;
  logAIError({
    provider: 'ollama',
    model: config.model || 'mistral:7b',
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
 * Generate implementation text using Mistral AI API (cloud)
 */
async function generateWithMistralAPI(control, config, existingControls = [], promptOverride = null, logContext = {}) {
  if (!config.mistralApiKey) {
    throw new Error('Mistral API key not configured');
  }

  const prompt = promptOverride || buildPrompt(control, existingControls);
  const startTime = Date.now();
  
  try {
    const response = await axios.post(
      config.mistralApiUrl || 'https://api.mistral.ai/v1/chat/completions',
      {
        model: 'mistral-7b-instruct',
        messages: [
          {
            role: 'system',
            content: 'You are a cybersecurity compliance expert specializing in OSCAL control implementations. Generate concise, professional implementation descriptions for security controls.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: config.maxTokens?.controlGeneration || 150, // Configurable max tokens for control generation
        top_p: 0.9
      },
      {
        timeout: config.timeout || 180000,
        headers: {
          'Authorization': `Bearer ${config.mistralApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.data && response.data.choices && response.data.choices[0]) {
      const latency = Date.now() - startTime;
      const cleanedResponse = cleanResponse(response.data.choices[0].message.content);
      
      // Log successful AI interaction (OTel GenAI Semantic Conventions)
      logAIInteraction({
        provider: 'mistral-api',
        model: 'mistral-7b-instruct',
        operation: 'chat.completions',
        prompt: prompt,
        response: cleanedResponse,
        metadata: {
          controlId: control.id,
          controlTitle: control.title,
          controlFamily: control.id?.split('-')[0] || 'unknown',
          temperature: 0.7,
          topP: 0.9,
          maxTokens: config.maxTokens?.controlGeneration || 150,
          responseId: response.data.id
        },
        tokenUsage: {
          inputTokens: response.data.usage?.prompt_tokens || Math.ceil(prompt.length / 4),
          outputTokens: response.data.usage?.completion_tokens || Math.ceil(cleanedResponse.length / 4),
          totalTokens: response.data.usage?.total_tokens || Math.ceil((prompt.length + cleanedResponse.length) / 4)
        },
        latency: latency,
        status: 'success',
        context: logContext
      });
      
      return cleanedResponse;
    }
    
    throw new Error('Invalid response format from Mistral API');
  } catch (error) {
    const latency = Date.now() - startTime;
    
    // Log AI error (OTel GenAI Semantic Conventions)
    logAIError({
      provider: 'mistral-api',
      model: 'mistral-7b-instruct',
      operation: 'chat.completions',
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
    
    if (error.response?.status === 401) {
      throw new Error('Invalid Mistral API key');
    }
    throw error;
  }
}

/**
 * Generate implementation text using AWS Bedrock
 * Supports Mistral, Claude, and Llama models on Bedrock
 */
async function generateWithAWSBedrock(control, config, existingControls = [], promptOverride = null, logContext = {}) {
  if (!BedrockRuntimeClient || !ConverseCommand) {
    throw new Error('AWS SDK not installed. Install with: npm install @aws-sdk/client-bedrock-runtime');
  }

  if (!bedrockCredentialsConfigured(config)) {
    throw new Error('AWS credentials not configured (access keys or IAM role)');
  }

  if (!config.awsRegion) {
    throw new Error('AWS region not configured');
  }

  const prompt = promptOverride || buildPrompt(control, existingControls);
  const startTime = Date.now();
  
  try {
    console.log(`🔄 Connecting to AWS Bedrock in ${config.awsRegion}...`);
    const client = await createBedrockRuntimeClient(config, {
      connectionTimeout: 30000,
      socketTimeout: config.timeout || 180000
    });

    // Set model ID (default to Mistral Large if not specified)
    const modelId = config.bedrockModelId || 'mistral.mistral-large-2402-v1:0';
    console.log(`📝 Using Bedrock model: ${modelId}`);

    // Create the command with Converse API
    const command = new ConverseCommand({
      modelId: modelId,
      messages: [
        {
          role: 'user',
          content: [{ text: prompt }]
        }
      ],
      inferenceConfig: {
        maxTokens: config.maxTokens?.general || 512,
        temperature: 0.7,
        topP: 0.9
      }
    });

    // Send the command and get response
    const response = await client.send(command);

    // Extract response text
    if (response.output && response.output.message && response.output.message.content) {
      const responseText = response.output.message.content[0]?.text;
      if (responseText) {
        const latency = Date.now() - startTime;
        const cleanedResponse = cleanResponse(responseText);
        
        // Log successful AI interaction (OTel GenAI Semantic Conventions)
        logAIInteraction({
          provider: 'aws-bedrock',
          model: modelId,
          operation: 'converse',
          prompt: prompt,
          response: cleanedResponse,
          metadata: {
            controlId: control.id,
            controlTitle: control.title,
            controlFamily: control.id?.split('-')[0] || 'unknown',
            temperature: 0.7,
            topP: 0.9,
            maxTokens: config.maxTokens?.general || 512,
            awsRegion: config.awsRegion,
            finishReasons: response.stopReason ? [response.stopReason] : []
          },
          tokenUsage: {
            inputTokens: response.usage?.inputTokens || Math.ceil(prompt.length / 4),
            outputTokens: response.usage?.outputTokens || Math.ceil(cleanedResponse.length / 4),
            totalTokens: response.usage?.totalTokens || Math.ceil((prompt.length + cleanedResponse.length) / 4)
          },
          latency: latency,
          status: 'success',
          context: logContext
        });
        
        console.log(`✅ Received response from AWS Bedrock (${responseText.length} chars)`);
        return cleanedResponse;
      }
    }
    
    throw new Error('Invalid response format from AWS Bedrock');
  } catch (error) {
    const latency = Date.now() - startTime;
    
    // Log AI error (OTel GenAI Semantic Conventions)
    logAIError({
      provider: 'aws-bedrock',
      model: modelId,
      operation: 'converse',
      prompt: prompt,
      error: error,
      metadata: {
        controlId: control.id,
        controlTitle: control.title,
        controlFamily: control.id?.split('-')[0] || 'unknown',
        awsRegion: config.awsRegion,
        errorName: error.name,
        latency: latency
      },
      context: logContext
    });
    
    if (error.name === 'AccessDeniedException') {
      throw new Error('AWS Access Denied. Check your credentials and IAM permissions (bedrock:InvokeModel required)');
    }
    if (error.name === 'ResourceNotFoundException') {
      throw new Error(`Model not found: ${config.bedrockModelId}. Check model ID and region availability`);
    }
    if (error.name === 'ThrottlingException') {
      throw new Error('AWS Bedrock throttling limit reached. Please try again later');
    }
    console.error(`❌ AWS Bedrock error:`, error.message);
    throw error;
  }
}

/**
 * Generate implementation text using Mistral 7B
 * Falls back to pattern matching if Mistral is unavailable
 * 
 * @param {Object} control - Control object with id, title, description, parts
 * @param {Function} fallbackGenerator - Function to generate fallback implementation
 * @param {Array} existingControls - Array of existing controls to learn writing style from
 * @returns {Promise<string>} - Generated implementation text
 */
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
      } else if (provider === 'mistral-api') {
        raw = await generateWithMistralAPI(control, config, existingControls, prompt, logContext);
      } else if (provider === 'aws-bedrock') {
        raw = await generateWithAWSBedrock(control, config, existingControls, prompt, logContext);
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

/**
 * Normalize AI result to { text, testingObjective?, testingProcedure?, remarks?, aiGenerated, attempted, provider }
 */
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
 * Tries primary provider first, falls back to secondary provider if available
 *
 * @param {Object} control - Control object
 * @param {Function} fallbackGenerator - Fallback generator for pattern matching
 * @param {Array} existingControls - Existing controls for context
 * @param {{ extended?: boolean }} [options] - When extended, request implementation + testingObjective + testingProcedure + remarks
 * @returns {Promise<Object|null>} Result object with text, aiGenerated, attempted flags; or extended fields when options.extended
 */
export async function generateImplementationWithMistral(control, fallbackGenerator, existingControls = [], options = {}) {
  try {
    const config = await loadMistralConfig();
    const extended = !!options.extended;

    // Check if Mistral is enabled
    if (!config.enabled) {
      console.log('🤖 Mistral is disabled, using fallback');
      const fallback = fallbackGenerator ? fallbackGenerator(control) : null;
      return fallback ? { text: fallback, aiGenerated: false, attempted: false } : null;
    }

    console.log(`🤖 Generating implementation with ${config.provider} for control: ${control.id}${extended ? ' (extended fields)' : ''}`);
    
    let implementation = null;
    let primaryProvider = config.provider;
    let fallbackProvider = null;
    let primaryError = null;
    const providerOptions = { extended: !!extended, requestUser: options.requestUser };

    // Define provider fallback chain (Dual-Method Fallback Pattern)
    if (config.provider === 'mistral-api' || config.provider === 'aws-bedrock') {
      fallbackProvider = 'ollama';
    }
    
    // Try primary provider
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
        const fallbackConfig = {
          ...config,
          provider: fallbackProvider,
          ollamaUrl: config.ollamaUrl || 'http://localhost:11434',
          model: 'mistral:7b',
          maxRetries: 1
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
    console.error('❌ Error in Mistral service:', error.message);
    
    // Fallback to pattern matching if enabled
    const config = await loadMistralConfig();
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
 * Check if Mistral service is available
 */
export async function checkMistralAvailability() {
  try {
    const config = await loadMistralConfig();
    
    if (!config.enabled) {
      return {
        available: false,
        reason: 'Mistral is disabled in configuration'
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
        
        // Check if model is available
        const models = response.data?.models || [];
        const modelName = config.model || 'mistral:7b';
        const hasModel = models.some(m => m.name === modelName || m.name.includes('mistral'));
        
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
    } else if (config.provider === 'mistral-api') {
      if (!config.mistralApiKey) {
        return {
          available: false,
          provider: 'mistral-api',
          reason: 'Mistral API key not configured'
        };
      }
      return {
        available: true,
        provider: 'mistral-api',
        reason: 'Mistral API configured (availability not tested)'
      };
    } else if (config.provider === 'aws-bedrock') {
      // Check AWS Bedrock configuration
      if (!BedrockRuntimeClient || !ConverseCommand) {
        return {
          available: false,
          provider: 'aws-bedrock',
          reason: 'AWS SDK not installed. Run: npm install @aws-sdk/client-bedrock-runtime'
        };
      }
      
      if (!bedrockCredentialsConfigured(config)) {
        return {
          available: false,
          provider: 'aws-bedrock',
          reason: 'AWS credentials not configured (access keys or IAM role)'
        };
      }
      
      if (!config.awsRegion) {
        return {
          available: false,
          provider: 'aws-bedrock',
          reason: 'AWS region not configured'
        };
      }
      
      return {
        available: true,
        provider: 'aws-bedrock',
        awsRegion: config.awsRegion,
        bedrockModelId: config.bedrockModelId,
        reason: 'AWS Bedrock configured (credentials not validated - will be tested on first API call)'
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

export default {
  generateImplementationWithMistral,
  checkMistralAvailability,
  loadMistralConfig
};

