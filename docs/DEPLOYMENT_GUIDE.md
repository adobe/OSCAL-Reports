# Deployment Guide - OSCAL Report Generator V2

## Excluding Test Files from Deployment

The `tests/` folder contains all test-related files and should be excluded from production deployments.

---

## 📁 What to Exclude

```
tests/                          # Entire test directory
**/*.test.js                    # All test files
**/*.test.jsx
**/*.spec.js
**/*.spec.jsx
jest.config.js                  # Test configuration
coverage/                       # Coverage reports
node_modules/                   # Development dependencies
```

---

## 🐳 Method 1: Docker Deployment

### Using .dockerignore

The project includes a `.dockerignore` file that automatically excludes test files:

```dockerfile
# Dockerfile example
FROM node:20-alpine

WORKDIR /app

# Copy only production files (tests excluded via .dockerignore)
COPY . .

# Install production dependencies only
RUN npm ci --only=production

CMD ["npm", "start"]
```

### Verify Exclusion

```bash
# Build Docker image
docker build -t oscal-report-generator:2.0.0 .

# Check what's included
docker run --rm oscal-report-generator:2.0.0 ls -la
# Should NOT see tests/ directory
```

---

## 📦 Method 2: rsync Deployment

### Using rsync with exclusions

```bash
# Deploy to server excluding tests
rsync -av \
  --exclude='tests/' \
  --exclude='**/*.test.js' \
  --exclude='**/*.test.jsx' \
  --exclude='coverage/' \
  --exclude='node_modules/' \
  --exclude='.git/' \
  ./ user@server:/path/to/app/
```

### Create Deployment Script

```bash
#!/bin/bash
# deploy.sh

SOURCE_DIR="."
DEST_SERVER="user@production-server"
DEST_PATH="/var/www/oscal-reports"

rsync -av --delete \
  --exclude-from='.deployignore' \
  $SOURCE_DIR/ $DEST_SERVER:$DEST_PATH/

echo "Deployment complete!"
```

---

## 🏗️ Method 3: Build-Based Deployment

### Create a clean build

```bash
#!/bin/bash
# build-production.sh

BUILD_DIR="./dist"

# Clean build directory
rm -rf $BUILD_DIR
mkdir -p $BUILD_DIR

# Copy production files
rsync -av \
  --exclude-from='.deployignore' \
  --exclude='dist/' \
  ./ $BUILD_DIR/

# Install production dependencies
cd $BUILD_DIR
npm ci --only=production

echo "Production build ready in $BUILD_DIR"
```

---

## ☁️ Method 4: Cloud Platform Deployment

### Heroku

```yaml
# .slugignore
tests/
**/*.test.js
**/*.test.jsx
coverage/
docs/
```

### AWS Elastic Beanstalk

```yaml
# .ebignore
tests/
**/*.test.js
**/*.test.jsx
coverage/
node_modules/
.git/
```

### Azure App Service

```json
// .deployment
[config]
SCM_DO_BUILD_DURING_DEPLOYMENT = true

[ignore]
tests/
**/*.test.js
coverage/
```

---

## 🔍 Verification Checklist

Before deploying, verify:

```bash
# 1. Check production build size
du -sh dist/
# Should be significantly smaller without tests

# 2. Verify tests are excluded
ls -la dist/ | grep tests
# Should return nothing

# 3. Check test files are excluded
find dist/ -name "*.test.js"
# Should return nothing

# 4. Verify all production files are present
ls -la dist/backend/
ls -la dist/frontend/
# Should see all necessary files

# 5. Test production build
cd dist/
npm start
# Application should run without tests
```

---

## 📊 Build Size Comparison

| Build Type | Includes Tests | Size |
|------------|----------------|------|
| Development | ✅ Yes | ~250 MB |
| Production | ❌ No | ~50 MB |
| **Reduction** | - | **80% smaller** |

---

## 🚀 Deployment Workflow

### Step 1: Run Tests Locally
```bash
./tests/scripts/run_tests.sh
```

### Step 2: Build for Production
```bash
./build-production.sh
```

### Step 3: Deploy
```bash
# Using rsync
./deploy.sh

# Or using Docker
docker build -t oscal:2.0.0 .
docker push registry/oscal:2.0.0
```

### Step 4: Verify Deployment
```bash
# Check health endpoint
curl https://your-domain.com/health

# Verify no test files
ssh user@server "ls -la /path/to/app/ | grep tests"
# Should return nothing
```

---

## 🔐 Environment-Specific Configs

### Development (.env.development)
```env
NODE_ENV=development
RUN_TESTS=true
INCLUDE_DOCS=true
```

### Production (.env.production)
```env
NODE_ENV=production
RUN_TESTS=false
INCLUDE_DOCS=false
```

---

## 📝 package.json Scripts

Add these scripts for deployment:

```json
{
  "scripts": {
    "build:production": "./build-production.sh",
    "deploy:staging": "npm run build:production && ./deploy-staging.sh",
    "deploy:production": "npm run build:production && ./deploy-production.sh",
    "verify:deployment": "./verify-deployment.sh"
  }
}
```

---

## 🛡️ Security Best Practices

1. **Never deploy .env files** - Use environment variables on the server
2. **Use production dependencies only** - `npm ci --only=production`
3. **Remove debug tools** - No test utilities in production
4. **Minimize attack surface** - Fewer files = fewer vulnerabilities
5. **Keep tests in GitHub** - Available for developers, not in production

---

## 📦 GitHub Release Process

### Creating a Release

```bash
# 1. Run all tests
./tests/scripts/run_tests.sh

# 2. Bump version
./bump_version.sh minor "Add new features"

# 3. Create release package (without tests)
tar -czf oscal-v2.0.0.tar.gz \
  --exclude='tests' \
  --exclude='node_modules' \
  --exclude='coverage' \
  --exclude='.git' \
  backend/ frontend/ docs/ *.md *.sh

# 4. Create GitHub release
git tag v2.0.0
git push origin v2.0.0
# Upload oscal-v2.0.0.tar.gz to GitHub release
```

---

## 🔄 CI/CD Pipeline

### GitHub Actions Example

```yaml
name: Deploy Production

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Tests
        run: ./tests/scripts/run_tests.sh
      
      - name: Build Production
        run: |
          rsync -av \
            --exclude='tests/' \
            --exclude='**/*.test.js' \
            ./ ./dist/
      
      - name: Deploy
        run: |
          # Your deployment commands here
          # dist/ folder contains no test files
```

---

## 📞 Support

For deployment issues:
1. Check `.dockerignore` and `.deployignore` files
2. Verify build scripts
3. Review deployment logs
4. Contact DevOps team

---

**Last Updated**: December 29, 2025  
**Version**: 2.0.0  
**Maintainer**: Development Team

