# Gemma Integration Testing Guide

This guide provides step-by-step instructions for testing the new Gemma model support in OSCAL Reports.

## What Was Added

### New Files Created

1. **`backend/gemmaService.js`** - Service for Gemma model integration
   - Supports Ollama (local)
   - Supports Google AI API (cloud)
   - Supports AWS Bedrock
   - Similar architecture to mistralService.js

2. **`backend/aiModelRouter.js`** - Intelligent routing service
   - Detects model family from configuration
   - Routes to appropriate service (Mistral or Gemma)
   - Provides unified API for control generation
   - Extensible for future model families

3. **`docs/AI_MODEL_SUPPORT.md`** - Comprehensive documentation
   - Configuration examples for all models
   - Architecture overview
   - Troubleshooting guide

### Files Modified

1. **`backend/controlSuggestionEngine.js`**
   - Now uses `aiModelRouter` instead of directly calling `mistralService`
   - Variable names updated (mistralUsed → aiUsed, etc.)
   - Supports automatic routing to correct model service

2. **`backend/server.js`**
   - Added `/api/ai/status` - Generic AI status endpoint (recommended)
   - Added `/api/gemma/status` - Gemma-specific status endpoint
   - Imported gemmaService and aiModelRouter
   - Kept `/api/mistral/status` for backward compatibility

## Prerequisites

- Node.js and npm installed
- OSCAL Reports application running
- Ollama installed (for local testing)
- OR Google AI API key (for cloud testing)

## Testing Plan

### Test 1: Local Gemma with Ollama

#### Step 1: Install Gemma Model

```bash
# Pull Gemma2 model (recommended)
ollama pull gemma2

# Verify installation
ollama list | grep gemma

# Expected output:
# gemma2:latest    ...    4.7 GB    ...
```

#### Step 2: Configure Application

Edit `config/app/config.json`:

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

#### Step 3: Restart Application

```bash
# Stop the application
# Then restart it
npm start
```

#### Step 4: Check AI Status

**Via API:**
```bash
# Replace YOUR_TOKEN with your actual auth token
curl -X GET http://localhost:3020/api/ai/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "modelFamily": "gemma",
  "available": true,
  "provider": "ollama",
  "ollamaUrl": "http://localhost:11434",
  "models": ["gemma2:latest", "..."],
  "configuredModel": "gemma2",
  "reason": "Available"
}
```

**Via UI:**
- Log in to the application
- Navigate to Settings → AI Integration
- You should see the Gemma model listed and status showing "Connected"

#### Step 5: Test Control Generation

1. Navigate to SSP Generation page
2. Select a catalog (e.g., NIST 800-53)
3. Generate controls for an SSP
4. Observe the implementation descriptions being generated

**Expected Behavior:**
- Implementation descriptions are generated successfully
- UI shows "AI Generated" label on controls
- Descriptions are unique and contextual (not template-based)

#### Step 6: Verify Logs

Check the application logs for:

```
🎯 Model family detected: gemma
📍 Routing to Gemma service for control: AC-1
🔗 Attempting to connect to Ollama at: http://localhost:11434
   Model: gemma2
✅ Successfully received response from Ollama (XXX chars)
✅ Successfully generated implementation with AI for control: AC-1
```

**❌ If you see errors:**
- `Model gemma2 not found` → Run `ollama pull gemma2`
- `ECONNREFUSED` → Ensure Ollama is running
- `timeout` → Increase timeout in config or reduce model size

### Test 2: Cloud Gemma with Google AI API

#### Step 1: Get Google AI API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with Google account
3. Click "Create API Key"
4. Copy the API key

#### Step 2: Configure Application

Edit `config/app/config.json`:

```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "google-ai",
    "model": "gemma-2-9b-it",
    "apiToken": "YOUR_GOOGLE_AI_API_KEY_HERE",
    "timeout": 120000
  }
}
```

#### Step 3: Restart and Test

Follow steps 3-6 from Test 1 above.

**Expected Log Output:**
```
🎯 Model family detected: gemma
📍 Routing to Gemma service for control: AC-1
✅ Successfully generated implementation with google-ai (attempt 1)
```

### Test 3: Model Switching (Gemma ↔ Mistral)

#### Step 1: Start with Gemma

Configure as in Test 1, generate some controls.

#### Step 2: Switch to Mistral

Edit `config/app/config.json`:

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

#### Step 3: Restart Application

```bash
npm start
```

#### Step 4: Verify Model Detection

```bash
curl -X GET http://localhost:3020/api/ai/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "modelFamily": "mistral",  // Changed from "gemma"
  "available": true,
  "provider": "ollama"
}
```

#### Step 5: Generate Controls

Generate new controls and verify:
- Logs show "Routing to Mistral service"
- Controls are still generated successfully

### Test 4: Fallback Mechanism

#### Step 1: Configure Gemma (Intentionally Wrong)

Edit `config/app/config.json`:

```json
{
  "aiConfig": {
    "enabled": true,
    "provider": "ollama",
    "url": "http://localhost:11434",
    "model": "gemma-nonexistent",  // Model that doesn't exist
    "timeout": 120000
  }
}
```

#### Step 2: Generate Controls

Generate controls through the UI.

**Expected Behavior:**
- Controls are still generated (using fallback)
- UI shows "Template/Pattern (AI Unavailable)" label
- Logs show fallback warnings

**Log Example:**
```
🎯 Model family detected: gemma
📍 Routing to Gemma service for control: AC-1
⚠️ ollama generation attempt 1 failed: Model gemma-nonexistent not found
⚠️ All AI providers failed, using pattern matching fallback
```

### Test 5: Multiple Model Sizes

Test different Gemma model sizes to compare performance:

#### Gemma 2B (Fastest, Lower Quality)

```json
{ "model": "gemma:2b" }
```

#### Gemma 7B (Balanced)

```json
{ "model": "gemma:7b" }
```

#### Gemma2 9B (Best Quality)

```json
{ "model": "gemma2:9b" }
```

**Performance Comparison:**
- Generate 10 controls with each model
- Measure average generation time
- Compare quality of implementation descriptions

## Verification Checklist

After testing, verify:

- [ ] Gemma models are detected correctly (`modelFamily: "gemma"`)
- [ ] Mistral models still work (`modelFamily: "mistral"`)
- [ ] Model switching works without errors
- [ ] Fallback to templates works when AI fails
- [ ] Logs show correct routing decisions
- [ ] UI displays appropriate status indicators
- [ ] Implementation descriptions are unique and contextual
- [ ] No linter errors in new/modified files
- [ ] API endpoints respond correctly:
  - [ ] `/api/ai/status` works
  - [ ] `/api/gemma/status` works
  - [ ] `/api/mistral/status` still works

## Common Issues and Solutions

### Issue: "Model family detected: mistral" when Gemma is configured

**Cause**: Model name doesn't contain "gemma"

**Solution**: Ensure model name includes "gemma" (e.g., "gemma2", "gemma:7b", "gemma-2-9b-it")

### Issue: Slow Generation with Large Models

**Cause**: Large models (27B, Mixtral) require more resources

**Solution**: 
- Use smaller models (2B, 7B)
- Increase timeout in configuration
- Ensure sufficient RAM/GPU resources

### Issue: "ECONNREFUSED" Error

**Cause**: Ollama service not running

**Solution**:
```bash
# Check if Ollama is running
ps aux | grep ollama

# Start Ollama if not running
ollama serve
```

### Issue: Google AI API Rate Limiting

**Cause**: Too many requests to Google AI API

**Solution**:
- Reduce concurrent control generation
- Implement request queuing
- Consider local Ollama deployment

## Performance Metrics

After testing, document:

| Metric | Gemma 2B | Gemma 7B | Gemma2 9B | Mistral 7B |
|--------|----------|----------|-----------|------------|
| Avg. Generation Time | ___s | ___s | ___s | ___s |
| Quality Score (1-10) | ___ | ___ | ___ | ___ |
| Memory Usage | ___MB | ___MB | ___MB | ___MB |
| Errors/100 Requests | ___ | ___ | ___ | ___ |

## Next Steps

After successful testing:

1. **Production Deployment**
   - Choose optimal model based on performance metrics
   - Configure production environment
   - Set up monitoring and alerting

2. **Documentation Updates**
   - Update main README with Gemma support
   - Add examples to user documentation
   - Create video tutorial (optional)

3. **Future Enhancements**
   - Add more model families (Llama, Claude, etc.)
   - Implement model ensemble
   - Add performance analytics dashboard

## Support

If you encounter issues during testing:

1. Check logs in application console
2. Review `docs/AI_MODEL_SUPPORT.md` for configuration details
3. Verify Ollama installation: `ollama --version`
4. Check Ollama models: `ollama list`
5. Test Ollama directly: `ollama run gemma2 "Hello"`

---

**Testing Date**: _____________
**Tester**: _____________
**Version**: 1.0.0
**Status**: ☐ Passed  ☐ Failed  ☐ Needs Review
