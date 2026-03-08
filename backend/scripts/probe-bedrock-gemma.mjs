#!/usr/bin/env node
/**
 * Probe Bedrock Converse API for Gemma: log raw response shape (content blocks).
 * Uses getResolvedConfig(), reads sample prompt from telemetry JSONL if available,
 * calls Converse with same params as app, logs response.output / content block keys.
 *
 * Run from repo root: node backend/scripts/probe-bedrock-gemma.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function loadTelemetryPrompt() {
  const telemetryPath = path.join(REPO_ROOT, 'logs', 'ai-telemetry-2026-03-07.jsonl');
  if (!fs.existsSync(telemetryPath)) {
    return null;
  }
  const lines = fs.readFileSync(telemetryPath, 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const model = entry.attributes?.['gen_ai.request.model'] || '';
      if (!model.includes('gemma')) continue;
      const events = entry.events || [];
      const promptEvent = events.find((e) => e.name === 'gen_ai.content.prompt');
      const prompt = promptEvent?.attributes?.['gen_ai.prompt'];
      if (typeof prompt === 'string' && prompt.length > 0) {
        return { prompt, model };
      }
    } catch (_) {
      // skip malformed lines
    }
  }
  return null;
}

const FALLBACK_PROMPT = `Generate a professional implementation description for the following security control:

Control ID: ac-1
Control Title: Access Control
Control Family: ac

Control Description:
Organizations must limit information system access to authorized users.

Respond with ONLY a valid JSON object, no other text:
{
  "implementation": "2-3 sentences, 250 chars or less, describing what has been implemented.",
  "testingObjective": "One sentence: the objective of assessing this control.",
  "testingProcedure": "One sentence: how this control is tested.",
  "remarks": "Optional brief notes or empty string."
}`;

async function main() {
  // Load resolved config (same as app: config/app/config.json + pass resolution)
  const { getResolvedConfig } = await import('../configManager.js');
  const config = getResolvedConfig();

  const ai = config?.aiConfig || {};
  if (!ai.enabled) {
    console.warn('⚠️ AI config not enabled. Using fallback prompt and default model/region.');
  }

  const modelId = (ai.bedrockModelId || '').trim() || 'google.gemma-3-4b-it';
  const region = ai.awsRegion || 'us-east-1';
  const awsAccessKeyId = ai.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID || '';
  const awsSecretAccessKey = ai.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY || '';

  let prompt = FALLBACK_PROMPT;
  const fromTelemetry = loadTelemetryPrompt();
  if (fromTelemetry?.prompt) {
    prompt = fromTelemetry.prompt;
    console.log('Using prompt from telemetry (model in log: %s), length: %d', fromTelemetry.model, prompt.length);
  } else {
    console.log('Using fallback prompt (no Gemma prompt found in telemetry), length: %d', prompt.length);
  }

  if (!awsAccessKeyId || !awsSecretAccessKey) {
    console.error('Missing AWS credentials. Set aiConfig.awsAccessKeyId/awsSecretAccessKey (or pass) or AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY.');
    process.exit(1);
  }

  const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const { NodeHttpHandler } = await import('@smithy/node-http-handler');
  const https = await import('https');
  const httpsAgent = new https.default.Agent({
    rejectUnauthorized: process.env.NODE_ENV === 'production',
    keepAlive: true
  });

  const client = new BedrockRuntimeClient({
    region,
    credentials: { accessKeyId: awsAccessKeyId, secretAccessKey: awsSecretAccessKey },
    requestHandler: new NodeHttpHandler({
      httpsAgent,
      connectionTimeout: 30000,
      socketTimeout: 120000
    })
  });

  const command = new ConverseCommand({
    modelId,
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: {
      maxTokens: 512,
      temperature: 0.7,
      topP: 0.9
    }
  });

  console.log('Calling Bedrock Converse: model=%s region=%s', modelId, region);
  const response = await client.send(command);

  // Full output (redact if needed; structure is what we need)
  const output = response.output || {};
  console.log('\n--- response.output (full) ---');
  console.log(JSON.stringify(output, null, 2));

  const content = output.message?.content;
  if (content && Array.isArray(content)) {
    console.log('\n--- content blocks: keys and sample values ---');
    content.forEach((block, i) => {
      if (!block || typeof block !== 'object') {
        console.log('  [%d] (non-object):', i, block);
        return;
      }
      const keys = Object.keys(block);
      console.log('  [%d] keys: %s', i, keys.join(', '));
      for (const k of keys) {
        const v = block[k];
        if (typeof v === 'string') {
          const sample = v.length > 200 ? v.slice(0, 200) + '...' : v;
          console.log('      %s (string, len=%d): %s', k, v.length, JSON.stringify(sample));
        } else if (v && typeof v === 'object') {
          console.log('      %s (object): %s', k, JSON.stringify(v).slice(0, 300));
        } else {
          console.log('      %s: %s', k, v);
        }
      }
    });
  } else {
    console.log('\n--- no response.output.message.content (or not array) ---');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
