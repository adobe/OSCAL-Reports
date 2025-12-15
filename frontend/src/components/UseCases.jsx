/**
 * UseCases Component - Display application use cases with visual presentation
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import React from 'react';
import buildInfo from '../utils/buildInfo';
import './UseCases.css';

function UseCases({ onGetStarted, onMultiReportComparison }) {
  const useCases = [
    {
      id: 1,
      icon: '🆕',
      title: 'Fresh Deployment for New AMS Platform Implementation',
      subtitle: 'Meet New Regulatory Standards',
      description: 'Starting from scratch with a new compliance framework',
      features: [
        'Select from Australian ISM, NIST SP 800-53, Singapore IM8, Canadian CCCS, or custom OSCAL catalogs',
        'Choose appropriate security classification level',
        'Document controls from the ground up',
        'Generate complete SSP documentation'
      ],
      workflow: [
        { step: 1, action: 'Start New Report', icon: '✨' },
        { step: 2, action: 'Select Catalog', icon: '📚' },
        { step: 3, action: 'Enter System Info', icon: '🖥️' },
        { step: 4, action: 'Document Controls', icon: '📝' },
        { step: 5, action: 'Export SSP', icon: '📤' }
      ],
      color: 'blue',
      featureComparison: [
        { feature: 'Load Existing Report', value: '❌' },
        { feature: 'Catalog Selection', value: '✅ New' },
        { feature: 'Control Documentation', value: '✅ Full' },
        { feature: 'Change Tracking', value: '❌' },
        { feature: 'Export Formats', value: '✅ All (JSON, Excel, PDF, CCM)' }
      ]
    },
    {
      id: 2,
      icon: '🔄',
      title: 'Update Existing Assessment',
      subtitle: 'Update Classification or Catalog Version',
      description: 'Already have an OSCAL report? Update to new standards',
      features: [
        'Load your existing OSCAL SSP JSON file',
        'Upgrade to higher classification level',
        'Update to latest catalog version',
        'Preserve all existing control data'
      ],
      workflow: [
        { step: 1, action: 'Load Existing Report', icon: '📂' },
        { step: 2, action: 'Update Catalog', icon: '🔄' },
        { step: 3, action: 'Review Changes', icon: '🔍' },
        { step: 4, action: 'Update Controls', icon: '✏️' },
        { step: 5, action: 'Export Updated SSP', icon: '📤' }
      ],
      color: 'green',
      featureComparison: [
        { feature: 'Load Existing Report', value: '✅' },
        { feature: 'Catalog Selection', value: '✅ Update' },
        { feature: 'Control Documentation', value: '✅ Incremental' },
        { feature: 'Change Tracking', value: '✅' },
        { feature: 'Export Formats', value: '✅ All' }
      ]
    },
    {
      id: 3,
      icon: '📊',
      title: 'Analyse Changes/Improvements in Solution',
      subtitle: 'Track Updates Since Last Assessment',
      description: 'Compare your current assessment with new standard references',
      features: [
        'Compare old vs new catalog versions',
        'Identify new controls added',
        'Detect modified control requirements',
        'Generate change summary report'
      ],
      workflow: [
        { step: 1, action: 'Load Existing SSP', icon: '📂' },
        { step: 2, action: 'Select New Catalog', icon: '📚' },
        { step: 3, action: 'Auto-Compare', icon: '⚖️' },
        { step: 4, action: 'Review Changes', icon: '📋' },
        { step: 5, action: 'Export Report', icon: '📊' }
      ],
      color: 'purple',
      featureComparison: [
        { feature: 'Load Existing Report', value: '✅' },
        { feature: 'Catalog Selection', value: '✅ Compare' },
        { feature: 'Control Documentation', value: '✅ Changed Only' },
        { feature: 'Change Tracking', value: '✅ Detailed' },
        { feature: 'Export Formats', value: '✅ All + Summary' }
      ]
    },
    {
      id: 4,
      icon: '📊',
      title: 'Multi-Report Comparison',
      subtitle: 'Compare CSP Reports with Your Baseline',
      description: 'Compare your report with multiple Cloud Service Provider (IaaS/PaaS/SaaS) reports',
      features: [
        'Upload up to 3 OSCAL reports for comparison',
        'Compare baseline with IaaS, PaaS, SaaS providers',
        'Identify control differences across platforms',
        'Track catalog version changes',
        'Fetch published SOA/CCM from configured URL'
      ],
      workflow: [
        { step: 1, action: 'Load Baseline Report', icon: '📄' },
        { step: 2, action: 'Upload CSP Reports', icon: '☁️' },
        { step: 3, action: 'Compare Controls', icon: '⚖️' },
        { step: 4, action: 'Review Differences', icon: '🔍' },
        { step: 5, action: 'Analyze Results', icon: '📊' }
      ],
      color: 'orange',
      isSpecial: true,
      featureComparison: [
        { feature: 'Load Existing Report', value: '✅ Multiple' },
        { feature: 'Catalog Selection', value: '✅ Auto-detect' },
        { feature: 'Control Documentation', value: '❌' },
        { feature: 'Change Tracking', value: '✅ Multi-source' },
        { feature: 'Export Formats', value: '✅ Comparison Report' }
      ]
    }
  ];

  return (
    <div className="usecases-container">
      <div className="usecases-header">
        <h1>🛡️ OSCAL Report Generator</h1>
        <h2>Four Powerful Use Cases for Compliance Management</h2>
        <p className="subtitle">
          Choose your scenario and let us guide you through the process
        </p>
      </div>

      <div className="usecases-grid">
        {useCases.map((useCase) => (
          <div key={useCase.id} className={`usecase-card usecase-${useCase.color}`}>
            <div className="usecase-header">
              <span className="usecase-icon">{useCase.icon}</span>
              <div className="usecase-title-section">
                <h3>{useCase.title}</h3>
                <p className="usecase-subtitle">{useCase.subtitle}</p>
              </div>
            </div>

            <p className="usecase-description">{useCase.description}</p>

            <div className="usecase-features">
              <h4>Key Features:</h4>
              <ul>
                {useCase.features.map((feature, idx) => (
                  <li key={idx}>
                    <span className="check-icon">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            <div className="usecase-workflow">
              <h4>Workflow:</h4>
              <div className="workflow-steps">
                {useCase.workflow.map((step, idx) => (
                  <div key={idx} className="workflow-step">
                    <div className="step-number">{step.step}</div>
                    <div className="step-icon">{step.icon}</div>
                    <div className="step-action">{step.action}</div>
                    {idx < useCase.workflow.length - 1 && (
                      <div className="step-arrow">→</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Feature Comparison Tooltip - Same for all cards */}
            <div className="feature-comparison-tooltip">
              <div className="tooltip-header">📋 Feature Comparison</div>
              <table className="tooltip-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Fresh Deployment</th>
                    <th>Update Existing</th>
                    <th>Analyse Changes</th>
                    <th>Multi Reports Comparision</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Load Existing Report</td>
                    <td>❌</td>
                    <td>✅</td>
                    <td>✅</td>
                    <td>✅ Multiple</td>
                  </tr>
                  <tr>
                    <td>Catalog Selection</td>
                    <td>✅ New</td>
                    <td>✅ Update</td>
                    <td>✅ Compare</td>
                    <td>✅ Auto-detect</td>
                  </tr>
                  <tr>
                    <td>Control Documentation</td>
                    <td>✅ Full</td>
                    <td>✅ Incremental</td>
                    <td>✅ Changed Only</td>
                    <td>❌</td>
                  </tr>
                  <tr>
                    <td>Change Tracking</td>
                    <td>❌</td>
                    <td>✅</td>
                    <td>✅ Detailed</td>
                    <td>✅ Multi-source</td>
                  </tr>
                  <tr>
                    <td>Export Formats</td>
                    <td>✅ All (JSON, Excel, PDF, CCM)</td>
                    <td>✅ All</td>
                    <td>✅ All + Summary</td>
                    <td>✅ Comparison Report</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <button 
              className={`btn btn-${useCase.color} usecase-btn`}
              onClick={useCase.isSpecial ? onMultiReportComparison : onGetStarted}
            >
              {useCase.isSpecial ? 'Launch Multi-Report Comparison' : 'Get Started with This Use Case'}
            </button>
          </div>
        ))}
      </div>

      <div className="usecases-footer">

        <div className="info-boxes">
          <div className="info-box">
            <span className="info-icon">📚</span>
            <h4>Supported Frameworks</h4>
            <p>Australian ISM (5 baselines), NIST SP 800-53 Rev 5 (Full + 3 baselines), Singapore IM8 Reform, Canadian CCCS (6 profiles), and custom OSCAL catalogs</p>
          </div>
          <div className="info-box">
            <span className="info-icon">📊</span>
            <h4>Export Formats</h4>
            <p>OSCAL JSON, Excel, PDF, Cloud Control Matrix (CCM)</p>
          </div>
          <div className="info-box">
            <span className="info-icon">💾</span>
            <h4>User and Assessor Role Data Persistence</h4>
            <p>
              Your work data stays locally on your laptop—your data is safe. 
              Auto-save occurs every 2 seconds using browser local storage.
            </p>
            <p style={{ marginTop: '0.5rem' }}>
              <span style={{ fontWeight: 'bold', color: '#d32f2f' }}>⚠️ Important:</span> Export OSCAL before exiting and clear browser local storage.
            </p>
          </div>
        </div>
      </div>

      <div className="usecases-credits">
        <p>
          <strong>Made with Passion by Mukesh Kesharwani</strong><br />
          <small>mukesh.kesharwani@adobe.com | Adobe</small><br />
          <small style={{ opacity: 0.7, fontSize: '0.85em' }}>
            {buildInfo.getFormattedInfo()} | {buildInfo.environment === 'development' ? '🔧 Development Mode' : '🚀 Production Build'}
          </small>
        </p>
      </div>
    </div>
  );
}

export default UseCases;

