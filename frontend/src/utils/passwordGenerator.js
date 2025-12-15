/**
 * Password Generator for Default Credentials (Frontend)
 * Generates password in format: username#DDMMYYHH
 * Where DD=day, MM=month, YY=last 2 digits of year, HH=hour (24-hour format)
 * Note: The $ in "username#$DDMMYYHH" is just notation - actual format is username#DDMMYYHH
 * 
 * This matches the backend password generation logic
 */

/**
 * Generate default password based on timestamp
 * Format: username#DDMMYYHH (no literal $ character)
 * @param {string} username - Username (e.g., "admin", "user", "assessor")
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
 * Get default passwords for all default users
 * @param {Date} buildDate - Optional build date (defaults to current time)
 * @returns {Object} - Object with username as key and password as value
 */
export function getDefaultPasswords(buildDate = new Date()) {
  return {
    admin: generateDefaultPassword('admin', buildDate),
    user: generateDefaultPassword('user', buildDate),
    assessor: generateDefaultPassword('assessor', buildDate)
  };
}

export default {
  generateDefaultPassword,
  getDefaultPasswords
};

