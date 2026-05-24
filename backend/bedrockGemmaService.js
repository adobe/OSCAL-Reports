/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import https from 'https';
import { getResolvedConfig } from './configManager.js';
import { logAIInteraction, logAIError, buildLogContext } from './aiLogger.js';
import {
  buildPrompt,
  buildExtendedPrompt,
  cleanResponse,
  parseStructuredResponse
} from './gemmaService.js';

let BedrockRuntimeClient, ConverseCommand;
try {
  const awsModule = await import('@aws-sdk/client-bedrock-runtime');
  BedrockRuntimeClient = awsModule.BedrockRuntimeClient;
  ConverseCommand = awsModule.ConverseCommand;
} catch (error) {
  console.log('ℹ️ AWS SDK not installed. Run: npm install @aws-sdk/client-bedrock-runtime');
}

/**
 * Load Bedrock Gemma config from app config (no Ollama/Google).
 * @returns {Promise<Object>} { enabled, awsRegion, awsAccessKeyId, awsSecretAccessKey, bedrockModelId, timeout, maxTokens }
 */
export async function loadBedrockGemmaConfig() {
  try {
    const config = getResolvedConfig();
    const ai = config?.aiConfig || {};
    const configuredBedrockModel = (ai.bedrockModelId || '').trim();
    const isGemma = configuredBedrockModel && (configuredBedrockModel.includes('gemma') || configuredBedrockModel.startsWith('google.'));

    if (!ai.enabled || !isGemma) {
      return {
        enabled: false,
        awsRegion: ai.awsRegion || 'us-east-1',
        awsAccessKeyId: ai.awsAccessKeyId || '',
        awsSecretAccessKey: ai.awsSecretAccessKey || '',
        bedrockModelId: configuredBedrockModel || '',
        timeout: ai.timeout || 180000,
        maxTokens: {
          connectionTest: ai.maxTokens?.connectionTest ?? 10,
          controlGeneration: ai.maxTokens?.controlGeneration ?? 150,
          general: ai.maxTokens?.general ?? 512
        }
      };
    }

    return {
      enabled: true,
      awsRegion: ai.awsRegion || 'us-east-1',
      awsAccessKeyId: ai.awsAccessKeyId || '',
      awsSecretAccessKey: ai.awsSecretAccessKey || '',
      bedrockModelId: configuredBedrockModel,
      timeout: ai.timeout || 180000,
      maxTokens: {
        connectionTest: ai.maxTokens?.connectionTest ?? 10,
        controlGeneration: ai.maxTokens?.controlGeneration ?? 150,
        general: ai.maxTokens?.general ?? 512
      }
    };
  } catch (error) {
    console.warn('⚠️ Could not load Bedrock Gemma config:', error.message);
    return {
      enabled: false,
      awsRegion: 'us-east-1',
      awsAccessKeyId: '',
      awsSecretAccessKey: '',
      bedrockModelId: '',
      timeout: 180000,
      maxTokens: { connectionTest: 10, controlGeneration: 150, general: 512 }
    };
  }
}

/**
 * Extract text from a Converse content block (probe-validated: Gemma returns block.text).
 * Also supports reasoningContent / ReasoningText, casing variants, and deep fallback.
 */
function getTextFromBlock(block) {
  if (!block || typeof block !== 'object') return null;
  if (typeof block.text === 'string' && block.text.trim()) return block.text.trim();
  if (block.reasoningContent) {
    const rc = block.reasoningContent;
    const rt = rc?.reasoningText?.text ?? rc?.text;
    if (typeof rt === 'string' && rt.trim()) return rt.trim();
  }
  if (typeof block.Text === 'string' && block.Text.trim()) return block.Text.trim();
  const rc = block.ReasoningContent || block.reasoningContent;
  if (rc) {
    const rt = rc?.ReasoningText?.Text ?? rc?.reasoningText?.text ?? rc?.text ?? rc?.ReasoningText ?? rc?.reasoningText;
    const s = typeof rt === 'string' ? rt : (rt?.text ?? rt?.Text);
    if (typeof s === 'string' && s.trim()) return s.trim();
  }
  for (const v of Object.values(block)) {
    if (typeof v === 'string' && v.trim().length > 10) return v.trim();
    if (v && typeof v === 'object' && (typeof v.text === 'string' || typeof v.Text === 'string')) {
      const s = (v.text || v.Text || '').trim();
      if (s) return s;
    }
  }
  return deepFirstLongString(block);
}

/** Fallback: recursively find first string long enough to be model output (handles unknown SDK shapes). */
function deepFirstLongString(obj, depth = 0) {
  if (depth > 3 || !obj || typeof obj !== 'object') return null;
  for (const v of Object.values(obj)) {
    if (typeof v === 'string' && v.trim().length > 20) return v.trim();
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const found = deepFirstLongString(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Generate implementation using AWS Bedrock Converse (Gemma only).
 * Same contract as generateImplementationWithGemma: returns { text, aiGenerated, attempted, provider, ... } or extended object.
 */
export async function generateImplementationWithBedrockGemma(control, fallbackGenerator, existingControls = [], options = {}) {
  if (!BedrockRuntimeClient || !ConverseCommand) {
    throw new Error('AWS SDK not installed. Install with: npm install @aws-sdk/client-bedrock-runtime');
  }

  const config = await loadBedrockGemmaConfig();
  if (!config.enabled) {
    const fallback = fallbackGenerator ? fallbackGenerator(control) : null;
    return fallback ? { text: fallback, aiGenerated: false, attempted: false } : null;
  }

  if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
    throw new Error('AWS credentials not configured. In Settings, enter Bedrock access key and secret.');
  }
  if (!config.awsRegion) throw new Error('AWS region not configured');
  const modelId = (config.bedrockModelId || '').trim();
  if (!modelId) {
    throw new Error('AWS Bedrock model not selected. In Settings > AI, choose a Bedrock Model ID (e.g. Gemma 3 4B) and save.');
  }

  const extended = !!options.extended;
  const prompt = extended ? buildExtendedPrompt(control, existingControls) : buildPrompt(control, existingControls);
  const startTime = Date.now();

  try {
    const { NodeHttpHandler } = await import('@smithy/node-http-handler');
    const httpsAgent = new https.Agent({
      rejectUnauthorized: process.env.NODE_ENV === 'production',
      keepAlive: true
    });
    const client = new BedrockRuntimeClient({
      region: config.awsRegion,
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey
      },
      requestHandler: new NodeHttpHandler({
        httpsAgent,
        connectionTimeout: 30000,
        socketTimeout: config.timeout || 180000
      })
    });

    const command = new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text: prompt }] }],
      inferenceConfig: {
        maxTokens: config.maxTokens?.general || 512,
        temperature: 0.7,
        topP: 0.9
      }
    });

    const response = await client.send(command);
    const content = response.output?.message?.content;
    const allTexts = [];
    if (content && Array.isArray(content)) {
      for (const block of content) {
        const t = getTextFromBlock(block);
        if (t) allTexts.push(t);
        else if (block && typeof block === 'object') {
          const fallback = deepFirstLongString(block);
          if (fallback) allTexts.push(fallback);
        }
      }
    }
    if (!allTexts.length && content?.length) {
      console.warn('Bedrock Gemma content blocks (keys only):', content.map(b => b ? Object.keys(b) : []));
      if (response.usage?.outputTokens > 0) {
        console.warn('Bedrock Gemma first block (sample):', JSON.stringify(content[0]).slice(0, 500));
      }
    }

    let responseText = null;
    const withJson = allTexts.find(t => t.includes('"implementation"') && t.includes('}'));
    if (withJson) responseText = withJson;
    else if (allTexts.length > 0) responseText = allTexts.reduce((a, b) => (a.length >= b.length ? a : b));

    if (!responseText || responseText.length < 5) {
      throw new Error('AWS Bedrock returned no usable text (empty or unsupported content blocks).');
    }

    const latency = Date.now() - startTime;
    // Parse from raw response first (cleanResponse strips ```json...``` and would remove the JSON)
    const parsed = extended ? parseStructuredResponse(responseText) : null;
    const cleanedResponse = cleanResponse(responseText);

    logAIInteraction({
      provider: 'aws-bedrock',
      model: modelId,
      operation: 'converse',
      prompt,
      response: (parsed && parsed.implementation) ? parsed.implementation : cleanedResponse,
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
        inputTokens: response.usage?.inputTokens ?? Math.ceil(prompt.length / 4),
        outputTokens: response.usage?.outputTokens ?? Math.ceil(cleanedResponse.length / 4),
        totalTokens: response.usage?.totalTokens ?? Math.ceil((prompt.length + cleanedResponse.length) / 4)
      },
      latency,
      status: 'success',
      context: buildLogContext(options.requestUser)
    });

    if (extended) {
      if (parsed && parsed.implementation && parsed.implementation.length > 50) {
        return {
          text: parsed.implementation,
          testingObjective: parsed.testingObjective,
          testingProcedure: parsed.testingProcedure,
          remarks: parsed.remarks,
          aiGenerated: true,
          attempted: true,
          provider: 'aws-bedrock'
        };
      }
      // Fallback: use full response as implementation so user gets AI text instead of "AI Unavailable"
      if (responseText.length > 50) {
        const impl = (cleanedResponse || responseText).trim();
        const truncated = impl.length > 400 ? impl.slice(0, 397) + '...' : impl;
        return {
          text: truncated,
          testingObjective: parsed?.testingObjective || undefined,
          testingProcedure: parsed?.testingProcedure || undefined,
          remarks: parsed?.remarks !== undefined ? parsed.remarks : undefined,
          aiGenerated: true,
          attempted: true,
          provider: 'aws-bedrock'
        };
      }
      throw new Error('Bedrock Gemma extended response could not be parsed as JSON.');
    }

    return {
      text: cleanedResponse,
      aiGenerated: true,
      attempted: true,
      provider: 'aws-bedrock'
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    logAIError({
      provider: 'aws-bedrock',
      model: modelId,
      operation: 'converse',
      prompt,
      error,
      metadata: {
        controlId: control.id,
        controlTitle: control.title,
        controlFamily: control.id?.split('-')[0] || 'unknown',
        awsRegion: config.awsRegion,
        errorName: error.name,
        latency
      },
      context: buildLogContext(options.requestUser)
    });
    if (error.name === 'AccessDeniedException') {
      throw new Error('AWS Access Denied. Check credentials and IAM permissions (bedrock:InvokeModel required).');
    }
    if (error.name === 'ResourceNotFoundException') {
      throw new Error(`Model not found: ${modelId}. Check model ID and region availability.`);
    }
    if (error.name === 'ThrottlingException') {
      throw new Error('AWS Bedrock throttling limit reached. Please try again later.');
    }
    throw error;
  }
}

/**
 * Check Bedrock Gemma availability (credentials and config only).
 */
export async function checkBedrockGemmaAvailability() {
  try {
    if (!BedrockRuntimeClient || !ConverseCommand) {
      return {
        available: false,
        provider: 'aws-bedrock',
        reason: 'AWS SDK not installed. Run: npm install @aws-sdk/client-bedrock-runtime'
      };
    }
    const config = await loadBedrockGemmaConfig();
    if (!config.enabled) {
      return {
        available: false,
        provider: 'aws-bedrock',
        reason: 'Bedrock Gemma not configured (AI disabled or non-Gemma model selected)'
      };
    }
    if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
      return {
        available: false,
        provider: 'aws-bedrock',
        reason: 'AWS credentials not configured'
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
      reason: 'AWS Bedrock Gemma configured (credentials not validated on this check)'
    };
  } catch (error) {
    return {
      available: false,
      provider: 'aws-bedrock',
      reason: `Error checking availability: ${error.message}`
    };
  }
}
