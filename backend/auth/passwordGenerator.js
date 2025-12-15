/**
 * Password Generator for Default Credentials
 * Generates password in format: username#DDMMYYHH
 * Where DD=day, MM=month, YY=last 2 digits of year, HH=hour (24-hour format, UTC)
 * Note: Uses UTC time to match Dockerfile's build-time password generation
 */

/**
 * Generate default password based on build timestamp
 * Format: username#DDMMYYHH (no literal $ character)
 * @param {string} username - Username (e.g., "admin")
 * @param {Date} buildDate - Build date/time (defaults to current date/time)
 * @returns {string} - Generated password
 */
export function generateDefaultPassword(username, buildDate = new Date()) {
  // Use UTC to match Dockerfile's UTC-based password generation
  const day = String(buildDate.getUTCDate()).padStart(2, '0');      // DD (2 digits)
  const month = String(buildDate.getUTCMonth() + 1).padStart(2, '0'); // MM (2 digits, 1-12)
  const year = String(buildDate.getUTCFullYear()).slice(-2);        // YY (last 2 digits)
  const hour = String(buildDate.getUTCHours()).padStart(2, '0');    // HH (2 digits, 00-23)
  
  return `${username}#${day}${month}${year}${hour}`;
}

/**
 * Generate default password from environment variable BUILD_TIMESTAMP
 * Falls back to current date/time if BUILD_TIMESTAMP is not set
 * @param {string} username - Username (e.g., "admin")
 * @returns {string} - Generated password
 */
export function generateDefaultPasswordFromEnv(username) {
  let buildDate = new Date();
  
  // Try to get BUILD_TIMESTAMP from environment (ISO format: YYYY-MM-DDTHH:mm:ss.sssZ)
  if (process.env.BUILD_TIMESTAMP) {
    try {
      buildDate = new Date(process.env.BUILD_TIMESTAMP);
      // Validate date
      if (isNaN(buildDate.getTime())) {
        console.warn('⚠️ Invalid BUILD_TIMESTAMP, using current date/time');
        buildDate = new Date();
      }
    } catch (error) {
      console.warn('⚠️ Error parsing BUILD_TIMESTAMP, using current date/time:', error.message);
      buildDate = new Date();
    }
  }
  
  return generateDefaultPassword(username, buildDate);
}

export default {
  generateDefaultPassword,
  generateDefaultPasswordFromEnv
};

