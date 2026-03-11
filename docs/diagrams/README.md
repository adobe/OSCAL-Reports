# AWS Architecture Diagrams

This folder contains Mermaid diagram files for the AWS deployment architecture.

## Files

1. **aws-auto-scaling-architecture.mmd** - Main architecture diagram: ALB, Green/Blue OSCAL instances (t4g.small Graviton preferred), S3 (logs, config, users), and AWS Bedrock for AI. No self-hosted Ollama; AI is pay-per-use via Bedrock.
2. **workflow-timeline.mmd** - Sequence diagram for user flow: access app via ALB, then AI suggest via Bedrock (no wake/sleep or scaling).
3. **generate-diagram.html** - Interactive HTML that renders both diagrams and supports PNG download.

## Convert to PNG/SVG for Email

### Option 1: Online converter (easiest)

1. **Mermaid Live Editor**: https://mermaid.live/
   - Copy the contents of the `.mmd` file
   - Paste into the editor
   - Click "Download PNG" or "Download SVG"
   - PNG is ready to attach to email!

2. **Mermaid.ink**: https://mermaid.ink/
   - Use URL format: `https://mermaid.ink/img/[base64-encoded-diagram]`
   - Or use their online tool

### Option 2: VS Code extension

1. Install "Markdown Preview Mermaid Support" extension
2. Open the `.mmd` file
3. Right-click and select "Export as PNG"

### Option 3: Command line (for automation)

```bash
# Install mermaid-cli
npm install -g @mermaid-js/mermaid-cli

# Convert to PNG
mmdc -i aws-auto-scaling-architecture.mmd -o aws-architecture.png -w 1920 -H 1080

# Convert to SVG (for better quality)
mmdc -i aws-auto-scaling-architecture.mmd -o aws-architecture.svg
```

### Option 4: Convert all diagrams

```bash
npm install -g @mermaid-js/mermaid-cli
npx playwright install chromium

for file in *.mmd; do
    mmdc -i "$file" -o "${file%.mmd}.png" -w 1920 -H 1080 -b white
done
```

## Recommended settings for email

- **Format**: PNG (best compatibility)
- **Width**: 1920px (high quality)
- **Height**: Auto or 1080px
- **Background**: White
- **Theme**: Default or Forest

## Output files

After conversion you get:
- `aws-auto-scaling-architecture.png` - Main architecture (ALB, Green/Blue, S3, Bedrock)
- `workflow-timeline.png` - User and AI workflow sequence

Both are suitable for email or docs.

## Customization

To modify the diagrams:
1. Edit the `.mmd` files
2. Adjust colors using `style` commands
3. Change layout with `flowchart TB` (top-bottom) or `LR` (left-right)
4. Reconvert to PNG

## Tips

- Use PNG for emails (better compatibility)
- Use SVG for presentations (scalable)
- Use PDF for print documents
- Keep width at 1920px for HD displays
