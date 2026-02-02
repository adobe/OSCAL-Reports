# AI Model Support

This document describes the AI model support in the OSCAL Reports application, including architecture, supported models, and configuration.

## Overview

The OSCAL Reports application supports multiple AI model families for generating control implementation descriptions. The system automatically routes requests to the appropriate service based on the configured model.

## Supported Model Families

### 1. Mistral Models
- **Models**: Mistral 7B, Mistral Large, Mixtral, and variants
- **Service**: `backend/mistralService.js`
- **Providers**:
  - Ollama (local)
  - Mistral AI API (cloud)
  - AWS Bedrock

### 2. Gemma Models
- **Models**: Gemma, Gemma2, Gemma3, and all variants
- **Service**: `backend/gemmaService.js`
- **Detection**: Any model name containing "gemma" (e.g., gemma3, gemma-3-27b-it)
- **Providers**:
  - Ollama (local)
  - Google AI API (cloud)
  - AWS Bedrock

## Architecture

### Model Routing

The application uses an intelligent router (`backend/aiModelRouter.js`) that automatically detects the model family based on configuration and routes requests to the appropriate service.

```
┌─────────────────────────────────────┐
│  Control Suggestion Engine          │
│  (controlSuggestionEngine.js)       │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  AI Model Router                    │
│  (aiModelRouter.js)                 │
│  - Detects model family             │
│  - Routes to appropriate service    │
└──────────┬──────────────────────────┘
           │
           ├──────────────┬─────────────┐
           ▼              ▼             ▼
    ┌──────────┐   ┌──────────┐  ┌──────────┐
    │ Mistral  │   │  Gemma   │  │ Future   │
    │ Service  │   │ Service  │  │ Models   │
    └──────────┘   └──────────┘  └──────────┘
```

### Model Detection

The router automatically detects the model family by analyzing:
1. `aiConfig.model` field in configuration
2. `aiConfig.bedrockModelId` for AWS Bedrock deployments
3. Model name patterns (e.g., "gemma2", "mistral:7b", "gemma-2-9b-it")

## Configuration

### Gemma Models via Ollama (Local)

```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "ollama",
    "url": "http://localhost:11434",
    "model": "gemma2",
    "timeout": 120000
  }
}
```

**Available Gemma Models on Ollama:**
- `gemma:2b` - Gemma 2B (lightweight)
- `gemma:7b` - Gemma 7B
- `gemma2` - Gemma 2 (latest)
- `gemma2:9b` - Gemma 2 9B
- `gemma2:27b` - Gemma 2 27B
- `gemma3` - Gemma 3 (if available)
- Any Gemma variant - automatically detected

**Installation:**
```bash
# Pull a Gemma model
ollama pull gemma2

# Or pull a specific version
ollama pull gemma2:9b
```

### Gemma Models via Google AI API (Cloud)

```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "google-ai",
    "model": "gemma-2-9b-it",
    "apiToken": "your-google-ai-api-key",
    "timeout": 120000
  }
}
```

**Available Models:**
- `gemma-2-9b-it` - Gemma 2 9B Instruct
- `gemma-2-27b-it` - Gemma 2 27B Instruct

**Getting API Key:**
1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create an API key
3. Add to configuration

### Mistral Models via Ollama (Local)

```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "ollama",
    "url": "http://localhost:11434",
    "model": "mistral:7b",
    "timeout": 120000
  }
}
```

**Available Mistral Models on Ollama:**
- `mistral:7b` - Mistral 7B
- `mistral:latest` - Latest Mistral version
- `mixtral:8x7b` - Mixtral 8x7B (mixture of experts)

### Mistral Models via Mistral AI API (Cloud)

```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "mistral-api",
    "url": "https://api.mistral.ai/v1/chat/completions",
    "model": "mistral-small-latest",
    "apiToken": "your-mistral-api-key",
    "timeout": 120000
  }
}
```

### AWS Bedrock (Both Mistral and Gemma)

```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "aws-bedrock",
    "awsRegion": "us-east-1",
    "awsAccessKeyId": "your-access-key",
    "awsSecretAccessKey": "your-secret-key",
    "bedrockModelId": "mistral.mistral-large-2402-v1:0",
    "timeout": 120000
  }
}
```

**Available Bedrock Models:**
- Mistral: `mistral.mistral-large-2402-v1:0`, `mistral.mistral-7b-instruct-v0:2`
- Check AWS Bedrock console for available models in your region

## API Endpoints

### Generic AI Status (Recommended)
```
GET /api/ai/status
```
Returns status of the currently configured AI model (automatically routed).

**Response:**
```json
{
  "success": true,
  "modelFamily": "gemma",
  "available": true,
  "provider": "ollama",
  "ollamaUrl": "http://localhost:11434",
  "models": ["gemma2", "mistral:7b"],
  "configuredModel": "gemma2",
  "reason": "Available"
}
```

### Model-Specific Status Endpoints

**Mistral Status:**
```
GET /api/mistral/status
```

**Gemma Status:**
```
GET /api/gemma/status
```

## Adding New Model Families

To add support for a new model family (e.g., Llama, Claude, GPT):

1. **Create Service File**: Create `backend/newModelService.js` based on `gemmaService.js` or `mistralService.js`

2. **Update Router**: Add detection logic and routing in `backend/aiModelRouter.js`:
   ```javascript
   // In detectModelFamily()
   if (model.includes('llama')) {
     return 'llama';
   }
   
   // In generateImplementationWithAI()
   case 'llama':
     return await generateImplementationWithLlama(control, fallbackGenerator, existingControls);
   ```

3. **Add Endpoints**: Add status endpoint in `backend/server.js`

4. **Update Documentation**: Add configuration examples and model details

## Model Selection Guidelines

### When to Use Gemma
- **Lightweight deployments**: Gemma 2B for resource-constrained environments
- **Local inference**: Good performance on consumer hardware
- **Google ecosystem**: When using Google Cloud or Google AI services
- **Cost-sensitive**: Free for local deployment via Ollama

### When to Use Mistral
- **Production deployments**: Proven performance and reliability
- **Complex controls**: Mistral Large for detailed implementations
- **Cloud services**: Mature API with good documentation
- **Multilingual**: Better support for non-English content

### Performance Comparison

| Model | Size | Speed | Quality | Resource Usage |
|-------|------|-------|---------|----------------|
| Gemma 2B | 2B | Fast | Good | Low |
| Gemma 7B | 7B | Medium | Very Good | Medium |
| Gemma2 9B | 9B | Medium | Excellent | Medium |
| Mistral 7B | 7B | Medium | Very Good | Medium |
| Mixtral 8x7B | 8x7B | Slow | Excellent | High |

## Troubleshooting

### Model Not Found

**Error**: `Model gemma2 not found`

**Solution**:
```bash
# Pull the model
ollama pull gemma2

# Verify it's installed
ollama list
```

### Wrong Service Being Used

**Symptom**: Logs show "Routing to Mistral service" but you configured Gemma

**Solution**:
1. Check `aiConfig.model` in `config/app/config.json`
2. Ensure model name contains "gemma" (e.g., "gemma2", not "gem2")
3. Restart the application to reload configuration

### API Key Issues

**Error**: `Invalid Google AI API key`

**Solution**:
1. Verify API key is correct
2. Check API key has necessary permissions
3. Ensure billing is enabled (for cloud APIs)

### Model Switching

To switch between models:

1. **Via Settings UI**:
   - Navigate to Settings → AI Integration
   - Change model in dropdown
   - Click Save Configuration

2. **Via Configuration File**:
   - Edit `config/app/config.json`
   - Update `aiConfig.model` field
   - Restart application

## Testing

### Test Gemma Integration

```bash
# 1. Start Ollama and pull Gemma
ollama pull gemma2

# 2. Configure the application
# Edit config/app/config.json:
{
  "aiConfig": {
    "enabled": true,
    "provider": "ollama",
    "url": "http://localhost:11434",
    "model": "gemma2"
  }
}

# 3. Restart application and check status
curl -X GET http://localhost:3020/api/ai/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Test control generation
# Generate a control through the UI and verify:
# - Implementation description is generated
# - Logs show "Routing to Gemma service"
# - Source indicator shows "AI Generated"
```

## Future Enhancements

- [ ] Support for Llama models
- [ ] Support for Claude (Anthropic)
- [ ] Support for OpenAI GPT models
- [ ] Model performance metrics and comparison
- [ ] Automatic model selection based on control complexity
- [ ] Model ensemble (use multiple models and combine results)
- [ ] Fine-tuning support for custom OSCAL models

## References

- [Mistral AI Documentation](https://docs.mistral.ai/)
- [Google Gemma Documentation](https://ai.google.dev/gemma)
- [Ollama Documentation](https://github.com/ollama/ollama)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)

---

**Last Updated**: 2025-02-03
**Authors**: Mukesh Kesharwani
