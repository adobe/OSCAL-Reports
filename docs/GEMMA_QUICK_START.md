# Gemma Quick Start Guide

## 🎯 Goal
Switch your OSCAL Reports application from Mistral to Gemma models in under 5 minutes.

## ✅ Prerequisites
- OSCAL Reports application is running
- Ollama is installed and running

## 📋 Quick Start Steps

### Step 1: Pull Gemma Model (2 minutes)

```bash
# Pull the Gemma2 model (recommended)
ollama pull gemma2

# Verify it's installed
ollama list | grep gemma
```

**Expected output:**
```
gemma2:latest    ...    4.7 GB    ...
```

### Step 2: Update Configuration (1 minute)

Edit your `config/app/config.json` file and change the model:

**Before:**
```json
{
  "aiConfig": {
    "enabled": true,
    "url": "http://127.0.0.1:11434",
    "provider": "ollama",
    "model": "mistral:7b",    ← Change this line
    "timeout": 180000
  }
}
```

**After:**
```json
{
  "aiConfig": {
    "enabled": true,
    "url": "http://127.0.0.1:11434",
    "provider": "ollama",
    "model": "gemma2",        ← Updated to gemma2
    "timeout": 180000
  }
}
```

### Step 3: Restart Application (30 seconds)

```bash
# Stop your application (Ctrl+C if running in terminal)
# Then restart it
npm start
```

### Step 4: Verify It's Working (1 minute)

**Option A: Check via API**

```bash
curl http://localhost:3020/api/ai/status \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Look for:**
```json
{
  "success": true,
  "modelFamily": "gemma",    ← Should say "gemma"
  "available": true,
  "configuredModel": "gemma2"
}
```

**Option B: Check via UI**

1. Log in to your application
2. Navigate to Settings → AI Integration
3. Look for status showing "Connected" with Gemma model

### Step 5: Test Generation (30 seconds)

1. Navigate to SSP Generation
2. Create a new SSP or open existing one
3. Generate controls
4. Verify implementations are being created

**Success indicators:**
- ✅ Controls have implementation descriptions
- ✅ UI shows "AI Generated" label
- ✅ Console logs show "Routing to Gemma service"

## 🎉 You're Done!

Your application is now using Gemma instead of Mistral for AI-generated control implementations.

## 📊 What Changed?

| Before | After |
|--------|-------|
| Using Mistral 7B | Using Gemma2 |
| Routing to mistralService | Routing to gemmaService |
| `modelFamily: "mistral"` | `modelFamily: "gemma"` |

## 🔍 Verify in Logs

Check your application logs for these messages:

```
🎯 Model family detected: gemma
📍 Routing to Gemma service for control: AC-1
🔗 Attempting to connect to Ollama at: http://127.0.0.1:11434
   Model: gemma2
✅ Successfully received response from Ollama
✅ Successfully generated implementation with AI for control: AC-1
```

## ⚙️ Other Gemma Models

Want to try different Gemma models?

### Gemma 2B (Fastest, Lower Quality)
```json
{ "model": "gemma:2b" }
```

### Gemma 7B (Balanced)
```json
{ "model": "gemma:7b" }
```

### Gemma2 9B (Recommended - Best Balance)
```json
{ "model": "gemma2" }
```

### Gemma2 27B (Highest Quality, Slowest)
```json
{ "model": "gemma2:27b" }
```

### Gemma3 (Latest - Your Choice!)
```json
{ "model": "gemma3" }
```

**Note**: Any model name containing "gemma" will be automatically detected and routed to the Gemma service!

**Don't forget to pull the model first!**
```bash
ollama pull gemma:2b
# or
ollama pull gemma2:27b
```

## 🔄 Switch Back to Mistral

Simply change the model back:

```json
{ "model": "mistral:7b" }
```

And restart. The router automatically detects and switches.

## ❓ Troubleshooting

### "Model gemma2 not found"
```bash
# Solution: Pull the model
ollama pull gemma2
```

### "ECONNREFUSED"
```bash
# Solution: Start Ollama
ollama serve
```

### Still shows "mistral" in logs
```bash
# Solution: 
# 1. Verify config.json has "gemma2" (not "mistral")
# 2. Restart application completely
# 3. Clear browser cache (if using UI)
```

### Slow generation
```bash
# Solution: Use a smaller model
# gemma:2b is much faster than gemma2:27b
```

## 📚 Need More Help?

- **Full Documentation**: `docs/AI_MODEL_SUPPORT.md`
- **Testing Guide**: `docs/GEMMA_TESTING_GUIDE.md`
- **Implementation Details**: `docs/GEMMA_IMPLEMENTATION_SUMMARY.md`

## 🚀 Next Steps

1. ✅ Basic setup (you just did this!)
2. Compare performance between Mistral and Gemma
3. Try different model sizes
4. Explore cloud options (Google AI API)
5. Consider production deployment

---

**Estimated Time**: 5 minutes  
**Difficulty**: Easy  
**Requirements**: Ollama + 5GB disk space
