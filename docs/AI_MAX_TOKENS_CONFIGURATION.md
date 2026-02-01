# AI Max Tokens Configuration

## Overview

The application's AI token limits are now configurable through the `config.json` file. This allows you to adjust response lengths for different AI operations without modifying code.

## Configuration Location

Edit the configuration file directly:
```
config/app/config.json
```

## Configuration Structure

Add or modify the `maxTokens` section within `aiConfig`:

```json
{
  "aiConfig": {
    "enabled": true,
    "url": "http://192.168.1.200:11434",
    "model": "mistral:7b",
    "maxTokens": {
      "connectionTest": 10,
      "controlGeneration": 150,
      "general": 512
    }
  }
}
```

## Token Limit Categories

### 1. connectionTest
**Default: 10 tokens**

Used for testing AI connectivity. Only needs a minimal "OK" response.

**When used:**
- Testing Ollama connection
- Testing Mistral API connection
- Testing AWS Bedrock connection

**Recommendation:** Keep at 10 unless troubleshooting requires more detailed responses.

### 2. controlGeneration
**Default: 150 tokens (~250 characters)**

Used for generating security control implementation descriptions.

**When used:**
- Generating control implementations via Ollama
- Generating control implementations via Mistral API
- Generating control implementations via AWS Bedrock

**Tuning guidance:**
- **Lower (100-120)**: Shorter, more concise descriptions
- **Default (150)**: Balanced length, professional tone
- **Higher (200-300)**: More detailed explanations

**Cost impact:**
- Lower values = faster responses, lower API costs
- Higher values = more detailed but slower, higher costs

### 3. general
**Default: 512 tokens**

Used for general AI operations and queries that need more detail.

**When used:**
- AWS Bedrock general operations
- Complex queries requiring detailed responses
- Future AI features

**Tuning guidance:**
- **Lower (256-384)**: Faster responses, lower costs
- **Default (512)**: Standard detailed responses
- **Higher (1024-2048)**: Very detailed responses (increases costs significantly)

## Default Values

If not specified in `config.json`, the application uses these defaults:

```javascript
{
  connectionTest: 10,
  controlGeneration: 150,
  general: 512
}
```

## How to Customize

### Method 1: Edit config.json Directly

1. Stop the application (if running)

2. Edit the config file:
   ```bash
   nano config/app/config.json
   ```

3. Add or modify the `maxTokens` section:
   ```json
   {
     "aiConfig": {
       "maxTokens": {
         "connectionTest": 10,
         "controlGeneration": 200,
         "general": 768
       }
     }
   }
   ```

4. Save and restart the application

### Method 2: Docker Volume Mount

If running in Docker, the config is persisted in a volume:

```bash
# Find the config volume
docker volume inspect oscal_config

# Edit the config file in the volume
docker exec oscal-report-generator nano /app/config/app/config.json

# Restart container to apply changes
docker restart oscal-report-generator
```

### Method 3: Environment-Specific Configs

For different environments, you can maintain separate config files:

```bash
config/app/config.development.json  # Higher token limits for testing
config/app/config.production.json   # Optimized for cost
```

## Examples

### Example 1: Cost-Optimized Configuration

Minimize AI API costs with shorter responses:

```json
{
  "aiConfig": {
    "maxTokens": {
      "connectionTest": 5,
      "controlGeneration": 100,
      "general": 256
    }
  }
}
```

**Benefits:**
- 33% cost reduction on control generation
- 50% cost reduction on general operations
- Faster response times

**Trade-offs:**
- Less detailed control descriptions
- May need manual editing for completeness

### Example 2: Detailed Descriptions

Generate more comprehensive control implementations:

```json
{
  "aiConfig": {
    "maxTokens": {
      "connectionTest": 10,
      "controlGeneration": 300,
      "general": 1024
    }
  }
}
```

**Benefits:**
- More detailed, comprehensive descriptions
- Better context and examples
- Less manual editing required

**Trade-offs:**
- 2x higher API costs
- Slower response times
- May generate overly verbose text

### Example 3: Development/Testing

For development environments where cost is less critical:

```json
{
  "aiConfig": {
    "maxTokens": {
      "connectionTest": 50,
      "controlGeneration": 250,
      "general": 2048
    }
  }
}
```

## Verification

After changing the configuration, verify it's loaded correctly:

### Check Config File
```bash
cat config/app/config.json | jq '.aiConfig.maxTokens'
```

Expected output:
```json
{
  "connectionTest": 10,
  "controlGeneration": 150,
  "general": 512
}
```

### Check Application Logs

When the application starts, you'll see the loaded configuration:
```
✅ Configuration loaded successfully from /app/config/app/config.json
```

### Test with Connection Check

Use the AI connection test to verify the limits are applied:
1. Navigate to Settings → AI Configuration
2. Click "Test Connection"
3. Check the response - it should be limited to `connectionTest` tokens

## Token Cost Estimates

Based on typical AI provider pricing:

| Configuration | Control Generation Cost* | Daily Cost (100 controls) |
|---------------|-------------------------|---------------------------|
| Cost-Optimized (100 tokens) | $0.0001 | $0.01 |
| Default (150 tokens) | $0.00015 | $0.015 |
| Detailed (300 tokens) | $0.0003 | $0.03 |

*Estimates based on Mistral API pricing (~$0.001 per 1K tokens)

## Troubleshooting

### Changes Not Applied

**Problem:** Modified `maxTokens` but seeing old values

**Solution:**
1. Verify the config file was saved correctly
2. Restart the application
3. Check for syntax errors in JSON:
   ```bash
   jq '.' config/app/config.json
   ```

### Incomplete Responses

**Problem:** AI responses are being cut off

**Solution:**
1. Increase the relevant `maxTokens` value
2. For control generation: increase `controlGeneration`
3. For general queries: increase `general`

### High API Costs

**Problem:** Unexpectedly high AI API bills

**Solution:**
1. Reduce `maxTokens` values
2. Monitor token usage in logs
3. Consider using local Ollama instead of cloud APIs

## Best Practices

### 1. Start Conservative
Begin with default or lower values and increase only if needed.

### 2. Monitor Usage
Track actual token usage in AI logs:
```bash
tail -f /var/log/oscal/ai-telemetry.log
```

### 3. Environment-Specific Settings
Use different settings for:
- **Development:** Higher limits for testing
- **Production:** Optimized for cost and performance

### 4. Regular Review
Periodically review generated content quality and adjust limits accordingly.

### 5. Cost vs Quality Balance
Find the sweet spot for your use case:
- Compliance documentation often benefits from detailed responses
- Internal use can use shorter, cost-effective responses

## Related Configuration

### AI Provider Settings

The `maxTokens` configuration works with all AI providers:

**Ollama (local):**
```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "ollama",
    "url": "http://192.168.1.200:11434",
    "model": "mistral:7b",
    "maxTokens": { ... }
  }
}
```

**Mistral API (cloud):**
```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "mistral-api",
    "url": "https://api.mistral.ai/v1/chat/completions",
    "apiToken": "your-api-key",
    "maxTokens": { ... }
  }
}
```

**AWS Bedrock:**
```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "aws-bedrock",
    "awsRegion": "us-east-1",
    "bedrockModelId": "mistral.mistral-large-2402-v1:0",
    "maxTokens": { ... }
  }
}
```

## Version History

- **v1.6.7** - Made `maxTokens` configurable (previously hardcoded)
- **v1.6.6** - Hardcoded values: connectionTest=10, controlGeneration=150, general=512

## Related Documentation

- [AI Configuration Guide](./AI_ARCHITECTURE_SECURITY.md)
- [Configuration Migration Guide](./CONFIG_MIGRATION_GUIDE.md)
- [AWS Bedrock Setup](./AWS_BEDROCK_SETUP.md)

---

**Last Updated:** January 29, 2026  
**Version:** 1.6.7  
**Maintained by:** Mukesh Kesharwani
