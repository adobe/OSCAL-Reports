/**
 * Footer - Application footer with branding and version
 * 
 * Part of OSCAL Report Generator V2
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (C) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import React from 'react';
import './Footer.css';

/**
 * Footer component - Displays application branding, version, and links
 * 
 * @returns {JSX.Element} Rendered footer component
 */
export const Footer = () => {
  // Get build info from Vite environment
  const buildInfo = import.meta.env.VITE_BUILD_TIME || 'Development Build';
  const version = '1.3.0';  // Should match package.json version
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="app-footer">
      <div className="footer-content">
        <div className="footer-main">
          <strong>OSCAL Report Generator V2</strong>
          <span className="divider">|</span>
          <span className="version">Version {version}</span>
          <span className="divider">|</span>
          <span className="author">
            Built with Passion by <strong>Mukesh Kesharwani</strong>
          </span>
          <span className="divider">|</span>
          <span className="copyright">© {currentYear} Keekar</span>
        </div>
        
        <div className="footer-links">
          <a 
            href="https://github.com/keekar2022/OSCAL-Reports/blob/main/docs/ARCHITECTURE.md" 
            target="_blank" 
            rel="noopener noreferrer"
            title="View Technical Architecture"
          >
            Architecture
          </a>
          <span className="divider">•</span>
          <a 
            href="https://github.com/keekar2022/OSCAL-Reports/blob/main/docs/DEPLOYMENT.md" 
            target="_blank" 
            rel="noopener noreferrer"
            title="View Deployment Guide"
          >
            Deployment
          </a>
          <span className="divider">•</span>
          <a 
            href="https://github.com/keekar2022/OSCAL-Reports/blob/main/docs/CONFIGURATION.md" 
            target="_blank" 
            rel="noopener noreferrer"
            title="View Configuration Guide"
          >
            Configuration
          </a>
          <span className="divider">•</span>
          <a 
            href="https://github.com/keekar2022/OSCAL-Reports" 
            target="_blank" 
            rel="noopener noreferrer"
            title="View on GitHub"
          >
            GitHub
          </a>
          <span className="divider">•</span>
          <a 
            href="https://github.com/keekar2022/OSCAL-Reports/blob/main/LICENSE" 
            target="_blank" 
            rel="noopener noreferrer"
            title="GPL-3.0-or-later License"
          >
            License
          </a>
        </div>
        
        <div className="footer-build-info" title={buildInfo}>
          Build: {buildInfo.substring(0, 19)}
        </div>
      </div>
    </footer>
  );
};

export default Footer;

