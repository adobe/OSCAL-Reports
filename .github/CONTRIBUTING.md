# Contributing to OSCAL Report Generator V2

Thank you for your interest in contributing to the OSCAL Report Generator V2! This document provides guidelines and best practices for contributing to the project.

---

## 📋 Table of Contents

1. [Getting Started](#getting-started)
2. [Branch Strategy](#branch-strategy)
3. [Commit Message Convention](#commit-message-convention)
4. [Pull Request Process](#pull-request-process)
5. [Code Review Guidelines](#code-review-guidelines)
6. [Development Workflow](#development-workflow)
7. [Testing Requirements](#testing-requirements)
8. [Documentation Standards](#documentation-standards)

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+ installed
- Git configured with your name and email
- Familiarity with React and Node.js
- Understanding of OSCAL standards (helpful but not required)

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/keekar2022/OSCAL-Reports.git
cd OSCAL-Reports

# Install dependencies
./setup.sh install

# Start development servers
npm run dev

# Verify installation
./setup.sh verify
```

### Before You Start Coding

1. **Read the documentation**:
   - `README.md` - Project overview
   - `docs/ARCHITECTURE.md` - Technical architecture
   - `docs/BEST_PRACTICES_IMPLEMENTATION.md` - Coding standards

2. **Check existing issues**:
   - Look for open issues that interest you
   - Comment on the issue to claim it
   - Ask questions if anything is unclear

3. **Discuss major changes**:
   - Open an issue first for significant changes
   - Get feedback before investing time in implementation

---

## 🌳 Branch Strategy

We use a simplified git-flow model for organized development:

### Main Branches

#### **`main`** - Production Ready
- Protected branch, requires PR and review
- All merges must pass CI/CD (when implemented)
- Tagged for releases (vX.Y.Z)
- **Never commit directly to main**

#### **`develop`** - Integration Branch
- Latest development changes
- Should always be in working state
- PRs merged here first, then to main
- Base branch for all feature branches

### Feature Branches

#### **`feature/*`** - New Features
- **Branch from**: `develop`
- **Merge to**: `develop`
- **Naming**: `feature/descriptive-name`
- **Examples**:
  - `feature/ai-telemetry-logging`
  - `feature/multi-report-comparison`
  - `feature/sso-integration`

#### **`bugfix/*`** - Bug Fixes
- **Branch from**: `develop`
- **Merge to**: `develop`
- **Naming**: `bugfix/issue-description`
- **Examples**:
  - `bugfix/oscal-validation-error`
  - `bugfix/status-badge-wrapping`
  - `bugfix/config-corruption`

#### **`hotfix/*`** - Critical Production Fixes
- **Branch from**: `main`
- **Merge to**: `main` AND `develop`
- **Naming**: `hotfix/critical-issue`
- **Examples**:
  - `hotfix/security-vulnerability`
  - `hotfix/data-loss-bug`
  - `hotfix/authentication-bypass`

#### **`experimental/*`** - Experimental Changes
- **Branch from**: `develop`
- **Merge to**: May never be merged
- **Naming**: `experimental/idea-name`
- **Examples**:
  - `experimental/graphql-api`
  - `experimental/realtime-collaboration`
  - `experimental/ai-model-comparison`

### Branch Lifecycle

```bash
# Create feature branch
git checkout develop
git pull origin develop
git checkout -b feature/my-new-feature

# Work on your feature
git add .
git commit -m "feat(backend): add new feature"

# Keep up to date with develop
git fetch origin
git rebase origin/develop

# Push to remote
git push origin feature/my-new-feature

# Create PR on GitHub
# After approval and merge, delete branch
git checkout develop
git pull origin develop
git branch -d feature/my-new-feature
```

---

## 📝 Commit Message Convention

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification.

### Format

```
type(scope): subject

[optional body]

[optional footer]
```

### Types

- **`feat`**: New feature
- **`fix`**: Bug fix
- **`docs`**: Documentation only changes
- **`style`**: Code style (formatting, semicolons, etc.)
- **`refactor`**: Code change that neither fixes bug nor adds feature
- **`perf`**: Performance improvement
- **`test`**: Adding or updating tests
- **`chore`**: Maintenance (dependencies, build, version bump, etc.)
- **`ci`**: CI/CD configuration changes
- **`build`**: Build system or external dependencies

### Scopes

- **`backend`**: Backend changes (server.js, APIs, services)
- **`frontend`**: Frontend changes (React components, UI)
- **`auth`**: Authentication/authorization/RBAC
- **`ai`**: AI integration (Ollama, Mistral, AWS Bedrock)
- **`docker`**: Docker/deployment configuration
- **`config`**: Configuration management
- **`docs`**: Documentation files
- **`release`**: Version bumps and releases

### Subject Guidelines

- Use imperative mood ("add" not "added" or "adds")
- Don't capitalize first letter
- No period at end
- Max 72 characters
- Be specific and descriptive

### Examples

```bash
# Good commit messages
git commit -m "feat(backend): add OpenTelemetry AI logging with ECS compliance"
git commit -m "fix(frontend): correct status badge wrapping issue"
git commit -m "docs(readme): update port references to 3020/3021"
git commit -m "refactor(auth): extract RBAC into separate module"
git commit -m "chore(deps): update React to 18.3.0"
git commit -m "perf(backend): optimize OSCAL validation with caching"

# Bad commit messages
git commit -m "updates"
git commit -m "Fixed bug"
git commit -m "Added new feature to the backend server"
git commit -m "WIP"
```

### Multi-line Commits

For complex changes, provide a body:

```bash
git commit -m "feat(backend): add atomic file operations

- Implement atomicWrite.js utility with temp file + rename pattern
- Update configManager.js to use atomic writes
- Update userManager.js to use atomic writes
- Add automatic backup creation before writes
- Prevents config corruption on crashes

Closes #123"
```

---

## 🔄 Pull Request Process

### 1. Create Your Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

- Write clean, readable code
- Follow existing code style
- Add comments for complex logic
- Update documentation as needed

### 3. Test Locally

```bash
# Run development servers
npm run dev

# Verify no errors in browser console
# Test all affected functionality
# Run verification
./setup.sh verify
```

### 4. Commit Your Changes

```bash
# Stage changes
git add .

# Commit with conventional message
git commit -m "feat(scope): description"
```

### 5. Update Version (for releases only)

```bash
# Use the version bump script
./bump_version.sh patch "Brief description of changes"
```

### 6. Push to GitHub

```bash
git push origin feature/your-feature-name
```

### 7. Create Pull Request

- Go to GitHub repository
- Click "New Pull Request"
- Select `develop` as base branch
- Select your feature branch as compare branch
- Fill out the PR template completely
- Request review from maintainers

### 8. Address Review Comments

- Respond to all comments
- Make requested changes
- Push updates to the same branch
- Re-request review when ready

### 9. Merge

- Maintainer will merge when approved
- Delete your branch after merge
- Pull latest develop locally

---

## 👀 Code Review Guidelines

### As a Reviewer

#### Be Constructive
- ✅ "Consider extracting this into a separate function for reusability"
- ❌ "This code is terrible"

#### Check for Security
- Input validation present?
- No hardcoded credentials?
- Proper authentication/authorization?
- No SQL injection or XSS vulnerabilities?

#### Verify Tests Pass
- Code runs without errors?
- All functionality works as expected?
- No console errors?

#### Ensure Documentation
- README updated if needed?
- JSDoc comments added?
- ARCHITECTURE.md updated for structural changes?

#### Look for Consistency
- Follows existing code style?
- Uses existing utilities (no duplication)?
- Consistent naming conventions?

### As an Author

#### Keep PRs Focused
- One feature or fix per PR
- Avoid mixing unrelated changes
- Keep PRs under 500 lines if possible

#### Provide Context
- Clear PR description
- Link to related issues
- Explain design decisions
- Include screenshots for UI changes

#### Respond to Feedback
- Address all comments
- Ask questions if unclear
- Don't take feedback personally
- Update based on suggestions

#### Be Patient
- Reviews take time
- Maintainers may be busy
- Follow up politely if no response after 3 days

---

## 🛠️ Development Workflow

### Daily Development

```bash
# Start your day
git checkout develop
git pull origin develop
git checkout feature/your-feature

# Rebase if needed
git rebase develop

# Start development servers
npm run dev

# Make changes, test, commit
git add .
git commit -m "feat(scope): description"

# Push regularly
git push origin feature/your-feature
```

### Common Tasks

#### Adding a New API Endpoint

```javascript
// backend/server.js
import { authenticate, authorize } from './auth/middleware.js';
import { PERMISSIONS } from './auth/roles.js';

app.post('/api/your-endpoint',
  authenticate,                          // Require authentication
  authorize([PERMISSIONS.YOUR_PERM]),    // Check permissions
  async (req, res) => {
    try {
      // Validate input
      if (!req.body.requiredField) {
        return res.status(400).json({
          success: false,
          message: 'Missing required field'
        });
      }
      
      // Process request
      const result = await yourService.process(req.body);
      
      // Log important events
      logAIInteraction({
        // ... logging details
        context: {
          username: req.user.username,
          clientIp: req.ip,
          requestId: req.id
        }
      });
      
      // Return response
      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);
```

#### Adding a New React Component

```javascript
// frontend/src/components/YourComponent.jsx
/**
 * YourComponent - Brief description
 * 
 * @param {Object} props - Component props
 * @param {string} props.title - Title to display
 */
import React from 'react';
import './YourComponent.css';

export const YourComponent = ({ title }) => {
  return (
    <div className="your-component">
      <h2>{title}</h2>
    </div>
  );
};

export default YourComponent;
```

---

## 🧪 Testing Requirements

### Manual Testing

Before submitting a PR, test:

1. **Functionality**
   - Feature works as expected
   - Edge cases handled
   - Error cases handled gracefully

2. **UI/UX** (for frontend changes)
   - Responsive design works
   - No console errors
   - Accessibility considerations

3. **Integration**
   - Works with existing features
   - Doesn't break other functionality
   - API endpoints respond correctly

4. **Performance**
   - No significant slowdowns
   - Reasonable load times
   - No memory leaks

### Verification Script

```bash
# Run the verification script
./setup.sh verify

# Should check:
# - All files exist
# - No syntax errors
# - Dependencies installed
# - Ports available
```

### Future: Automated Testing

We plan to add:
- Jest for backend unit tests
- Vitest for frontend component tests
- Cypress for end-to-end tests
- CI/CD pipeline with GitHub Actions

---

## 📚 Documentation Standards

### Code Documentation

#### JSDoc for Functions

```javascript
/**
 * Calculate the total score for a control assessment
 * 
 * @param {Object} control - Control object
 * @param {string} control.id - Control ID
 * @param {string} control.status - Implementation status
 * @param {number} control.riskRating - Risk rating (1-5)
 * @returns {number} Total score
 * @throws {Error} If control is invalid
 * 
 * @example
 * const score = calculateScore({ 
 *   id: 'AC-1', 
 *   status: 'effective', 
 *   riskRating: 2 
 * });
 */
function calculateScore(control) {
  // Implementation
}
```

#### File Headers

```javascript
/**
 * Module Name - Brief description
 * 
 * Longer description of what this module does and why it exists.
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */
```

#### Inline Comments

```javascript
// WHY: pfSense anchors persist across reboots but are faster than filter_configure()
// Design Decision: Use anchors instead of direct firewall rules
// Trade-off: Rules not visible in GUI, but 100x faster updates
function applyFirewallRules(deviceIp, reason) {
  // Implementation
}
```

### Documentation Files

#### When to Update

- **README.md**: User-facing changes, new features, setup changes
- **ARCHITECTURE.md**: Structural changes, new modules, design decisions
- **DEPLOYMENT.md**: Deployment process changes
- **CONFIGURATION.md**: New configuration options
- **BEST_PRACTICES_IMPLEMENTATION.md**: New patterns, lessons learned

#### Documentation Checklist

- [ ] Clear and concise
- [ ] Examples provided
- [ ] Up to date with code
- [ ] No broken links
- [ ] Proper formatting (markdown)

---

## 🤝 Getting Help

### Resources

- **Documentation**: Check `docs/` folder first
- **Issues**: Search existing issues on GitHub
- **Discussions**: Use GitHub Discussions for questions
- **Email**: mukesh.kesharwani@adobe.com

### Asking Good Questions

When asking for help:

1. **Describe what you're trying to do**
2. **Show what you've tried**
3. **Include error messages** (full text)
4. **Provide context** (OS, Node version, etc.)
5. **Share relevant code** (use code blocks)

### Reporting Bugs

Use the bug report template:

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
What you expected to happen.

**Screenshots**
If applicable, add screenshots.

**Environment**
- OS: [e.g. macOS 14.0]
- Node.js: [e.g. 20.10.0]
- Browser: [e.g. Chrome 120]
- Version: [e.g. 1.2.7]
```

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## 🙏 Thank You!

Thank you for contributing to the OSCAL Report Generator V2! Your efforts help make compliance documentation easier for everyone.

**Questions?** Open an issue or reach out to the maintainers.

---

**Last Updated:** December 29, 2025  
**Maintainer:** Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
