#!/bin/bash
#
# OSCAL Report Generator V2 - Multi-Mode Setup Script
#
# Author: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
# Copyright (c) 2025 Mukesh Kesharwani
# License: MIT
#
# Usage: ./setup.sh [MODE]
# Modes: install, reinstall, uninstall, fix, update, verify, debug, help

set -e  # Exit on error

# ============================================================================
# COLOR DEFINITIONS
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'  # No Color

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

print_success() {
  echo -e "${GREEN}✓${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC}  $1"
}

print_info() {
  echo -e "${BLUE}ℹ${NC}  $1"
}

print_header() {
  echo -e "${CYAN}========================================${NC}"
  echo -e "${CYAN}$1${NC}"
  echo -e "${CYAN}========================================${NC}"
  echo ""
}

# ============================================================================
# CONFIGURATION
# ============================================================================

PROJECT_NAME="OSCAL Report Generator V2"
VERSION="1.2.7"
NODE_MIN_VERSION="20"

# ============================================================================
# HELP FUNCTION
# ============================================================================

show_help() {
  cat << EOF
${CYAN}$PROJECT_NAME - Setup Script v$VERSION${NC}

${BLUE}Usage:${NC}
  ./setup.sh [MODE]

${BLUE}Modes:${NC}
  ${GREEN}install${NC}     - Full installation with dependency setup (default)
  ${GREEN}reinstall${NC}   - Clean reinstall (removes node_modules, rebuilds)
  ${GREEN}uninstall${NC}   - Remove application and clean up
  ${GREEN}fix${NC}         - Quick fix (rebuild and verify files)
  ${GREEN}update${NC}      - Update existing installation
  ${GREEN}verify${NC}      - Verify installation status and health
  ${GREEN}debug${NC}       - Run diagnostics and show system info
  ${GREEN}help${NC}        - Show this help message

${BLUE}Examples:${NC}
  ./setup.sh install    # First-time setup
  ./setup.sh verify     # Check if everything is working
  ./setup.sh debug      # Troubleshoot issues
  ./setup.sh reinstall  # Clean install

${BLUE}Environment Variables:${NC}
  SKIP_NPM_INSTALL=1       Skip npm dependency installation
  SKIP_FRONTEND_BUILD=1    Skip frontend build
  SKIP_MISTRAL_SETUP=1     Skip Mistral AI setup

${BLUE}Documentation:${NC}
  README.md           - Quick start guide
  docs/ARCHITECTURE.md - Technical architecture
  docs/DEPLOYMENT.md  - Deployment guides

${BLUE}Support:${NC}
  GitHub: https://github.com/keekar2022/OSCAL-Reports
  Issues: https://github.com/keekar2022/OSCAL-Reports/issues

EOF
}

# ============================================================================
# VERIFICATION FUNCTIONS
# ============================================================================

check_nodejs() {
  print_info "Checking Node.js installation..."
  
  if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    echo "  Please install Node.js ${NODE_MIN_VERSION}+ from https://nodejs.org/"
    return 1
  fi
  
  NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -lt "$NODE_MIN_VERSION" ]; then
    print_error "Node.js version $NODE_VERSION is too old (need ${NODE_MIN_VERSION}+)"
    return 1
  fi
  
  print_success "Node.js $(node --version) detected"
  return 0
}

check_npm() {
  print_info "Checking npm installation..."
  
  if ! command -v npm &> /dev/null; then
    print_error "npm is not installed"
    return 1
  fi
  
  print_success "npm $(npm --version) detected"
  return 0
}

check_file_exists() {
  local file=$1
  local description=$2
  
  if [ -f "$file" ]; then
    print_success "$description exists"
    return 0
  else
    print_error "$description missing: $file"
    return 1
  fi
}

check_directory_exists() {
  local dir=$1
  local description=$2
  
  if [ -d "$dir" ]; then
    print_success "$description exists"
    return 0
  else
    print_error "$description missing: $dir"
    return 1
  fi
}

check_nodejs_syntax() {
  local file=$1
  
  if node -c "$file" 2>/dev/null; then
    return 0
  else
    print_error "Syntax error in $file"
    return 1
  fi
}

# ============================================================================
# VERIFY MODE
# ============================================================================

do_verify() {
  print_header "VERIFICATION MODE"
  
  local errors=0
  
  # Check Node.js and npm
  check_nodejs || errors=$((errors+1))
  check_npm || errors=$((errors+1))
  echo ""
  
  # Check project structure
  print_info "Checking project structure..."
  check_directory_exists "backend" "Backend directory" || errors=$((errors+1))
  check_directory_exists "frontend" "Frontend directory" || errors=$((errors+1))
  check_directory_exists "config/app" "Config directory" || errors=$((errors+1))
  check_directory_exists "docs" "Documentation directory" || errors=$((errors+1))
  echo ""
  
  # Check critical files
  print_info "Checking critical files..."
  check_file_exists "package.json" "Root package.json" || errors=$((errors+1))
  check_file_exists "backend/package.json" "Backend package.json" || errors=$((errors+1))
  check_file_exists "backend/server.js" "Backend server" || errors=$((errors+1))
  check_file_exists "frontend/package.json" "Frontend package.json" || errors=$((errors+1))
  check_file_exists "frontend/vite.config.js" "Vite config" || errors=$((errors+1))
  check_file_exists "Dockerfile" "Dockerfile" || errors=$((errors+1))
  check_file_exists "docker-compose.yml" "Docker Compose" || errors=$((errors+1))
  echo ""
  
  # Check Node.js syntax
  print_info "Checking JavaScript syntax..."
  if [ -f "backend/server.js" ]; then
    check_nodejs_syntax "backend/server.js" || errors=$((errors+1))
  fi
  echo ""
  
  # Check node_modules
  print_info "Checking dependencies..."
  if [ -d "backend/node_modules" ]; then
    print_success "Backend dependencies installed"
  else
    print_warning "Backend dependencies not installed (run: npm install)"
    errors=$((errors+1))
  fi
  
  if [ -d "frontend/node_modules" ]; then
    print_success "Frontend dependencies installed"
  else
    print_warning "Frontend dependencies not installed (run: npm install)"
    errors=$((errors+1))
  fi
  echo ""
  
  # Check frontend build
  print_info "Checking frontend build..."
  if [ -d "frontend/dist" ]; then
    print_success "Frontend build exists"
  else
    print_warning "Frontend not built (run: npm run build)"
  fi
  
  if [ -d "backend/public" ]; then
    print_success "Backend public directory exists"
  else
    print_warning "Backend public directory missing"
  fi
  echo ""
  
  # Check ports availability
  print_info "Checking port availability..."
  if lsof -Pi :3020 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    print_warning "Port 3020 is in use (backend may be running)"
  else
    print_success "Port 3020 is available"
  fi
  
  if lsof -Pi :3021 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    print_warning "Port 3021 is in use (frontend dev server may be running)"
  else
    print_success "Port 3021 is available"
  fi
  echo ""
  
  # Summary
  if [ $errors -eq 0 ]; then
    print_success "All verification checks passed! ✨"
    print_info "You can start the application with: npm run dev"
    return 0
  else
    print_error "Verification found $errors issue(s)"
    print_info "Run './setup.sh debug' for more detailed diagnostics"
    print_info "Or run './setup.sh fix' to attempt automatic repair"
    return 1
  fi
}

# ============================================================================
# DEBUG MODE
# ============================================================================

do_debug() {
  print_header "DEBUG MODE"
  
  # System information
  print_info "System Information:"
  echo "  OS: $(uname -s)"
  echo "  Architecture: $(uname -m)"
  echo "  Kernel: $(uname -r)"
  echo ""
  
  # Node.js information
  print_info "Node.js Environment:"
  if command -v node &> /dev/null; then
    echo "  Node.js: $(node --version)"
    echo "  npm: $(npm --version)"
    echo "  Node path: $(which node)"
    echo "  npm path: $(which npm)"
  else
    print_error "Node.js not installed"
  fi
  echo ""
  
  # Disk space
  print_info "Disk Space:"
  df -h . | grep -v Filesystem
  echo ""
  
  # Directory sizes
  print_info "Directory Sizes:"
  if [ -d "node_modules" ]; then
    echo "  Root node_modules: $(du -sh node_modules 2>/dev/null | cut -f1)"
  fi
  if [ -d "backend/node_modules" ]; then
    echo "  Backend node_modules: $(du -sh backend/node_modules 2>/dev/null | cut -f1)"
  fi
  if [ -d "frontend/node_modules" ]; then
    echo "  Frontend node_modules: $(du -sh frontend/node_modules 2>/dev/null | cut -f1)"
  fi
  if [ -d "frontend/dist" ]; then
    echo "  Frontend dist: $(du -sh frontend/dist 2>/dev/null | cut -f1)"
  fi
  echo ""
  
  # Port status
  print_info "Port Status:"
  echo "  Port 3020 (backend): $(lsof -Pi :3020 -sTCP:LISTEN -t >/dev/null 2>&1 && echo 'IN USE' || echo 'Available')"
  echo "  Port 3021 (frontend): $(lsof -Pi :3021 -sTCP:LISTEN -t >/dev/null 2>&1 && echo 'IN USE' || echo 'Available')"
  echo "  Port 11434 (Ollama): $(lsof -Pi :11434 -sTCP:LISTEN -t >/dev/null 2>&1 && echo 'IN USE' || echo 'Available')"
  echo ""
  
  # Git status
  if [ -d ".git" ]; then
    print_info "Git Status:"
    echo "  Branch: $(git branch --show-current 2>/dev/null || echo 'N/A')"
    echo "  Last commit: $(git log -1 --oneline 2>/dev/null || echo 'N/A')"
    echo "  Modified files: $(git status --short 2>/dev/null | wc -l | tr -d ' ')"
  fi
  echo ""
  
  # Configuration files
  print_info "Configuration Files:"
  [ -f "config/app/config.json" ] && print_success "config.json exists" || print_warning "config.json missing"
  [ -f "config/app/users.json" ] && print_success "users.json exists" || print_warning "users.json missing"
  echo ""
  
  # Recent logs
  if [ -d "logs" ] && [ "$(ls -A logs 2>/dev/null)" ]; then
    print_info "Recent Log Entries:"
    tail -5 logs/*.jsonl 2>/dev/null || print_warning "No log files found"
  else
    print_warning "No logs directory or log files"
  fi
  echo ""
  
  # Run verification
  print_info "Running verification checks..."
  echo ""
  do_verify
}

# ============================================================================
# INSTALL MODE
# ============================================================================

do_install() {
  print_header "INSTALLATION MODE"
  
  # Check prerequisites
  print_info "Checking prerequisites..."
  check_nodejs || exit 1
  check_npm || exit 1
  echo ""
  
  # Install dependencies
  if [ "${SKIP_NPM_INSTALL}" != "1" ]; then
    print_info "Installing dependencies..."
    
    echo "  📦 Root dependencies..."
    npm install || { print_error "Failed to install root dependencies"; exit 1; }
    
    echo "  📦 Backend dependencies..."
    (cd backend && npm install) || { print_error "Failed to install backend dependencies"; exit 1; }
    
    echo "  📦 Frontend dependencies..."
    (cd frontend && npm install) || { print_error "Failed to install frontend dependencies"; exit 1; }
    
    print_success "Dependencies installed"
    echo ""
  else
    print_warning "Skipping npm install (SKIP_NPM_INSTALL=1)"
    echo ""
  fi
  
  # Build frontend
  if [ "${SKIP_FRONTEND_BUILD}" != "1" ]; then
    print_info "Building frontend..."
    (cd frontend && npm run build) || { print_error "Frontend build failed"; exit 1; }
    
    print_info "Copying frontend build to backend..."
    cp -r frontend/dist backend/public
    
    print_success "Frontend built successfully"
    echo ""
  else
    print_warning "Skipping frontend build (SKIP_FRONTEND_BUILD=1)"
    echo ""
  fi
  
  # Copy configuration files
  print_info "Setting up configuration files..."
  if [ -d "config" ]; then
    if [ -f "config/app/config.json" ]; then
      mkdir -p backend
      cp config/app/config.json backend/config.json 2>/dev/null || true
      print_success "Copied config.json"
    fi
    if [ -f "config/app/users.json" ]; then
      mkdir -p backend/auth
      cp config/app/users.json backend/auth/users.json 2>/dev/null || true
      print_success "Copied users.json"
    fi
  fi
  echo ""
  
  # Generate credentials
  print_info "Generating default credentials..."
  CREDENTIALS_FILE="credentials.txt"
  
  BUILD_DATE=$(date +%d)
  BUILD_MONTH=$(date +%m)
  BUILD_YEAR=$(date +%y)
  BUILD_HOUR=$(date +%H)
  ADMIN_PASSWORD="admin#${BUILD_DATE}${BUILD_MONTH}${BUILD_YEAR}${BUILD_HOUR}"
  USER_PASSWORD="user#${BUILD_DATE}${BUILD_MONTH}${BUILD_YEAR}${BUILD_HOUR}"
  ASSESSOR_PASSWORD="assessor#${BUILD_DATE}${BUILD_MONTH}${BUILD_YEAR}${BUILD_HOUR}"
  
  cat > "$CREDENTIALS_FILE" << EOF
================================================================================
OSCAL Report Generator V2 - Default Credentials
================================================================================

IMPORTANT: These are the default credentials generated during setup.
Please change them immediately after first login for security purposes.

Password Format: username#DDMMYYHH
(DD=Day, MM=Month, YY=Year, HH=Hour of build time)

Platform Admin Credentials:
  Username: admin
  Password: ${ADMIN_PASSWORD}

Standard User Credentials:
  Username: user
  Password: ${USER_PASSWORD}

Assessor Credentials:
  Username: assessor
  Password: ${ASSESSOR_PASSWORD}

Build Timestamp: $(date '+%Y-%m-%d %H:%M:%S')

================================================================================
This file is generated during the build process.
Keep this file secure and do not commit it to version control.
Delete this file after changing the default credentials.
================================================================================
EOF
  
  print_success "Credentials file generated: $CREDENTIALS_FILE"
  echo "  ${MAGENTA}Admin password: ${ADMIN_PASSWORD}${NC}"
  echo ""
  
  # Mistral AI setup (optional)
  if [ "${SKIP_MISTRAL_SETUP}" != "1" ]; then
    print_info "Checking for Mistral AI / Ollama..."
    if command -v ollama &> /dev/null; then
      print_success "Ollama is installed"
      
      if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        print_success "Ollama service is running"
        
        if ollama list | grep -q "mistral:7b\|mistral"; then
          print_success "Mistral 7B model is installed"
        else
          print_info "Pulling Mistral 7B model..."
          ollama pull mistral:7b || print_warning "Failed to pull Mistral model"
        fi
      else
        print_warning "Ollama service is not running (start with: ollama serve)"
      fi
    else
      print_info "Ollama not installed (optional for AI features)"
      echo "  Install: https://ollama.ai/download"
    fi
    echo ""
  fi
  
  # Create logs directory
  mkdir -p logs
  print_success "Created logs directory"
  echo ""
  
  # Verify installation
  print_info "Verifying installation..."
  echo ""
  do_verify
  
  # Final message
  echo ""
  print_success "Installation complete! 🎉"
  echo ""
  print_info "Next steps:"
  echo "  1. Review credentials in: ${CREDENTIALS_FILE}"
  echo "  2. Start development: ${GREEN}npm run dev${NC}"
  echo "  3. Access application: ${CYAN}http://localhost:3021${NC}"
  echo ""
  print_info "Documentation:"
  echo "  README.md            - Quick start guide"
  echo "  docs/ARCHITECTURE.md - Technical details"
  echo "  docs/DEPLOYMENT.md   - Deployment options"
  echo ""
}

# ============================================================================
# REINSTALL MODE
# ============================================================================

do_reinstall() {
  print_header "REINSTALL MODE"
  
  print_warning "This will remove all node_modules and rebuild everything"
  read -p "Are you sure? (y/N) " -n 1 -r
  echo ""
  
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Reinstall cancelled"
    exit 0
  fi
  
  # Clean up
  print_info "Cleaning up..."
  rm -rf node_modules backend/node_modules frontend/node_modules
  rm -rf frontend/dist backend/public
  rm -f package-lock.json backend/package-lock.json frontend/package-lock.json
  print_success "Cleanup complete"
  echo ""
  
  # Run install
  do_install
}

# ============================================================================
# UNINSTALL MODE
# ============================================================================

do_uninstall() {
  print_header "UNINSTALL MODE"
  
  print_warning "This will remove:"
  echo "  - All node_modules directories"
  echo "  - All build outputs (dist, public)"
  echo "  - Credentials file"
  echo "  - Log files"
  echo ""
  
  read -p "Are you sure? (y/N) " -n 1 -r
  echo ""
  
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_info "Uninstall cancelled"
    exit 0
  fi
  
  print_info "Uninstalling..."
  
  # Remove node_modules
  print_info "Removing dependencies..."
  rm -rf node_modules backend/node_modules frontend/node_modules
  rm -f package-lock.json backend/package-lock.json frontend/package-lock.json
  
  # Remove build outputs
  print_info "Removing build outputs..."
  rm -rf frontend/dist backend/public
  
  # Remove credentials
  if [ -f "credentials.txt" ]; then
    rm -f credentials.txt
    print_success "Removed credentials file"
  fi
  
  # Clean logs (optional)
  read -p "Remove log files? (y/N) " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf logs/*.jsonl
    print_success "Removed log files"
  fi
  
  echo ""
  print_success "Uninstall complete"
  print_info "Source code and configuration files preserved"
  print_info "To reinstall: ./setup.sh install"
}

# ============================================================================
# FIX MODE
# ============================================================================

do_fix() {
  print_header "FIX MODE"
  
  print_info "Attempting to fix common issues..."
  echo ""
  
  # Rebuild frontend
  print_info "Rebuilding frontend..."
  if [ -d "frontend" ]; then
    (cd frontend && npm run build) || { print_error "Frontend build failed"; exit 1; }
    cp -r frontend/dist backend/public
    print_success "Frontend rebuilt"
  fi
  echo ""
  
  # Verify configuration
  print_info "Checking configuration files..."
  if [ ! -f "config/app/config.json" ]; then
    if [ -f "config/app/config.json.example" ]; then
      cp config/app/config.json.example config/app/config.json
      print_success "Created config.json from example"
    else
      print_warning "No config.json or example found"
    fi
  fi
  
  if [ ! -f "config/app/users.json" ]; then
    if [ -f "config/app/users.json.example" ]; then
      cp config/app/users.json.example config/app/users.json
      print_success "Created users.json from example"
    else
      print_warning "No users.json or example found"
    fi
  fi
  echo ""
  
  # Create missing directories
  print_info "Ensuring required directories exist..."
  mkdir -p logs
  mkdir -p config/app
  mkdir -p backend/auth
  print_success "Directories created/verified"
  echo ""
  
  # Run verification
  print_info "Running verification..."
  echo ""
  do_verify
}

# ============================================================================
# UPDATE MODE
# ============================================================================

do_update() {
  print_header "UPDATE MODE"
  
  print_info "Updating dependencies..."
  echo ""
  
  # Update root
  print_info "Updating root dependencies..."
  npm update || print_warning "Root update had issues"
  
  # Update backend
  print_info "Updating backend dependencies..."
  (cd backend && npm update) || print_warning "Backend update had issues"
  
  # Update frontend
  print_info "Updating frontend dependencies..."
  (cd frontend && npm update) || print_warning "Frontend update had issues"
  
  echo ""
  print_success "Dependencies updated"
  
  # Rebuild frontend
  print_info "Rebuilding frontend..."
  (cd frontend && npm run build) || { print_error "Frontend build failed"; exit 1; }
  cp -r frontend/dist backend/public
  print_success "Frontend rebuilt"
  
  echo ""
  print_info "Running verification..."
  echo ""
  do_verify
}

# ============================================================================
# MAIN EXECUTION
# ============================================================================

MODE=${1:-install}

case "$MODE" in
  install)
    do_install
    ;;
  reinstall)
    do_reinstall
    ;;
  uninstall)
    do_uninstall
    ;;
  fix)
    do_fix
    ;;
  update)
    do_update
    ;;
  verify)
    do_verify
    ;;
  debug)
    do_debug
    ;;
  help|--help|-h)
    show_help
    ;;
  *)
    print_error "Unknown mode: $MODE"
    echo ""
    show_help
    exit 1
    ;;
esac
