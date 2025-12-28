# Pull Request

## Description
<!-- Provide a brief description of your changes -->



## Type of Change
- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Code refactoring
- [ ] Performance improvement
- [ ] Dependency update

## Related Issues
<!-- Link to related issues using #issue_number -->

Closes #

## Changes Made
<!-- List the main changes in this PR -->

- 
- 
- 

---

## Quality Checklist

### Code Quality
- [ ] Code follows project naming conventions (camelCase functions, PascalCase components)
- [ ] All JavaScript files have valid syntax (`node -c file.js` passes)
- [ ] No `console.log` statements left in production code
- [ ] Functions have JSDoc comments for public APIs
- [ ] Complex logic has explanatory comments
- [ ] No commented-out code blocks

### Testing
- [ ] Tested locally with `npm run dev`
- [ ] Tested Docker build successfully
- [ ] Tested production build
- [ ] No linter errors or warnings
- [ ] Edge cases have been considered
- [ ] Error handling has been tested

### Security
- [ ] No hardcoded credentials or API keys
- [ ] Input validation added for new endpoints
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities  
- [ ] Sensitive data is not logged
- [ ] Authentication/authorization properly implemented

### Documentation
- [ ] README.md updated (if user-facing changes)
- [ ] ARCHITECTURE.md updated (if structural changes)
- [ ] API documentation updated (if endpoint changes)
- [ ] Inline code comments added where needed
- [ ] BEST_PRACTICES.md updated (if new patterns introduced)

### Consistency
- [ ] Matches existing code style
- [ ] Uses existing utilities (no code duplication)
- [ ] Follows RESTful conventions for APIs
- [ ] Consistent error response format used
- [ ] Follows OSCAL sanitization patterns (if applicable)

### Version Management (for releases only)
- [ ] Version bumped in all package.json files (root, backend, frontend)
- [ ] CHANGELOG.md updated with changes
- [ ] Git tag created for release (vX.Y.Z)
- [ ] Documentation reflects new version

---

## Screenshots
<!-- If applicable, add screenshots to help explain your changes -->



## Additional Notes
<!-- Any additional information that reviewers should know -->



## Reviewer Checklist
<!-- For reviewers to complete -->

- [ ] Code review completed
- [ ] Logic is sound
- [ ] No obvious bugs
- [ ] Security considerations addressed
- [ ] Documentation is adequate
- [ ] Tests pass (if applicable)
- [ ] Ready to merge

---

**Reviewer:** @<!-- mention reviewer -->

**Target Branch:** `develop` / `main`

