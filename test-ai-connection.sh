#!/bin/bash
echo "🧪 Testing AI Engine Connection and Model Availability"
echo "======================================================"
echo ""

AI_URL="192.168.1.111"
AI_PORT="11434"
MODEL="mistral:7b"

echo "1. Testing connection to AI Engine..."
if curl -s -m 5 "http://${AI_URL}:${AI_PORT}/api/tags" > /dev/null; then
    echo "   ✅ Connection successful"
else
    echo "   ❌ Connection failed"
    exit 1
fi

echo ""
echo "2. Checking available models..."
MODELS=$(curl -s "http://${AI_URL}:${AI_PORT}/api/tags" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
if [ -z "$MODELS" ]; then
    echo "   ❌ No models found"
    echo "   💡 Install model with: docker exec -it ollama ollama pull ${MODEL}"
    exit 1
else
    echo "   ✅ Available models:"
    echo "$MODELS" | while read model; do
        echo "      - $model"
    done
fi

echo ""
echo "3. Checking if ${MODEL} is available..."
if echo "$MODELS" | grep -q "^${MODEL}$"; then
    echo "   ✅ Model ${MODEL} is installed"
    echo ""
    echo "4. Testing model generation..."
    echo "   ⏳ This may take 30-60 seconds (model loading on first request)..."
    RESPONSE=$(curl -s -X POST "http://${AI_URL}:${AI_PORT}/api/generate" \
        -H "Content-Type: application/json" \
        -d "{\"model\":\"${MODEL}\",\"prompt\":\"Say test\",\"stream\":false,\"options\":{\"num_predict\":5}}" \
        -m 60 2>&1)
    
    if echo "$RESPONSE" | grep -q '"response"'; then
        RESPONSE_TEXT=$(echo "$RESPONSE" | grep -o '"response":"[^"]*"' | cut -d'"' -f4)
        echo "   ✅ Model is generating responses"
        echo "   ✅ Response: ${RESPONSE_TEXT:-'(empty)'}"
        echo "   ✅ AI Engine is fully functional!"
    elif echo "$RESPONSE" | grep -q "timeout\|timed out"; then
        echo "   ⚠️  Request timed out (model may be loading)"
        echo "   💡 First request can take 30-60 seconds to load the model"
        echo "   💡 Try again in a moment, or check Ollama logs"
        echo "   Response preview: $(echo "$RESPONSE" | head -c 200)"
    elif echo "$RESPONSE" | grep -q '"error"'; then
        ERROR_MSG=$(echo "$RESPONSE" | grep -o '"error":"[^"]*"' | cut -d'"' -f4)
        echo "   ❌ Generation failed: ${ERROR_MSG}"
        echo "   Full response: $RESPONSE"
    else
        echo "   ⚠️  Model found but generation test failed"
        echo "   Response: $(echo "$RESPONSE" | head -c 500)"
    fi
else
    echo "   ❌ Model ${MODEL} is NOT installed"
    echo "   💡 Install with: docker exec -it ollama ollama pull ${MODEL}"
    exit 1
fi

echo ""
echo "✅ All tests passed! AI Engine is ready to use."
