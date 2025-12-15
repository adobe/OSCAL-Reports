/**
 * Build Information Utility
 * Provides version and build details for the application
 */

// Import version from package.json
import packageJson from '../../package.json';

// Get build timestamp (injected by Vite during build, or current time in dev)
const BUILD_TIMESTAMP = import.meta.env.VITE_BUILD_TIME || new Date().toISOString();
const BUILD_ENV = import.meta.env.MODE || 'production';

export const buildInfo = {
  version: packageJson.version,
  buildTime: BUILD_TIMESTAMP,
  environment: BUILD_ENV,
  isDevelopment: BUILD_ENV === 'development',
  isProduction: BUILD_ENV === 'production',
  
  // Get formatted build info string
  getFormattedInfo() {
    const date = new Date(this.buildTime);
    const formattedDate = date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    
    if (this.isDevelopment) {
      return `v${this.version} (DEV)`;
    }
    
    return `v${this.version} (Build: ${formattedDate})`;
  },
  
  // Get short version string
  getShortVersion() {
    return `v${this.version}${this.isDevelopment ? '-dev' : ''}`;
  },
  
  // Get detailed info object
  getDetails() {
    const buildDate = new Date(this.buildTime);
    return {
      version: this.version,
      buildTime: this.buildTime,
      environment: this.environment,
      formattedBuildTime: buildDate.toLocaleString()
    };
  }
};

export default buildInfo;

