/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React from 'react';
import buildInfo, { PROJECT_LINKS } from '../utils/buildInfo';

/**
 * Author credits block shown at the bottom of main app views.
 *
 * @param {{ showTechStack?: boolean, className?: string }} props
 * @returns {JSX.Element}
 */
export const AuthorCreditsFooter = ({ showTechStack = false, className = '' }) => (
  <p className={className}>
    <strong>Made with Passion by Mukesh Kesharwani</strong>
    <br />
    <small>
      mukesh.kesharwani@adobe.com | Adobe
      {showTechStack ? ' - Built with React and Node.js' : ''}
    </small>
    <br />
    <small style={{ opacity: 0.7, fontSize: '0.85em' }}>
      {buildInfo.getFormattedInfo()} |{' '}
      {buildInfo.environment === 'development' ? '🔧 Development Mode' : '🚀 Production Build'}
    </small>
    <br />
    <small className="author-credits-links">
      <a href={PROJECT_LINKS.githubRepo} target="_blank" rel="noopener noreferrer" title="Source code, issues, and contributions">
        GitHub repository
      </a>
      {' · '}
      <a href={PROJECT_LINKS.dockerHub} target="_blank" rel="noopener noreferrer" title="Pull published Docker images">
        Docker Hub images
      </a>
      {' — fork, contribute, or pull images to test'}
    </small>
  </p>
);

export default AuthorCreditsFooter;
