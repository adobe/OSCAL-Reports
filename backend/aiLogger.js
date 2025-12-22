/**
 * AI Logger - OpenTelemetry (OTel) Generative AI Semantic Conventions
 * 
 * Logs all AI prompts and responses according to OTel GenAI semantic conventions.
 * Implements automatic log rotation when files reach 5MB.
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 * 
 * Reference: https://opentelemetry.io/docs/specs/semconv/gen-ai/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Log directory configuration
const LOG_DIR = path.join(__dirname, '../logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB in bytes
const LOG_FILE_PREFIX = 'ai-telemetry';

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Get current active log file path
 */
function getCurrentLogFile() {
  const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  let fileIndex = 0;
  let logFile;
  
  // Find the current log file or create new one
  do {
    const suffix = fileIndex === 0 ? '' : `-${fileIndex}`;
    logFile = path.join(LOG_DIR, `${LOG_FILE_PREFIX}-${timestamp}${suffix}.jsonl`);
    
    if (!fs.existsSync(logFile)) {
      // Create new file
      fs.writeFileSync(logFile, '', 'utf8');
      return logFile;
    }
    
    // Check file size
    const stats = fs.statSync(logFile);
    if (stats.size < MAX_LOG_SIZE) {
      return logFile;
    }
    
    // File is full, try next index
    fileIndex++;
  } while (true);
}

/**
 * Generate unique trace ID
 */
function generateTraceId() {
  return `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate unique span ID
 */
function generateSpanId() {
  return `span-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log AI interaction according to OTel GenAI Semantic Conventions
 * 
 * @param {Object} params - Logging parameters
 * @param {string} params.provider - AI provider (ollama, mistral-api, aws-bedrock)
 * @param {string} params.model - Model identifier
 * @param {string} params.operation - Operation type (chat, completion)
 * @param {string} params.prompt - User prompt/input
 * @param {string} params.response - AI response/output
 * @param {Object} params.metadata - Additional metadata
 * @param {number} params.tokenUsage - Token usage information
 * @param {number} params.latency - Request latency in milliseconds
 * @param {string} params.status - Request status (success, error)
 * @param {string} params.error - Error message if failed
 */
export function logAIInteraction({
  provider,
  model,
  operation = 'chat.completions',
  prompt,
  response,
  metadata = {},
  tokenUsage = {},
  latency,
  status = 'success',
  error = null
}) {
  try {
    const timestamp = new Date().toISOString();
    const traceId = generateTraceId();
    const spanId = generateSpanId();
    
    // OTel GenAI Semantic Conventions log entry
    const logEntry = {
      // Trace context
      timestamp,
      trace_id: traceId,
      span_id: spanId,
      
      // Resource attributes (describes the AI system)
      resource: {
        'service.name': 'oscal-report-generator',
        'service.version': '1.2.7',
        'deployment.environment': process.env.NODE_ENV || 'production'
      },
      
      // GenAI attributes (OTel semantic conventions)
      attributes: {
        // GenAI system attributes
        'gen_ai.system': provider, // ollama, mistral-api, aws-bedrock
        'gen_ai.request.model': model,
        'gen_ai.operation.name': operation,
        
        // Request attributes
        'gen_ai.request.temperature': metadata.temperature || 0.7,
        'gen_ai.request.top_p': metadata.topP || 0.9,
        'gen_ai.request.max_tokens': metadata.maxTokens || 512,
        'gen_ai.request.frequency_penalty': metadata.frequencyPenalty || 0,
        'gen_ai.request.presence_penalty': metadata.presencePenalty || 0,
        
        // Response attributes
        'gen_ai.response.id': metadata.responseId || spanId,
        'gen_ai.response.model': metadata.responseModel || model,
        'gen_ai.response.finish_reasons': metadata.finishReasons || ['stop'],
        
        // Token usage
        'gen_ai.usage.input_tokens': tokenUsage.inputTokens || 0,
        'gen_ai.usage.output_tokens': tokenUsage.outputTokens || 0,
        'gen_ai.usage.total_tokens': tokenUsage.totalTokens || 0,
        
        // Performance metrics
        'gen_ai.response.latency_ms': latency || 0,
        
        // Application-specific attributes
        'gen_ai.application.use_case': 'control_implementation_suggestion',
        'gen_ai.application.component': 'control-suggestion-engine',
        
        // Status
        'gen_ai.status': status,
        'gen_ai.error.type': error ? error.type : null,
        'gen_ai.error.message': error ? error.message : null
      },
      
      // Events (prompt and completion)
      events: [
        {
          name: 'gen_ai.content.prompt',
          timestamp,
          attributes: {
            'gen_ai.prompt': prompt,
            'gen_ai.prompt.length': prompt?.length || 0
          }
        },
        {
          name: 'gen_ai.content.completion',
          timestamp: new Date(Date.now() + (latency || 0)).toISOString(),
          attributes: {
            'gen_ai.completion': response,
            'gen_ai.completion.length': response?.length || 0
          }
        }
      ],
      
      // Additional metadata
      metadata: {
        control_id: metadata.controlId,
        control_family: metadata.controlFamily,
        user_id: metadata.userId,
        session_id: metadata.sessionId,
        request_path: metadata.requestPath,
        ...metadata
      }
    };
    
    // Get current log file (handles rotation)
    const logFile = getCurrentLogFile();
    
    // Append log entry as JSON Lines (JSONL format)
    const logLine = JSON.stringify(logEntry) + '\n';
    fs.appendFileSync(logFile, logLine, 'utf8');
    
    // Console log for monitoring (abbreviated)
    console.log(`[AI-LOG] ${timestamp} | ${provider}:${model} | ${status} | ${latency}ms | Tokens: ${tokenUsage.totalTokens || 0}`);
    
    return { traceId, spanId, logFile };
  } catch (error) {
    console.error('Error logging AI interaction:', error);
    return null;
  }
}

/**
 * Log AI error
 */
export function logAIError({
  provider,
  model,
  operation,
  prompt,
  error,
  metadata = {}
}) {
  return logAIInteraction({
    provider,
    model,
    operation,
    prompt,
    response: null,
    metadata,
    tokenUsage: {},
    latency: 0,
    status: 'error',
    error: {
      type: error.name || 'AIError',
      message: error.message || 'Unknown error'
    }
  });
}

/**
 * Get log statistics
 */
export function getLogStats() {
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith(LOG_FILE_PREFIX) && f.endsWith('.jsonl'))
      .map(f => {
        const filePath = path.join(LOG_DIR, f);
        const stats = fs.statSync(filePath);
        return {
          filename: f,
          size: stats.size,
          sizeFormatted: `${(stats.size / 1024 / 1024).toFixed(2)} MB`,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
      .sort((a, b) => b.modified - a.modified);
    
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    
    return {
      totalFiles: files.length,
      totalSize,
      totalSizeFormatted: `${(totalSize / 1024 / 1024).toFixed(2)} MB`,
      files
    };
  } catch (error) {
    console.error('Error getting log stats:', error);
    return {
      totalFiles: 0,
      totalSize: 0,
      totalSizeFormatted: '0 MB',
      files: []
    };
  }
}

/**
 * Clean up old log files (optional - keep last N days)
 */
export function cleanupOldLogs(daysToKeep = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    const files = fs.readdirSync(LOG_DIR)
      .filter(f => f.startsWith(LOG_FILE_PREFIX) && f.endsWith('.jsonl'));
    
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(LOG_DIR, file);
      const stats = fs.statSync(filePath);
      
      if (stats.mtime < cutoffDate) {
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`Deleted old log file: ${file}`);
      }
    }
    
    return {
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} log files older than ${daysToKeep} days`
    };
  } catch (error) {
    console.error('Error cleaning up old logs:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export default {
  logAIInteraction,
  logAIError,
  getLogStats,
  cleanupOldLogs
};

