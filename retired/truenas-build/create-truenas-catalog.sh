#!/bin/bash
#
# TrueNAS Catalog Creation Script
# Creates a TrueNAS SCALE app catalog repository structure
#
# Usage: ./create-truenas-catalog.sh [catalog-directory] [github-username]
#
# Author: Mukesh Kesharwani
# Date: January 2026
#
# NOTE: Retired; moved to retired/truenas-build/ (see README there).
# When run from this folder, PROJECT_ROOT is retired/; truenas-chart may need to be at repo root.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
CATALOG_DIR="${1:-../truenas-oscal-catalog}"
GITHUB_USER="${2:-keekar2022}"
CHART_VERSION="1.6.3"
APP_NAME="oscal-report-generator"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        TrueNAS SCALE Catalog Creation Script                ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if helm is installed
if ! command -v helm &> /dev/null; then
    echo -e "${RED}✗ Error: Helm is not installed${NC}"
    echo -e "${YELLOW}Install helm first:${NC}"
    echo "  macOS: brew install helm"
    echo "  Linux: curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash"
    exit 1
fi

echo -e "${GREEN}✓ Helm is installed${NC}"
echo ""

# Get current directory (retired/truenas-build); project root = repo root for chart
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHART_SOURCE="$PROJECT_ROOT/truenas-chart"

echo -e "${BLUE}Configuration:${NC}"
echo "  Catalog Directory: $CATALOG_DIR"
echo "  GitHub Username: $GITHUB_USER"
echo "  Chart Version: $CHART_VERSION"
echo "  App Name: $APP_NAME"
echo ""

# Check if chart source exists
if [ ! -d "$CHART_SOURCE" ]; then
    echo -e "${RED}✗ Error: Chart source not found at $CHART_SOURCE${NC}"
    exit 1
fi

echo -e "${YELLOW}Creating catalog structure...${NC}"

# Create catalog directory structure
mkdir -p "$CATALOG_DIR/charts/$APP_NAME/$CHART_VERSION"

echo -e "${GREEN}✓ Created directory structure${NC}"

# Copy chart files
echo -e "${YELLOW}Copying chart files...${NC}"

cp -r "$CHART_SOURCE/"* "$CATALOG_DIR/charts/$APP_NAME/$CHART_VERSION/"

echo -e "${GREEN}✓ Copied chart files${NC}"

# Create item.yaml
echo -e "${YELLOW}Creating item.yaml...${NC}"

cat > "$CATALOG_DIR/charts/$APP_NAME/item.yaml" << 'EOF'
categories:
  - security
  - compliance
  - governance

icon_url: https://raw.githubusercontent.com/GITHUB_USER/truenas-oscal-catalog/main/charts/oscal-report-generator/CHART_VERSION/icon.png

tags:
  - oscal
  - compliance
  - security
  - ssp
  - soa
  - ccm
  - nist
  - governance
EOF

# Replace placeholders
sed -i '' "s/GITHUB_USER/$GITHUB_USER/g" "$CATALOG_DIR/charts/$APP_NAME/item.yaml" 2>/dev/null || \
sed -i "s/GITHUB_USER/$GITHUB_USER/g" "$CATALOG_DIR/charts/$APP_NAME/item.yaml"

sed -i '' "s/CHART_VERSION/$CHART_VERSION/g" "$CATALOG_DIR/charts/$APP_NAME/item.yaml" 2>/dev/null || \
sed -i "s/CHART_VERSION/$CHART_VERSION/g" "$CATALOG_DIR/charts/$APP_NAME/item.yaml"

echo -e "${GREEN}✓ Created item.yaml${NC}"

# Create README.md
echo -e "${YELLOW}Creating README.md...${NC}"

cat > "$CATALOG_DIR/README.md" << 'READMEEOF'
# TrueNAS SCALE App Catalog

Custom app catalog for OSCAL compliance and security tools.

## Available Apps

### OSCAL Report Generator

Generate compliance documentation from OSCAL catalogs.

**Features**:
- AI-powered control suggestions
- Multiple frameworks (NIST, ISM, IM8)
- Multiple export formats (JSON, Excel, PDF, CCM)
- Modern web interface

**Latest Version**: CHART_VERSION

---

## Adding This Catalog to TrueNAS

1. Open TrueNAS SCALE Web UI
2. Navigate to **Apps** → **Manage Catalogs**
3. Click **Add Catalog**
4. Configure:
   - **Catalog Name**: `OSCAL Apps`
   - **Repository**: `https://github.com/GITHUB_USER/truenas-oscal-catalog`
   - **Preferred Trains**: `charts`
   - **Branch**: `main`
5. Click **Save**
6. Wait 1-2 minutes for sync

## Installing Apps

After adding the catalog:

1. Go to **Apps** → **Discover Apps**
2. Find **OSCAL Report Generator**
3. Click on it
4. Configure settings
5. Click **Install**

---

## Documentation

- **OSCAL Report Generator**: [GitHub](https://github.com/keekar2022/OSCAL-Reports)
- **Docker Hub**: [keekar/oscal_reports](https://hub.docker.com/r/keekar/oscal_reports)

## Support

- **Issues**: [GitHub Issues](https://github.com/keekar2022/OSCAL-Reports/issues)
- **Documentation**: [Full Docs](https://github.com/keekar2022/OSCAL-Reports/tree/main/docs)

---

**Maintained by**: Mukesh Kesharwani
READMEEOF

# Replace placeholders
sed -i '' "s/CHART_VERSION/$CHART_VERSION/g" "$CATALOG_DIR/README.md" 2>/dev/null || \
sed -i "s/CHART_VERSION/$CHART_VERSION/g" "$CATALOG_DIR/README.md"

sed -i '' "s/GITHUB_USER/$GITHUB_USER/g" "$CATALOG_DIR/README.md" 2>/dev/null || \
sed -i "s/GITHUB_USER/$GITHUB_USER/g" "$CATALOG_DIR/README.md"

echo -e "${GREEN}✓ Created README.md${NC}"

# Generate catalog index
echo -e "${YELLOW}Generating catalog index...${NC}"

cd "$CATALOG_DIR"
helm repo index . --url "https://github.com/$GITHUB_USER/truenas-oscal-catalog/raw/main"

echo -e "${GREEN}✓ Generated index.yaml${NC}"

# Create .gitignore
cat > "$CATALOG_DIR/.gitignore" << 'EOF'
.DS_Store
*.swp
*.bak
*~
EOF

echo -e "${GREEN}✓ Created .gitignore${NC}"

# Initialize git if not already a repo
if [ ! -d "$CATALOG_DIR/.git" ]; then
    echo -e "${YELLOW}Initializing git repository...${NC}"
    cd "$CATALOG_DIR"
    git init
    git add .
    git commit -m "Initial catalog with OSCAL Report Generator v$CHART_VERSION"
    echo -e "${GREEN}✓ Initialized git repository${NC}"
fi

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                 ✓ Catalog Created Successfully!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo -e "${YELLOW}1. Create GitHub Repository${NC}"
echo "   Go to: https://github.com/new"
echo "   Name: truenas-oscal-catalog"
echo "   Public: ✓"
echo "   Don't initialize with README (we already have one)"
echo ""
echo -e "${YELLOW}2. Push to GitHub${NC}"
echo "   cd $CATALOG_DIR"
echo "   git remote add origin https://github.com/$GITHUB_USER/truenas-oscal-catalog.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo -e "${YELLOW}3. Users Add Your Catalog${NC}"
echo "   TrueNAS UI → Apps → Manage Catalogs → Add Catalog"
echo "   Repository: https://github.com/$GITHUB_USER/truenas-oscal-catalog"
echo "   Branch: main"
echo ""
echo -e "${YELLOW}4. Optional: Add App Icon${NC}"
echo "   Add icon.png (512x512) to:"
echo "   $CATALOG_DIR/charts/$APP_NAME/$CHART_VERSION/icon.png"
echo "   Then regenerate index: cd $CATALOG_DIR && helm repo index ."
echo ""
echo -e "${BLUE}Catalog Location:${NC} $CATALOG_DIR"
echo -e "${BLUE}Documentation:${NC} $PROJECT_ROOT/docs (or TRUENAS_CUSTOM_CATALOG_SETUP.md if present)"
echo ""
echo -e "${GREEN}Happy publishing! 🚀${NC}"
