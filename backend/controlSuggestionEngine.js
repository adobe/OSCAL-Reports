/**
 * Control Suggestion Engine
 * Provides automated suggestions for control implementations based on patterns, templates, and best practices
 * Enhanced with Mistral 7B AI for implementation text generation
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import { generateImplementationWithMistral } from './mistralService.js';
import { loadConfig } from './configManager.js';

/**
 * Helper function to truncate implementation text to 250 characters
 * Ensures text aligns with existing implementation descriptions
 */
function truncateImplementationText(text) {
  if (!text || text.length <= 250) {
    return text ? text.replace(/\s+/g, ' ').trim() : text;
  }
  
  const MAX_LENGTH = 250;
  let truncated = text.substring(0, MAX_LENGTH);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastSpace = truncated.lastIndexOf(' ');
  
  // Prefer sentence boundary, then word boundary
  if (lastPeriod > MAX_LENGTH * 0.7) {
    truncated = truncated.substring(0, lastPeriod + 1);
  } else if (lastSpace > MAX_LENGTH * 0.7) {
    truncated = truncated.substring(0, lastSpace);
  }
  
  return truncated.trim().replace(/\s+/g, ' ');
}

/**
 * Control implementation templates based on control families and types
 */
const CONTROL_TEMPLATES = {
  // Access Control Family
  'AC': {
    'access-control': {
      status: 'effective',
      implementation: 'Access control is implemented through role-based access control (RBAC) system. Users are assigned roles based on their job functions, and access permissions are granted according to the principle of least privilege. Access requests are reviewed and approved by authorized personnel.',
      responsibleParty: 'Shared',
      controlType: 'Automated',
      testingMethod: 'Automated by Tools',
      testingFrequency: 'Continuous',
      riskRating: 'Low'
    }
  },
  // Audit and Accountability
  'AU': {
    'audit-logging': {
      status: 'effective',
      implementation: 'System maintains comprehensive audit logs of all security-relevant events including user authentication, authorization decisions, data access, and administrative actions. Logs are stored securely, protected from tampering, and reviewed regularly.',
      responsibleParty: 'Shared',
      controlType: 'Automated',
      testingMethod: 'Automated by Tools',
      testingFrequency: 'Daily',
      riskRating: 'Low'
    }
  },
  // Configuration Management
  'CM': {
    'configuration-management': {
      status: 'effective',
      implementation: 'System configurations are managed through version-controlled configuration management system. Baseline configurations are established, documented, and maintained. Changes to configurations require approval and are tracked through change management process.',
      responsibleParty: 'Shared',
      controlType: 'Orchestrated',
      testingMethod: 'Manual Testing',
      testingFrequency: 'Monthly',
      riskRating: 'Medium'
    }
  },
  // Identification and Authentication
  'IA': {
    'authentication': {
      status: 'effective',
      implementation: 'Multi-factor authentication (MFA) is required for all user accounts. Authentication mechanisms include password-based authentication combined with additional factors such as SMS codes, authenticator apps, or hardware tokens.',
      responsibleParty: 'Shared',
      controlType: 'Automated',
      testingMethod: 'Automated by Tools',
      testingFrequency: 'Continuous',
      riskRating: 'Low'
    }
  },
  // Incident Response
  'IR': {
    'incident-response': {
      status: 'effective',
      implementation: 'Incident response procedures are documented and tested regularly. Security incidents are detected, analyzed, contained, and remediated according to established procedures. Incident response team is trained and ready to respond to security events.',
      responsibleParty: 'Shared',
      controlType: 'Process',
      testingMethod: 'Manual Testing',
      testingFrequency: 'Quarterly',
      riskRating: 'Medium'
    }
  },
  // System and Communications Protection
  'SC': {
    'encryption': {
      status: 'effective',
      implementation: 'Data in transit is protected using TLS 1.2 or higher. Data at rest is encrypted using industry-standard encryption algorithms. Encryption keys are managed securely and rotated regularly.',
      responsibleParty: 'Shared',
      controlType: 'Automated',
      testingMethod: 'Automated by Tools',
      testingFrequency: 'Continuous',
      riskRating: 'Low'
    },
    'network-security': {
      status: 'effective',
      implementation: 'Network security is implemented through firewalls, intrusion detection/prevention systems, and network segmentation. Network traffic is monitored and analyzed for suspicious activities.',
      responsibleParty: 'Shared',
      controlType: 'Automated',
      testingMethod: 'Automated by Tools',
      testingFrequency: 'Continuous',
      riskRating: 'Low'
    }
  },
  // System and Information Integrity
  'SI': {
    'malware-protection': {
      status: 'effective',
      implementation: 'Anti-malware software is installed and configured on all systems. Malware definitions are updated automatically. Systems are scanned regularly for malware, and detected threats are quarantined and removed.',
      responsibleParty: 'Shared',
      controlType: 'Automated',
      testingMethod: 'Automated by Tools',
      testingFrequency: 'Daily',
      riskRating: 'Low'
    },
    'vulnerability-management': {
      status: 'effective',
      implementation: 'Vulnerability scanning is performed regularly using automated tools. Identified vulnerabilities are prioritized based on severity and remediated according to established timelines. Patch management process ensures timely application of security updates.',
      responsibleParty: 'Shared',
      controlType: 'Orchestrated',
      testingMethod: 'Automated by Tools',
      testingFrequency: 'Weekly',
      riskRating: 'Medium'
    }
  }
};

/**
 * Pattern matching keywords for control identification
 */
const CONTROL_PATTERNS = {
  'access': ['AC', 'access', 'authorization', 'permission', 'privilege', 'rbac', 'role'],
  'audit': ['AU', 'audit', 'logging', 'log', 'monitoring', 'accountability'],
  'authentication': ['IA', 'authentication', 'identity', 'mfa', 'multi-factor', 'password', 'credential'],
  'encryption': ['SC', 'encryption', 'encrypt', 'cryptography', 'tls', 'ssl', 'cipher'],
  'network': ['SC', 'network', 'firewall', 'ids', 'ips', 'segmentation', 'traffic'],
  'incident': ['IR', 'incident', 'response', 'breach', 'security event'],
  'vulnerability': ['SI', 'vulnerability', 'patch', 'update', 'scanning', 'cve'],
  'malware': ['SI', 'malware', 'antivirus', 'anti-malware', 'virus', 'threat'],
  'configuration': ['CM', 'configuration', 'baseline', 'change management', 'config'],
  'backup': ['CP', 'backup', 'recovery', 'disaster', 'continuity'],
  'training': ['AT', 'training', 'awareness', 'education', 'user'],
  'physical': ['PE', 'physical', 'facility', 'environment', 'access control']
};

/**
 * Suggest control implementation based on control ID, title, and description
 * @param {Object} control - Control object with id, title, description, etc.
 * @param {Array} existingControls - Array of existing controls for pattern learning
 * @returns {Object} - Suggested implementation details
 */
export async function suggestControlImplementation(control, existingControls = []) {
  // Load organization name from config for AI-generated message
  let organizationName = 'Adobe'; // Default fallback
  try {
    const config = await loadConfig();
    organizationName = config.aiConfig?.organizationName || 'Adobe';
  } catch (error) {
    // Use default if config load fails
    console.warn('Could not load organization name from config, using default');
  }
  
  try {
    const suggestions = {
      status: null,
      implementation: null,
      responsibleParty: null,
      controlType: null,
      testingMethod: null,
      testingFrequency: null,
      riskRating: null,
      confidence: 0,
      reasoning: []
    };

    // Extract control family from ID (e.g., AC-1 -> AC, ism-1564 -> ism)
    const controlFamily = control.id ? control.id.split('-')[0].toUpperCase() : null;
    
    // Clean up control title - remove "Control:" prefix if present
    let controlTitle = (control.title || '').trim();
    if (controlTitle.toLowerCase().startsWith('control:')) {
      controlTitle = controlTitle.substring(8).trim();
    }
    controlTitle = controlTitle.toLowerCase();
    
    // Build description from parts if available, otherwise use description field
    let controlDescription = '';
    if (control.parts && Array.isArray(control.parts) && control.parts.length > 0) {
      // Extract prose from parts, prioritizing statement/objective parts
      const statementParts = control.parts.filter(p => 
        p.name === 'statement' || p.name === 'objective' || p.name === 'item'
      );
      const partsToUse = statementParts.length > 0 ? statementParts : control.parts;
      controlDescription = partsToUse
        .map(part => (part.prose || part.title || part.name || ''))
        .filter(text => text.length > 0)
        .join(' ')
        .toLowerCase();
    }
    
    // Fallback to description field if no parts
    if (!controlDescription && control.description) {
      controlDescription = control.description.toLowerCase();
    }
    
    const searchText = `${controlTitle} ${controlDescription}`.toLowerCase();
    
    // Debug logging (development only)
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Analyzing control ${control.id}:`, {
        controlFamily,
        controlTitle: control.title,
        cleanedTitle: controlTitle,
        descriptionLength: controlDescription.length,
        descriptionPreview: controlDescription.substring(0, 100),
        searchTextLength: searchText.length,
        hasParts: !!control.parts,
        partsCount: control.parts?.length || 0
      });
    }

    // Strategy 1: Match against control family templates
    // Note: ISM controls use "ism" prefix, not standard NIST families
    if (controlFamily && CONTROL_TEMPLATES[controlFamily]) {
      const templates = CONTROL_TEMPLATES[controlFamily];
      
      // Find best matching template
      for (const [key, template] of Object.entries(templates)) {
        if (searchText.includes(key) || controlTitle.includes(key)) {
          // Apply template but truncate implementation to 250 chars
          const templateCopy = { ...template };
          if (templateCopy.implementation) {
            templateCopy.implementation = truncateImplementationText(templateCopy.implementation);
          }
          Object.assign(suggestions, templateCopy);
          suggestions.confidence = 0.8;
          suggestions.reasoning.push(`Matched template for ${controlFamily} family control: ${key}`);
          break;
        }
      }
    }
    
    // For ISM controls, try pattern matching first since they don't use standard families
    if (controlFamily === 'ISM' && suggestions.confidence === 0) {
      // ISM controls need keyword-based matching
      for (const [category, keywords] of Object.entries(CONTROL_PATTERNS)) {
        const matchCount = keywords.filter(keyword => 
          searchText.includes(keyword.toLowerCase())
        ).length;
        
        if (matchCount >= 2) {
          const template = findTemplateByCategory(category);
          if (template) {
            // Apply template but truncate implementation to 250 chars
            const templateCopy = { ...template };
            if (templateCopy.implementation) {
              templateCopy.implementation = truncateImplementationText(templateCopy.implementation);
            }
            Object.assign(suggestions, templateCopy);
            suggestions.confidence = 0.75;
            suggestions.reasoning.push(`Pattern matched ISM control: ${category} (${matchCount} keywords)`);
            break;
          }
        }
      }
    }

    // Strategy 2: Pattern matching based on keywords
    if (suggestions.confidence < 0.7) {
      for (const [category, keywords] of Object.entries(CONTROL_PATTERNS)) {
        const matchCount = keywords.filter(keyword => 
          searchText.includes(keyword.toLowerCase())
        ).length;
        
        if (matchCount >= 2) {
          // Found strong pattern match
          const template = findTemplateByCategory(category);
          if (template) {
            // Apply template but truncate implementation to 250 chars
            const templateCopy = { ...template };
            if (templateCopy.implementation) {
              templateCopy.implementation = truncateImplementationText(templateCopy.implementation);
            }
            Object.assign(suggestions, templateCopy);
            suggestions.confidence = 0.7;
            suggestions.reasoning.push(`Pattern matched: ${category} (${matchCount} keywords)`);
            break;
          }
        }
      }
    }

    // Strategy 3: Learn from similar existing controls
    let similarControlsFound = [];
    let similarControlsUsed = false;
    if (existingControls && existingControls.length > 0 && suggestions.confidence < 0.6) {
      similarControlsFound = findSimilarControls(control, existingControls);
      if (similarControlsFound.length > 0) {
        const avgSuggestion = averageSimilarControls(similarControlsFound);
        // Only use implementation if it's unique (not copied from all similar controls)
        if (avgSuggestion.implementation) {
          Object.assign(suggestions, avgSuggestion);
          suggestions.confidence = 0.6;
          similarControlsUsed = true;
          // Only add reasoning if similar controls were actually used
          suggestions.reasoning.push(`Learned from ${similarControlsFound.length} similar existing control${similarControlsFound.length !== 1 ? 's' : ''}`);
        } else {
          // Use other fields but generate unique implementation
          Object.assign(suggestions, {
            status: avgSuggestion.status,
            responsibleParty: avgSuggestion.responsibleParty,
            controlType: avgSuggestion.controlType,
            testingMethod: avgSuggestion.testingMethod,
            testingFrequency: avgSuggestion.testingFrequency,
            riskRating: avgSuggestion.riskRating
          });
          suggestions.confidence = 0.6;
          similarControlsUsed = true;
          // Only add reasoning if similar controls were actually used
          suggestions.reasoning.push(`Learned structure from ${similarControlsFound.length} similar control${similarControlsFound.length !== 1 ? 's' : ''}, generating unique implementation`);
        }
      }
    }

    // Strategy 4: Default suggestions based on control type
    if (suggestions.confidence < 0.5) {
      const defaultSuggestion = getDefaultSuggestion(control);
      Object.assign(suggestions, defaultSuggestion);
      suggestions.confidence = 0.4;
      suggestions.reasoning.push('Applied default suggestions based on control characteristics');
    }

    // Ensure all fields have values
    suggestions.status = suggestions.status || 'not-assessed';
    suggestions.responsibleParty = suggestions.responsibleParty || 'Shared';
    suggestions.controlType = suggestions.controlType || 'Orchestrated';
    suggestions.testingMethod = suggestions.testingMethod || 'Manual Testing';
    suggestions.testingFrequency = suggestions.testingFrequency || 'Quarterly';
    suggestions.riskRating = suggestions.riskRating || 'Medium';

    // ALWAYS generate implementation text using Mistral 7B (even if other fields came from templates)
    // This ensures unique, context-aware implementation text for each control
    const templateImplementation = suggestions.implementation; // Save template implementation as fallback
    suggestions.implementation = null; // Clear to force Mistral generation
    
    let mistralUsed = false;
    let mistralError = null;
    let mistralAttempted = false;
    
    try {
      console.log(`🤖 Attempting to generate implementation with Mistral for control: ${control.id}`);
      mistralAttempted = true;
      // Try Mistral 7B for implementation text generation
      // Pass existing controls to learn writing style
      const mistralResult = await generateImplementationWithMistral(
        control,
        templateImplementation ? () => templateImplementation : generateGenericImplementation, // Use template as fallback if available
        existingControls // Pass existing controls for style learning
      );
      
      // Handle both old format (string) and new format (object with aiGenerated flag)
      const mistralImplementation = typeof mistralResult === 'string' ? mistralResult : (mistralResult?.text || null);
      // CRITICAL: aiGenerated is ONLY true when Mistral/Ollama actually generated the text
      // It's false for template/fallback values even if they came through Mistral service
      const aiGenerated = typeof mistralResult === 'object' && mistralResult?.aiGenerated === true;
      // Check if this was an attempted AI call that failed (has error property)
      const aiAttemptedButFailed = typeof mistralResult === 'object' && mistralResult?.attempted === true && mistralResult?.aiGenerated === false;
      
      // Debug logging (development only)
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Mistral result analysis for control ${control.id}:`, {
          isObject: typeof mistralResult === 'object',
          hasText: !!mistralImplementation,
          textLength: mistralImplementation?.length || 0,
          aiGenerated: aiGenerated,
          attempted: mistralResult?.attempted,
          error: mistralResult?.error
        });
      }
      
      if (mistralImplementation && mistralImplementation.length > 50 && aiGenerated) {
        // Use Mistral output as-is (no truncation - prompt guides it to 250 chars)
        // Just normalize whitespace to match existing text format
        suggestions.implementation = mistralImplementation.replace(/\s+/g, ' ').trim();
        suggestions.confidence = Math.max(suggestions.confidence, 0.7); // Boost confidence if AI-generated
        // CRITICAL: mistralUsed is ONLY true when AI actually generated the text
        mistralUsed = true;
        console.log(`✅ Successfully generated implementation with AI Agents for control: ${control.id} (${suggestions.implementation.length} chars)`);
      } else {
        // Fallback to template or generic implementation (truncate fallbacks since they're static)
        suggestions.implementation = templateImplementation ? truncateImplementationText(templateImplementation) : generateGenericImplementation(control);
        // Set error if AI was attempted but failed, or if result was empty
        if (aiAttemptedButFailed) {
          mistralError = mistralResult?.error || 'AI generation failed';
        } else if (!mistralImplementation || mistralImplementation.length <= 50) {
          mistralError = typeof mistralResult === 'object' ? mistralResult?.error : 'Empty response';
        }
        console.log(`⚠️ Mistral ${aiAttemptedButFailed ? 'failed' : 'returned empty'}, using fallback for control: ${control.id}`);
      }
    } catch (error) {
      mistralError = error.message;
      mistralAttempted = true;
      console.warn(`⚠️ Mistral generation failed for control ${control.id}, using fallback:`, error.message);
      // Fallback to template or generic implementation (truncate fallbacks since they're static)
      suggestions.implementation = templateImplementation ? truncateImplementationText(templateImplementation) : generateGenericImplementation(control);
    }
    
    // Clean up reasoning - only include what actually happened
    const cleanedReasoning = [];
    
    // Add strategy-based reasoning (templates, patterns, defaults) - these are always accurate
    const strategyReasons = suggestions.reasoning.filter(r => 
      r.includes('Matched template') || 
      r.includes('Pattern matched') || 
      r.includes('Applied default')
    );
    cleanedReasoning.push(...strategyReasons);
    
    // Add similar controls reasoning ONLY if they were actually found and used
    if (similarControlsUsed && similarControlsFound.length > 0) {
      // Find the actual reasoning message with the correct count
      const similarReason = suggestions.reasoning.find(r => r.includes('Learned'));
      if (similarReason) {
        cleanedReasoning.push(similarReason);
      }
    }
    
    // Add AI reasoning ONLY if Mistral was actually called AND succeeded in generating text
    // mistralUsed is only true when aiGenerated === true (AI actually generated the text)
    if (mistralUsed) {
      // Only add this message if AI actually generated the text (not template/fallback)
      cleanedReasoning.push(`Implementation text generated using AI Engine maintained by ${organizationName}`);
    } else if (mistralAttempted && mistralError) {
      // Only add fallback message if we actually tried Mistral and it failed
      // Don't add if Mistral was disabled or not configured
      // This indicates we tried AI but it failed, so we're using template/generic
      if (templateImplementation) {
        cleanedReasoning.push(`Using template implementation (AI Agents ${mistralError.includes('unavailable') || mistralError.includes('disabled') ? 'unavailable' : 'error'})`);
      } else {
        cleanedReasoning.push(`Using generic implementation (AI Agents ${mistralError.includes('unavailable') || mistralError.includes('disabled') ? 'unavailable' : 'error'})`);
      }
    }
    // If mistralAttempted is false, Mistral was disabled - don't mention AI at all
    
    // Update reasoning with cleaned version (only include what actually happened)
    // If no reasoning was added, add a default one
    if (cleanedReasoning.length === 0) {
      cleanedReasoning.push('Applied default suggestions based on control characteristics');
    }
    suggestions.reasoning = cleanedReasoning;
    
    // Add source indicator for frontend display
    // This makes it easy to see if AI was used or fallback was used
    if (mistralUsed) {
      suggestions.source = 'ai'; // AI Engine generated the implementation text
      suggestions.sourceLabel = 'AI Generated';
    } else if (mistralAttempted && mistralError) {
      suggestions.source = 'fallback'; // AI was attempted but failed, using fallback
      suggestions.sourceLabel = 'Template/Pattern (AI Unavailable)';
    } else {
      suggestions.source = 'template'; // Template/pattern matching (AI not attempted)
      suggestions.sourceLabel = 'Template/Pattern';
    }

    return suggestions;
  } catch (error) {
    console.error('Error generating control suggestions:', error);
    return {
      status: 'not-assessed',
      implementation: generateGenericImplementation(control),
      responsibleParty: 'Shared',
      controlType: 'Orchestrated',
      testingMethod: 'Manual Testing',
      testingFrequency: 'Quarterly',
      riskRating: 'Medium',
      confidence: 0,
      reasoning: ['Error generating suggestions']
    };
  }
}

/**
 * Find template by category name
 */
function findTemplateByCategory(category) {
  const categoryMap = {
    'access': CONTROL_TEMPLATES.AC?.['access-control'],
    'audit': CONTROL_TEMPLATES.AU?.['audit-logging'],
    'authentication': CONTROL_TEMPLATES.IA?.['authentication'],
    'encryption': CONTROL_TEMPLATES.SC?.['encryption'],
    'network': CONTROL_TEMPLATES.SC?.['network-security'],
    'incident': CONTROL_TEMPLATES.IR?.['incident-response'],
    'vulnerability': CONTROL_TEMPLATES.SI?.['vulnerability-management'],
    'malware': CONTROL_TEMPLATES.SI?.['malware-protection'],
    'configuration': CONTROL_TEMPLATES.CM?.['configuration-management']
  };
  
  return categoryMap[category] || null;
}

/**
 * Find similar controls from existing implementations
 */
function findSimilarControls(control, existingControls) {
  const controlTitle = (control.title || '').toLowerCase();
  const controlId = control.id || '';
  const controlFamily = controlId.split('-')[0];
  
  return existingControls
    .filter(existing => {
      if (!existing.id || !existing.implementation) return false;
      
      const existingFamily = existing.id.split('-')[0];
      const existingTitle = (existing.title || '').toLowerCase();
      
      // Same family
      if (existingFamily === controlFamily) return true;
      
      // Similar keywords in title
      const commonWords = controlTitle.split(' ').filter(word => 
        word.length > 3 && existingTitle.includes(word)
      );
      
      return commonWords.length >= 2;
    })
    .slice(0, 25); // Limit to top 25 similar controls
}

/**
 * Average similar controls to create suggestion
 */
function averageSimilarControls(similarControls) {
  const result = {
    status: null,
    implementation: null,
    responsibleParty: null,
    controlType: null,
    testingMethod: null,
    testingFrequency: null,
    riskRating: null
  };

  // Count occurrences
  const statusCounts = {};
  const responsiblePartyCounts = {};
  const controlTypeCounts = {};
  const testingMethodCounts = {};
  const testingFrequencyCounts = {};
  const riskRatingCounts = {};
  const implementations = [];

  similarControls.forEach(control => {
    if (control.status) statusCounts[control.status] = (statusCounts[control.status] || 0) + 1;
    if (control.responsibleParty) responsiblePartyCounts[control.responsibleParty] = (responsiblePartyCounts[control.responsibleParty] || 0) + 1;
    if (control.controlType) controlTypeCounts[control.controlType] = (controlTypeCounts[control.controlType] || 0) + 1;
    if (control.testingMethod) testingMethodCounts[control.testingMethod] = (testingMethodCounts[control.testingMethod] || 0) + 1;
    if (control.testingFrequency) testingFrequencyCounts[control.testingFrequency] = (testingFrequencyCounts[control.testingFrequency] || 0) + 1;
    if (control.riskRating) riskRatingCounts[control.riskRating] = (riskRatingCounts[control.riskRating] || 0) + 1;
    if (control.implementation) implementations.push(control.implementation);
  });

  // Get most common values
  result.status = Object.keys(statusCounts).reduce((a, b) => statusCounts[a] > statusCounts[b] ? a : b, 'not-assessed');
  result.responsibleParty = Object.keys(responsiblePartyCounts).reduce((a, b) => responsiblePartyCounts[a] > responsiblePartyCounts[b] ? a : b, 'Shared');
  result.controlType = Object.keys(controlTypeCounts).reduce((a, b) => controlTypeCounts[a] > controlTypeCounts[b] ? a : b, 'Orchestrated');
  result.testingMethod = Object.keys(testingMethodCounts).reduce((a, b) => testingMethodCounts[a] > testingMethodCounts[b] ? a : b, 'Manual Testing');
  result.testingFrequency = Object.keys(testingFrequencyCounts).reduce((a, b) => testingFrequencyCounts[a] > testingFrequencyCounts[b] ? a : b, 'Quarterly');
  result.riskRating = Object.keys(riskRatingCounts).reduce((a, b) => riskRatingCounts[a] > riskRatingCounts[b] ? a : b, 'Medium');
  
  // Combine implementations - avoid returning duplicate text
  // If all implementations are the same, return null so we generate a unique one
  const uniqueImplementations = [...new Set(implementations.filter(impl => impl && impl.length > 50))];
  if (uniqueImplementations.length === 1 && similarControls.length > 1) {
    // All similar controls have the same implementation - don't reuse it
    result.implementation = null;
  } else {
    result.implementation = uniqueImplementations[0] || implementations[0] || null;
  }

  return result;
}

/**
 * Get default suggestion based on control characteristics
 */
function getDefaultSuggestion(control) {
  const controlTitle = (control.title || '').toLowerCase();
  
  // Check for common patterns
  // Use descriptive language (what has been done) not imperative (what to do)
  if (controlTitle.includes('policy') || controlTitle.includes('procedure')) {
    return {
      status: 'effective',
      implementation: truncateImplementationText('This control is implemented through documented policies and procedures. Policies are reviewed and updated regularly to ensure they remain current and effective.'),
      responsibleParty: 'Shared',
      controlType: 'Policy',
      testingMethod: 'Manual Testing',
      testingFrequency: 'Annually',
      riskRating: 'Medium'
    };
  }
  
  if (controlTitle.includes('monitoring') || controlTitle.includes('detection')) {
    return {
      status: 'effective',
      implementation: truncateImplementationText('Continuous monitoring and detection capabilities are implemented through automated security tools. Events are analyzed in real-time, and alerts are generated for suspicious activities.'),
      responsibleParty: 'Shared',
      controlType: 'Automated',
      testingMethod: 'Automated by Tools',
      testingFrequency: 'Continuous',
      riskRating: 'Low'
    };
  }
  
  // Generic default - use descriptive language
  return {
    status: 'not-assessed',
    implementation: truncateImplementationText('This control is implemented based on organizational requirements and system architecture. Appropriate security measures are in place and aligned with the control description.'),
    responsibleParty: 'Shared',
    controlType: 'Orchestrated',
    testingMethod: 'Manual Testing',
    testingFrequency: 'Quarterly',
    riskRating: 'Medium'
  };
}

/**
 * Generate generic implementation text based on control content
 */
function generateGenericImplementation(control) {
  // Clean title
  let controlTitle = (control.title || '').trim();
  if (controlTitle.toLowerCase().startsWith('control:')) {
    controlTitle = controlTitle.substring(8).trim();
  }
  if (!controlTitle || controlTitle === control.id) {
    controlTitle = `control ${control.id || ''}`;
  }
  
  // Extract key terms from description
  let keyTerms = [];
  if (control.parts && Array.isArray(control.parts)) {
    const prose = control.parts
      .map(part => (part.prose || ''))
      .join(' ')
      .toLowerCase();
    
    // Extract meaningful words (4+ characters, not common words)
    const commonWords = ['the', 'and', 'for', 'are', 'with', 'this', 'that', 'from', 'have', 'been', 'will', 'should', 'must', 'shall'];
    const words = prose.split(/\s+/)
      .filter(word => word.length >= 4 && !commonWords.includes(word))
      .slice(0, 5);
    keyTerms = [...new Set(words)];
  }
  
  // Build implementation text (limited to 250 characters)
  // Use descriptive language (what has been done) not imperative (what to do)
  const MAX_LENGTH = 250;
  let implementation = '';
  
  if (keyTerms.length > 0) {
    implementation = `This control addresses ${keyTerms.slice(0, 3).join(', ')} requirements. The implementation is managed through established security processes and procedures. Regular monitoring ensures effectiveness.`;
  } else {
    implementation = `The implementation of ${controlTitle} is managed through established processes and procedures. Regular reviews ensure the control remains effective and aligned with organizational requirements.`;
  }
  
  // Truncate if needed
  if (implementation.length > MAX_LENGTH) {
    let truncated = implementation.substring(0, MAX_LENGTH);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastSpace = truncated.lastIndexOf(' ');
    
    if (lastPeriod > MAX_LENGTH * 0.7) {
      truncated = truncated.substring(0, lastPeriod + 1);
    } else if (lastSpace > MAX_LENGTH * 0.7) {
      truncated = truncated.substring(0, lastSpace);
    }
    implementation = truncated.trim();
  }
  
  // Normalize whitespace
  implementation = implementation.replace(/\s+/g, ' ').trim();
  
  return implementation;
}

/**
 * Suggest implementations for multiple controls
 * @param {Array} controls - Array of control objects
 * @param {Array} existingControls - Array of existing controls for learning
 * @returns {Object} - Map of control ID to suggestions
 */
export async function suggestMultipleControls(controls, existingControls = []) {
  const suggestions = {};
  
  // Process controls sequentially to avoid overwhelming Mistral service
  for (const control of controls) {
    if (control.id) {
      try {
        suggestions[control.id] = await suggestControlImplementation(control, existingControls);
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error generating suggestions for ${control.id}:`, error.message);
        // Continue with other controls even if one fails
        suggestions[control.id] = {
          status: 'not-assessed',
          implementation: generateGenericImplementation(control),
          responsibleParty: 'Shared',
          controlType: 'Orchestrated',
          testingMethod: 'Manual Testing',
          testingFrequency: 'Quarterly',
          riskRating: 'Medium',
          confidence: 0,
          reasoning: [`Error: ${error.message}`]
        };
      }
    }
  }
  
  return suggestions;
}

export default {
  suggestControlImplementation,
  suggestMultipleControls
};

