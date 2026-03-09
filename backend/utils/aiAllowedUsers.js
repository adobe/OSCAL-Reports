/**
 * Allowed users check for AI "Get Suggestions" (chargeable providers only).
 * Used when provider is Mistral API Cloud or AWS Bedrock.
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 */

const MAX_PATTERNS = 5;

/**
 * Check if the current user is allowed to use Get Suggestions from AI.
 * @param {Object} user - Session user: { username, email } (from req.user)
 * @param {Object} aiConfig - Resolved aiConfig from getResolvedConfig()
 * @returns {boolean} - true if allowed, false otherwise
 */
function isUserAllowedForAISuggestions(user, aiConfig) {
  if (!aiConfig) return true;
  const provider = (aiConfig.provider || '').toLowerCase();
  if (provider !== 'mistral-api' && provider !== 'aws-bedrock') return true;

  const raw = (aiConfig.allowedUsersForAI != null) ? String(aiConfig.allowedUsersForAI).trim() : '';
  if (raw === '') return true;

  const patterns = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_PATTERNS);
  if (patterns.length === 0) return true;

  const username = (user?.username != null) ? String(user.username).trim().toLowerCase() : '';
  const email = (user?.email != null) ? String(user.email).trim().toLowerCase() : '';

  // When allow-list is set, user must have at least one of username or email to be evaluated
  if (!username && !email) return false;

  const hasWildcard = patterns.some(p => p.includes('*'));
  // Wildcard patterns (e.g. *@adobe.com) match only by email; without email we cannot allow
  if (hasWildcard && !email) return false;

  for (const pattern of patterns) {
    const p = pattern.trim().toLowerCase();
    if (!p) continue;
    if (p.includes('*')) {
      const suffix = p.replace(/\*/, '').toLowerCase();
      if (suffix && email && email.endsWith(suffix)) return true;
    } else {
      if (username === p || email === p || (email && email.startsWith(p + '@'))) return true;
    }
  }
  return false;
}

export { isUserAllowedForAISuggestions };
