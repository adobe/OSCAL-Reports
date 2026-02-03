#!/bin/bash

# Script to convert Mermaid diagrams to PNG
# Usage: ./convert-to-png.sh

echo "🎨 Converting Mermaid Diagrams to PNG..."
echo ""

# Check if mermaid-cli is installed
if ! command -v mmdc &> /dev/null; then
    echo "⚠️  mermaid-cli not found. Installing..."
    npm install -g @mermaid-js/mermaid-cli
    
    echo "📦 Installing Chromium for rendering..."
    npx playwright install chromium
fi

# Convert architecture diagram
echo "📊 Converting architecture diagram..."
mmdc -i aws-auto-scaling-architecture.mmd \
     -o aws-auto-scaling-architecture.png \
     -w 1920 \
     -H 1080 \
     -b white \
     -t default

if [ $? -eq 0 ]; then
    echo "✅ Architecture diagram created: aws-auto-scaling-architecture.png"
else
    echo "❌ Failed to convert architecture diagram"
fi

# Convert workflow timeline
echo "📊 Converting workflow timeline..."
mmdc -i workflow-timeline.mmd \
     -o workflow-timeline.png \
     -w 1920 \
     -H 1200 \
     -b white \
     -t default

if [ $? -eq 0 ]; then
    echo "✅ Workflow timeline created: workflow-timeline.png"
else
    echo "❌ Failed to convert workflow timeline"
fi

echo ""
echo "🎉 Done! Your diagrams are ready for email:"
echo "   📄 aws-auto-scaling-architecture.png"
echo "   📄 workflow-timeline.png"
echo ""
echo "📧 These PNG files can be directly inserted into emails!"
