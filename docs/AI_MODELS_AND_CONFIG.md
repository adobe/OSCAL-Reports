# AI Models and Configuration

**Unified guide for AI model support (Mistral, Gemma), configuration, token limits, and quick start.**

---

## Table of Contents

- [Overview](#overview)
- [Supported Models](#supported-models)
- [Architecture and Routing](#architecture-and-routing)
- [Configuration](#configuration)
- [Max Tokens Configuration](#max-tokens-configuration)
- [Gemma Quick Start](#gemma-quick-start)
- [Gemma3 Support](#gemma3-support)
- [Mistral vs Gemma Comparison](#mistral-vs-gemma-comparison)
- [Troubleshooting](#troubleshooting)

---

## Overview

The OSCAL Reports application supports multiple AI model families (Mistral, Gemma) for generating control implementation descriptions. An intelligent router (`backend/aiModelRouter.js`) detects the model from configuration and routes to the appropriate service.

---

## Supported Models

### Mistral Family
- **Service**: `backend/mistralService.js`
- **Providers**: Ollama (local), Mistral AI API (cloud), AWS Bedrock
- **Examples**: `mistral:7b`, `mistral:latest`, `mixtral:8x7b`

### Gemma Family
- **Service**: `backend/gemmaService.js`
- **Providers**: Ollama (local), Google AI API (cloud), AWS Bedrock
- **Detection**: Any model name containing "gemma" (e.g., `gemma2`, `gemma3`, `gemma-3-27b-it`)
- **Examples**: `gemma:2b`, `gemma2`, `gemma2:9b`, `gemma2:27b`, `gemma3`

---

## Architecture and Routing

```
Control Suggestion Engine → AI Model Router → Mistral Service / Gemma Service
```

The router uses `aiConfig.model` (and `bedrockModelId` for AWS) to detect the family. No code change is needed to switch models—only configuration.

**API Endpoints:**
- `GET /api/ai/status` – Status for currently configured model (recommended)
- `GET /api/mistral/status` – Mistral-specific
- `GET /api/gemma/status` – Gemma-specific

---

## Configuration

### Ollama (Local)
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

### Google AI API (Cloud)
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

### Mistral API (Cloud)
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

### AWS Bedrock
```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "aws-bedrock",
    "awsRegion": "us-east-1",
    "bedrockModelId": "mistral.mistral-large-2402-v1:0",
    "timeout": 120000
  }
}
```

---

## Max Tokens Configuration

Token limits are configurable in `config/app/config.json` under `aiConfig.maxTokens`:

| Key | Default | Purpose |
|-----|--------|---------|
| `connectionTest` | 10 | AI connectivity test |
| `controlGeneration` | 150 | Control implementation text (~250 chars) |
| `general` | 512 | General AI operations |

**Example:**
```json
{
  "aiConfig": {
    "maxTokens": {
      "connectionTest": 10,
      "controlGeneration": 150,
      "general": 512
    }
  }
}
```

- **Lower values**: Shorter responses, lower cost, faster.
- **Higher values**: More detail; increase only if needed. Restart the app after changes.

---

## Gemma Quick Start

1. **Pull model**: `ollama pull gemma2`
2. **Edit** `config/app/config.json`: set `aiConfig.model` to `"gemma2"` (and `provider` to `"ollama"`).
3. **Restart** the application.
4. **Verify**: `GET /api/ai/status` should show `"modelFamily": "gemma"` and `"available": true`.

Other Gemma variants: `gemma:2b`, `gemma:7b`, `gemma2:9b`, `gemma2:27b`, `gemma3`. Any name containing "gemma" is routed to the Gemma service.

---

## Gemma3 Support

Gemma3 is supported via the same pattern matching: any model name containing `"gemma"` (e.g. `gemma3`, `gemma3:27b`) is routed to the Gemma service. Pull with `ollama pull gemma3` and set `aiConfig.model` to `"gemma3"` (or the variant you use).

---

## Mistral vs Gemma Comparison

| Criterion | Recommendation |
|-----------|----------------|
| **Production balance** | Mistral 7B or Gemma2 9B |
| **Speed** | Gemma 2B (fastest) |
| **Quality** | Gemma2 27B or Mixtral 8x7B |
| **Cost-effective** | Local Ollama with Gemma2 or Mistral 7B |

**Rough performance (100 controls):** Gemma 2B ~1.3 min, Mistral 7B ~2.2 min, Gemma2 27B ~5.3 min. **Resource usage:** Gemma 2B ~2.5 GB RAM; Gemma2 27B ~18.5 GB RAM.

---

## Troubleshooting

- **Model not found**: Run `ollama pull <model>` and confirm with `ollama list`.
- **Wrong service**: Ensure `aiConfig.model` contains "gemma" or "mistral" as expected; restart after config change.
- **API key errors**: Verify key, permissions, and billing (for cloud APIs).
- **Responses cut off**: Increase the relevant `maxTokens` value in `aiConfig`.

---

## Related Documentation

- [AI Architecture and Security](AI_ARCHITECTURE_SECURITY.md)
- [Configuration and User Migration](CONFIG_AND_USER_MIGRATION.md)

---

*Last updated: February 2026*
