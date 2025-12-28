/**
 * Mistral 7B Service
 * Provides AI-powered implementation text generation using Mistral 7B
 * Supports both Ollama (local) and Mistral AI API (cloud)
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import axios from 'axios';
import http from 'http';
import https from 'https';
import { loadConfig } from './configManager.js';
import { logAIInteraction, logAIError } from './aiLogger.js';

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
    const config = await loadConfig();
    
    // Priority 1: Check Settings AI Config (highest priority - user configured)
    let aiUrl = null;
    let aiEnabled = false;
    let aiModel = 'mistral:7b';
    let aiTimeout = 30000;
    let aiApiToken = '';
    let aiProvider = 'ollama';
    let awsRegion = 'us-east-1';
    let awsAccessKeyId = '';
    let awsSecretAccessKey = '';
    let bedrockModelId = 'mistral.mistral-large-2402-v1:0';
    
    if (config.aiConfig && config.aiConfig.enabled) {
      aiEnabled = true;
      aiProvider = config.aiConfig.provider || 'ollama';
      aiTimeout = config.aiConfig.timeout || 180000;
      
      // Provider-specific configuration
      if (aiProvider === 'aws-bedrock') {
        // AWS Bedrock configuration
        awsRegion = config.aiConfig.awsRegion || 'us-east-1';
        awsAccessKeyId = config.aiConfig.awsAccessKeyId || '';
        awsSecretAccessKey = config.aiConfig.awsSecretAccessKey || '';
        bedrockModelId = config.aiConfig.bedrockModelId || 'mistral.mistral-large-2402-v1:0';
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
      bedrockModelId: bedrockModelId,
      timeout: aiTimeout || config.mistralConfig?.timeout || 180000, // 180 seconds default for model loading and processing
      maxRetries: config.mistralConfig?.maxRetries || 2,
      fallbackToPatternMatching: config.mistralConfig?.fallbackToPatternMatching !== false
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
 */
async function generateWithOllama(control, config, existingControls = []) {
  const prompt = buildPrompt(control, existingControls);
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
          num_predict: 150 // Reduced to encourage shorter responses (~250 chars)
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
          maxTokens: 150
        },
        tokenUsage: {
          inputTokens: Math.ceil(prompt.length / 4), // Approximate
          outputTokens: Math.ceil(cleanedResponse.length / 4), // Approximate
          totalTokens: Math.ceil((prompt.length + cleanedResponse.length) / 4)
        },
        latency: latency,
        status: 'success'
      });
      
      console.log(`✅ Successfully received response from Ollama (${response.data.response.length} chars)`);
      return cleanedResponse;
    }
    
    console.warn(`⚠️ Invalid response format from Ollama:`, response.data);
    throw new Error('Invalid response format from Ollama');
  } catch (error) {
    const latency = Date.now() - startTime;
    
    // Log AI error (OTel GenAI Semantic Conventions)
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
        errorCode: error.code,
        latency: latency
      }
    });
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      const errorMsg = `Ollama service not reachable at ${config.ollamaUrl}. ` +
        `Error: ${error.code}. ` +
        `Please ensure: ` +
        `1. Ollama container is running (docker ps | grep ollama), ` +
        `2. Containers are on the same Docker network, ` +
        `3. OLLAMA_URL environment variable is set correctly (current: ${config.ollamaUrl})`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      const errorMsg = `Ollama request timed out after ${config.timeout || 180000}ms. ` +
        `The service may be overloaded or the model may not be loaded. Falling back to template-based suggestions.`;
      console.warn(`⚠️ ${errorMsg}`);
      // Don't throw - let the fallback mechanism handle it
      throw new Error(errorMsg);
    } else if (error.response) {
      const errorMsg = `Ollama returned error ${error.response.status}: ${error.response.statusText}. ` +
        `Response: ${JSON.stringify(error.response.data)}`;
      console.error(`❌ ${errorMsg}`);
      throw new Error(errorMsg);
    }
    console.error(`❌ Unexpected error connecting to Ollama:`, error.message);
    console.error(`   Code: ${error.code}`);
    console.error(`   Stack:`, error.stack);
    throw error;
  }
}

/**
 * Generate implementation text using Mistral AI API (cloud)
 */
async function generateWithMistralAPI(control, config, existingControls = []) {
  if (!config.mistralApiKey) {
    throw new Error('Mistral API key not configured');
  }

  const prompt = buildPrompt(control, existingControls);
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
        max_tokens: 150, // Reduced to encourage shorter responses (~250 chars)
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
          maxTokens: 150,
          responseId: response.data.id
        },
        tokenUsage: {
          inputTokens: response.data.usage?.prompt_tokens || Math.ceil(prompt.length / 4),
          outputTokens: response.data.usage?.completion_tokens || Math.ceil(cleanedResponse.length / 4),
          totalTokens: response.data.usage?.total_tokens || Math.ceil((prompt.length + cleanedResponse.length) / 4)
        },
        latency: latency,
        status: 'success'
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
      }
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
async function generateWithAWSBedrock(control, config, existingControls = []) {
  if (!BedrockRuntimeClient || !ConverseCommand) {
    throw new Error('AWS SDK not installed. Install with: npm install @aws-sdk/client-bedrock-runtime');
  }

  if (!config.awsAccessKeyId || !config.awsSecretAccessKey) {
    throw new Error('AWS credentials not configured');
  }

  if (!config.awsRegion) {
    throw new Error('AWS region not configured');
  }

  const prompt = buildPrompt(control, existingControls);
  const startTime = Date.now();
  
  try {
    console.log(`🔄 Connecting to AWS Bedrock in ${config.awsRegion}...`);
    
    // Import Node.js https and AWS SDK handler
    const { Agent: HttpsAgent } = await import('https');
    const { NodeHttpHandler } = await import('@smithy/node-http-handler');
    
    // Create custom HTTPS agent to handle SSL certificate issues
    // In production, you should use proper SSL certificates
    const httpsAgent = new HttpsAgent({
      rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
      keepAlive: true
    });
    
    // Create Bedrock Runtime client with custom request handler
    const client = new BedrockRuntimeClient({
      region: config.awsRegion,
      credentials: {
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey
      },
      requestHandler: new NodeHttpHandler({
        httpsAgent: httpsAgent,
        connectionTimeout: 30000,
        socketTimeout: config.timeout || 180000
      })
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
        maxTokens: 512,
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
            maxTokens: 512,
            awsRegion: config.awsRegion,
            finishReasons: response.stopReason ? [response.stopReason] : []
          },
          tokenUsage: {
            inputTokens: response.usage?.inputTokens || Math.ceil(prompt.length / 4),
            outputTokens: response.usage?.outputTokens || Math.ceil(cleanedResponse.length / 4),
            totalTokens: response.usage?.totalTokens || Math.ceil((prompt.length + cleanedResponse.length) / 4)
          },
          latency: latency,
          status: 'success'
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
      }
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
 * Analyze existing controls to extract writing style patterns
 */
function analyzeWritingStyle(existingControls) {
  if (!existingControls || existingControls.length === 0) {
    return null;
  }
  
  // Get implementations from existing controls
  const implementations = existingControls
    .filter(c => c.implementation && c.implementation.length > 50)
    .map(c => c.implementation.trim())
    .slice(0, 25); // Use up to 25 examples
  
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
 * Build prompt for Mistral based on control information
 */
function buildPrompt(control, existingControls = []) {
  // Clean title
  let controlTitle = (control.title || '').trim();
  if (controlTitle.toLowerCase().startsWith('control:')) {
    controlTitle = controlTitle.substring(8).trim();
  }
  
  // Extract description from parts
  let controlDescription = '';
  if (control.parts && Array.isArray(control.parts) && control.parts.length > 0) {
    const statementParts = control.parts.filter(p => 
      p.name === 'statement' || p.name === 'objective' || p.name === 'item'
    );
    const partsToUse = statementParts.length > 0 ? statementParts : control.parts;
    controlDescription = partsToUse
      .map(part => (part.prose || part.title || ''))
      .filter(text => text.length > 0)
      .join('\n\n');
  }
  
  if (!controlDescription && control.description) {
    controlDescription = control.description;
  }

  // Build context
  const controlId = control.id || 'Unknown';
  const controlFamily = controlId.split('-')[0];
  
  // Analyze existing controls for style guidance
  const styleAnalysis = analyzeWritingStyle(existingControls);
  
  // Build style guidance section
  let styleGuidance = '';
  if (styleAnalysis && styleAnalysis.examples.length > 0) {
    styleGuidance = `

STYLE GUIDANCE - Match the writing style of these existing implementations:
${styleAnalysis.examples.map((ex, idx) => `${idx + 1}. "${ex}"`).join('\n')}

IMPORTANT: Your response should match the tone, structure, and terminology used in the examples above.`;
  }
  
  return `Generate a professional implementation description for the following security control:

Control ID: ${controlId}
Control Title: ${controlTitle}
Control Family: ${controlFamily}

Control Description:
${controlDescription || 'No description available'}${styleGuidance}

Requirements:
1. Write 2-3 concise sentences describing what HAS BEEN implemented (past/present perfect tense)
2. Use descriptive language: "X is implemented by...", "We have implemented...", "The system uses...", "X are configured to..."
3. Focus on practical, technical implementation details that exist
4. Use professional cybersecurity terminology
5. Be specific about security measures, processes, or technologies that are in place
6. Do not include generic phrases like "Board of Directors" unless specifically relevant
7. Do NOT use imperative/instructional language (avoid "Implement...", "Create...", "Ensure...")
8. CRITICAL: Your response MUST be exactly 250 characters or less - count your characters carefully
9. Be concise and precise - prioritize essential information, omit unnecessary words
10. ${styleAnalysis ? 'Match the writing style, tone, and structure of the examples provided above.' : 'Keep the response aligned with standard OSCAL implementation descriptions'}

${styleAnalysis ? '' : 'Example format (exactly 250 characters): "Break Glass accounts are implemented by creating high-privileged, emergency-access accounts that are activated only when regular authentication processes fail or are compromised. These accounts have least privilege access and are monitored for usage."'}

Implementation Description:`;
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
 * @returns {Promise<string|null>} Implementation text or null
 */
async function tryGenerateWithProvider(provider, control, config, existingControls) {
  const maxRetries = config.maxRetries || 2;
  let lastError = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let implementation = null;
      
      if (provider === 'ollama') {
        implementation = await generateWithOllama(control, config, existingControls);
      } else if (provider === 'mistral-api') {
        implementation = await generateWithMistralAPI(control, config, existingControls);
      } else if (provider === 'aws-bedrock') {
        implementation = await generateWithAWSBedrock(control, config, existingControls);
      } else {
        throw new Error(`Unknown AI provider: ${provider}`);
      }
      
      if (implementation && implementation.length > 50) {
        console.log(`✅ Successfully generated implementation with ${provider} (attempt ${attempt + 1})`);
        return implementation;
      }
    } catch (error) {
      lastError = error;
      console.warn(`⚠️ ${provider} generation attempt ${attempt + 1} failed:`, error.message);
      
      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  
  throw lastError || new Error(`${provider} generation failed after all retries`);
}

/**
 * Generate implementation with dual-method fallback pattern
 * Tries primary provider first, falls back to secondary provider if available
 * 
 * @param {Object} control - Control object
 * @param {Function} fallbackGenerator - Fallback generator for pattern matching
 * @param {Array} existingControls - Existing controls for context
 * @returns {Promise<Object|null>} Result object with text, aiGenerated, attempted flags
 */
export async function generateImplementationWithMistral(control, fallbackGenerator, existingControls = []) {
  try {
    const config = await loadMistralConfig();
    
    // Check if Mistral is enabled
    if (!config.enabled) {
      console.log('🤖 Mistral is disabled, using fallback');
      // Return fallback with flag indicating Mistral was not attempted
      const fallback = fallbackGenerator ? fallbackGenerator(control) : null;
      return fallback ? { text: fallback, aiGenerated: false, attempted: false } : null;
    }

    console.log(`🤖 Generating implementation with ${config.provider} for control: ${control.id}`);
    
    let implementation = null;
    let primaryProvider = config.provider;
    let fallbackProvider = null;
    let primaryError = null;
    
    // Define provider fallback chain (Dual-Method Fallback Pattern)
    // Priority: Configured Provider -> Local Ollama (if available) -> Pattern Matching
    if (config.provider === 'mistral-api' || config.provider === 'aws-bedrock') {
      // If using cloud service, fallback to local Ollama
      fallbackProvider = 'ollama';
    }
    
    // Try primary provider
    try {
      implementation = await tryGenerateWithProvider(primaryProvider, control, config, existingControls);
      
      if (implementation && implementation.length > 50) {
        return { text: implementation, aiGenerated: true, attempted: true, provider: primaryProvider };
      }
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
          model: 'mistral:7b',
          maxRetries: 1 // Fewer retries for fallback
        };
        
        implementation = await tryGenerateWithProvider(fallbackProvider, control, fallbackConfig, existingControls);
        
        if (implementation && implementation.length > 50) {
          console.log(`✅ Successfully generated with fallback provider (${fallbackProvider})`);
          return { 
            text: implementation, 
            aiGenerated: true, 
            attempted: true, 
            provider: fallbackProvider,
            usedFallback: true,
            primaryError: primaryError?.message
          };
        }
      } catch (fallbackError) {
        console.warn(`⚠️ Fallback provider (${fallbackProvider}) also failed:`, fallbackError.message);
        // Continue to pattern matching fallback
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

