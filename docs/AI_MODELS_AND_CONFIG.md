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

The OSCAL Reports application supports multiple AI model families (Mistral, Gemma) and **cloud backends**: **AWS Bedrock**, **Mistral API**, and **Google AI**. An intelligent router (`backend/aiModelRouter.js`) detects the model and provider from configuration and routes to the appropriate service (e.g. Bedrock, `mistralService`, `gemmaService`). **Ollama (self-hosted) has been removed**; use Bedrock or Mistral API for AI suggestions.

---

## Supported Models

### Mistral Family
- **Service**: `backend/mistralService.js`
- **Providers**: **AWS Bedrock**, **Mistral AI API** (cloud)
- **Examples**: Bedrock model IDs (e.g. `mistral.mistral-large-2402-v1:0`); Mistral API model names

### Gemma Family
- **Service**: `backend/gemmaService.js`; **Bedrock**: `backend/bedrockGemmaService.js`
- **Providers**: **AWS Bedrock**, **Google AI API** (cloud)
- **Detection**: Any model name containing "gemma" (e.g., `gemma2`, `gemma3`, `gemma-3-27b-it`)
- **Examples**: Bedrock Gemma model IDs; Google AI model names

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

### AWS Bedrock (recommended for production)
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
See `docs/AWS_BEDROCK_SETUP.md` for IAM and setup.

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

**Ollama (self-hosted) has been removed.** Use **AWS Bedrock** or **Mistral API** (see Quick Start above and [AWS_BEDROCK_SETUP.md](AWS_BEDROCK_SETUP.md)).

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

## Quick Start by Provider

**AWS Bedrock (production):** Configure IAM and region (see `docs/AWS_BEDROCK_SETUP.md`), set `provider` to `"aws-bedrock"` and `bedrockModelId` to your chosen model (e.g. `mistral.mistral-large-2402-v1:0` or a Gemma model ID). Restart and verify with `GET /api/ai/status`.

**Mistral or Google AI (cloud):** Set `provider` to `"mistral-api"` or `"google-ai"`, add `apiToken` and `model`. Restart and verify with `GET /api/ai/status`.

**Ollama is no longer supported.** Use **AWS Bedrock** or **Mistral API** for Gemma/Mistral models (see AWS_BEDROCK_SETUP.md and config above).

---

## Gemma3 Support

Gemma3 is supported via the same pattern matching: any model name containing `"gemma"` (e.g. `gemma3`, `gemma3:27b`) is routed to the Gemma service. On **Bedrock** or **Google AI**, use the appropriate Gemma model ID or name in config.

---

## Mistral vs Gemma Comparison

| Criterion | Recommendation |
|-----------|----------------|
| **Production balance** | AWS Bedrock (Mistral/Gemma) or Mistral 7B / Gemma2 9B |
| **Speed** | Gemma 2B (fastest); Bedrock or cloud for managed scaling |
| **Quality** | Gemma2 27B or Mixtral 8x7B (Ollama or Bedrock) |
| **Cost-effective** | Bedrock pay-per-use; or local Ollama with Gemma2 / Mistral 7B |

**Rough performance (100 controls):** Gemma 2B ~1.3 min, Mistral 7B ~2.2 min, Gemma2 27B ~5.3 min. **Resource usage:** Gemma 2B ~2.5 GB RAM; Gemma2 27B ~18.5 GB RAM.

---

## Troubleshooting

- **Ollama – model not found**: Run `ollama pull <model>` and confirm with `ollama list`.
- **Bedrock – access denied**: Check IAM role or credentials; region and `bedrockModelId`; see `docs/AWS_BEDROCK_SETUP.md`.
- **Wrong service**: Ensure `aiConfig.model` (and `bedrockModelId` for Bedrock) matches the intended family (gemma vs mistral); restart after config change.
- **API key errors (Mistral/Google)**: Verify key, permissions, and billing.
- **Responses cut off**: Increase the relevant `maxTokens` value in `aiConfig`.

---

## Related Documentation

- [AI Architecture and Security](AI_ARCHITECTURE_SECURITY.md)
- [Configuration and User Migration](CONFIG_AND_USER_MIGRATION.md)

---

*Last updated: March 2026*
