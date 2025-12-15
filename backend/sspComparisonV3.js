/**
 * SSP Comparison Module - Direct Catalog Comparison
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 * 
 * Inspired by roscal (https://github.com/gborough/roscal) and NIST approaches
 * 
 * Compare catalog with existing SSP by directly comparing control definitions
 * @param {Array} catalogControls - Controls from the new catalog
 * @param {Object} existingSSP - Existing OSCAL SSP data
 * @param {Object} catalogData - Full catalog data
 * @returns {Object} - Comparison results with marked controls
 */
export function compareWithExistingSSP(catalogControls, existingSSP, catalogData) {
  try {
    console.log('Starting OSCAL catalog comparison...');
    
    // Extract existing control data from SSP
    const existingControls = extractControlsFromSSP(existingSSP);
    const existingControlsMap = new Map();
    existingControls.forEach(control => {
      existingControlsMap.set(control.id, control);
    });
    
    // Extract system information from SSP
    const systemInfo = extractSystemInfoFromSSP(existingSSP);
    
    console.log(`Comparing ${catalogControls.length} catalog controls with ${existingControls.length} SSP controls`);
    
    // Compare each control
    const comparedControls = catalogControls.map(catalogControl => {
      const existingControl = existingControlsMap.get(catalogControl.id);
      
      if (!existingControl) {
        // New control - doesn't exist in old SSP
        return {
          ...catalogControl,
          changeStatus: 'new',
          changeReason: 'New control added in catalog',
          status: 'not-assessed',
          implementation: '',
          remarks: ''
        };
      }
      
      // Control exists - compare CATALOG definitions only (not implementation data)
      const titleChanged = !compareStrings(
        catalogControl.title,
        existingControl.catalogTitle
      );
      
      const descriptionChanged = !compareStrings(
        catalogControl.description,
        existingControl.catalogDescription
      );
      
      let changeStatus = 'unchanged';
      let changeReason = null;
      let changeDetails = [];
      
      if (titleChanged || descriptionChanged) {
        changeStatus = 'changed';
        
        if (titleChanged && descriptionChanged) {
          changeReason = 'Control title and description updated';
          changeDetails = ['title', 'description'];
        } else if (titleChanged) {
          changeReason = 'Control title updated';
          changeDetails = ['title'];
        } else {
          changeReason = 'Control description updated';
          changeDetails = ['description'];
        }
      }
      
      // Always merge: new catalog definition + ALL existing user data
      return {
        // New catalog control definition (title, description, parts)
        ...catalogControl,
        
        // Change tracking
        changeStatus,
        changeReason,
        ...(changeDetails.length > 0 && { changeDetails }),
        
        // Pre-populate ALL existing user data (implementation, status, etc.)
        status: existingControl.status || 'not-assessed',
        implementation: existingControl.implementation || '',
        remarks: existingControl.remarks || '',
        responsibleParty: existingControl.responsibleParty || '',
        controlOwner: existingControl.controlOwner || '',
        consumerGuidance: existingControl.consumerGuidance || '',
        implementationDate: existingControl.implementationDate || '',
        reviewDate: existingControl.reviewDate || '',
        nextReviewDate: existingControl.nextReviewDate || '',
        controlType: existingControl.controlType || '',
        evidence: existingControl.evidence || '',
        testingProcedure: existingControl.testingProcedure || '',
        testingFrequency: existingControl.testingFrequency || '',
        lastTestDate: existingControl.lastTestDate || '',
        apiUrl: existingControl.apiUrl || '',
        apiCredentialId: existingControl.apiCredentialId || '',
        apiResponseData: existingControl.apiResponseData || null,
        apiDataHistory: existingControl.apiDataHistory || [],
        riskRating: existingControl.riskRating || '',
        frameworks: existingControl.frameworks || '',
        compensatingControls: existingControl.compensatingControls || '',
        exceptions: existingControl.exceptions || '',
        
        // Store old catalog values for reference if changed
        ...(changeStatus === 'changed' && {
          oldTitle: existingControl.catalogTitle,
          oldDescription: existingControl.catalogDescription
        })
      };
    });
    
    // Generate statistics
    const stats = {
      total: comparedControls.length,
      new: comparedControls.filter(c => c.changeStatus === 'new').length,
      changed: comparedControls.filter(c => c.changeStatus === 'changed').length,
      unchanged: comparedControls.filter(c => c.changeStatus === 'unchanged').length,
      existingTotal: existingControls.length
    };
    
    console.log('Comparison complete:', stats);
    
    return {
      controls: comparedControls,
      stats,
      systemInfo,
      comparisonDate: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in catalog comparison:', error);
    throw error;
  }
}

/**
 * Compare two strings with normalization
 * Returns true if strings are considered equal
 */
function compareStrings(str1, str2) {
  // Handle null/undefined
  if (!str1 && !str2) return true;
  if (!str1 || !str2) return false;
  
  // Normalize strings for comparison
  const normalize = (text) => {
    if (!text) return '';
    return text
      .trim()
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/[\r\n]+/g, '\n')  // Normalize line breaks
      .toLowerCase();
  };
  
  return normalize(str1) === normalize(str2);
}

/**
 * Extract controls and their data from existing SSP
 * @param {Object} sspData - OSCAL SSP JSON
 * @returns {Array} - Array of control objects with implementation data
 */
export function extractControlsFromSSP(sspData) {
  const controls = [];
  
  try {
    let implementedRequirements = [];
    
    // Handle OSCAL SSP format
    if (sspData['system-security-plan']) {
      const ssp = sspData['system-security-plan'];
      if (ssp['control-implementation']?.['implemented-requirements']) {
        implementedRequirements = ssp['control-implementation']['implemented-requirements'];
      }
    }
    
    // Handle our simplified format
    if (sspData.controls && Array.isArray(sspData.controls)) {
      implementedRequirements = sspData.controls;
    }
    
    // Also check for catalog stored in SSP (from our exports)
    if (sspData.catalog) {
      // Extract controls from catalog structure
      const catalogControls = extractControlsFromCatalog(sspData.catalog);
      return catalogControls;
    }
    
    implementedRequirements.forEach(req => {
      // Extract catalog metadata and custom fields from props
      let catalogTitle = '';
      let catalogDescription = '';
      let groupTitle = '';
      let status = 'not-assessed';
      let responsibleParty = '';
      let controlOwner = '';
      let consumerGuidance = '';
      let implementationDate = '';
      let reviewDate = '';
      let nextReviewDate = '';
      let controlType = '';
      let evidence = '';
      let testingProcedure = '';
      let testingFrequency = '';
      let lastTestDate = '';
      let apiUrl = '';
      let apiCredentialId = '';
      let apiResponseData = null;
      let apiDataHistory = [];
      let riskRating = '';
      let frameworks = '';
      let compensatingControls = '';
      let exceptions = '';
      
      if (req.props && Array.isArray(req.props)) {
        req.props.forEach(prop => {
          if (prop.name === 'catalog-control-title') {
            catalogTitle = prop.value || '';
          } else if (prop.name === 'catalog-control-description') {
            catalogDescription = prop.value || '';
          } else if (prop.name === 'group-title' || prop.name === 'control-group') {
            groupTitle = prop.value || '';
          } else if (prop.name === 'implementation-status') {
            status = prop.value || 'not-assessed';
          } else if (prop.name === 'responsible-party') {
            responsibleParty = prop.value || '';
          } else if (prop.name === 'control-owner') {
            controlOwner = prop.value || '';
          } else if (prop.name === 'consumer-guidance') {
            consumerGuidance = prop.value || '';
          } else if (prop.name === 'implementation-date') {
            implementationDate = prop.value || '';
          } else if (prop.name === 'review-date') {
            reviewDate = prop.value || '';
          } else if (prop.name === 'next-review-date') {
            nextReviewDate = prop.value || '';
          } else if (prop.name === 'control-type') {
            controlType = prop.value || '';
          } else if (prop.name === 'evidence') {
            evidence = prop.value || '';
          } else if (prop.name === 'testing-procedure') {
            testingProcedure = prop.value || '';
          } else if (prop.name === 'testing-frequency') {
            testingFrequency = prop.value || '';
          } else if (prop.name === 'last-test-date') {
            lastTestDate = prop.value || '';
          } else if (prop.name === 'api-url') {
            apiUrl = prop.value || '';
          } else if (prop.name === 'api-credential-id') {
            apiCredentialId = prop.value || '';
          } else if (prop.name === 'api-response-data') {
            try {
              apiResponseData = JSON.parse(prop.value);
            } catch (e) {
              apiResponseData = prop.value;
            }
          } else if (prop.name === 'api-data-history') {
            try {
              apiDataHistory = JSON.parse(prop.value);
            } catch (e) {
              apiDataHistory = [];
            }
          } else if (prop.name === 'risk-rating') {
            riskRating = prop.value || '';
          } else if (prop.name === 'frameworks') {
            frameworks = prop.value || '';
          } else if (prop.name === 'compensating-controls') {
            compensatingControls = prop.value || '';
          } else if (prop.name === 'exceptions') {
            exceptions = prop.value || '';
          }
        });
      }
      
      // Fallback: try to extract from other fields
      if (!catalogTitle && req.title) {
        catalogTitle = req.title;
      }
      if (!catalogDescription) {
        catalogDescription = extractDescription(req);
      }
      
      const controlData = {
        id: req['control-id'] || req.id,
        catalogTitle,
        catalogDescription,
        groupTitle,
        
        // User implementation data (from props or fallback to direct properties)
        status,
        implementation: req.implementation || req.description || '',
        remarks: req.remarks || '',
        responsibleParty: responsibleParty || req.responsibleParty || req['responsible-roles']?.[0] || '',
        controlOwner: controlOwner || req.controlOwner || '',
        consumerGuidance: consumerGuidance || req.consumerGuidance || '',
        implementationDate: implementationDate || req.implementationDate || '',
        reviewDate: reviewDate || req.reviewDate || '',
        nextReviewDate: nextReviewDate || req.nextReviewDate || '',
        controlType: controlType || req.controlType || '',
        evidence: evidence || req.evidence || '',
        testingProcedure: testingProcedure || req.testingProcedure || '',
        testingFrequency: testingFrequency || req.testingFrequency || '',
        lastTestDate: lastTestDate || req.lastTestDate || '',
        apiUrl: apiUrl || req.apiUrl || '',
        apiCredentialId: apiCredentialId || req.apiCredentialId || '',
        apiResponseData: apiResponseData || req.apiResponseData || null,
        apiDataHistory: apiDataHistory || req.apiDataHistory || [],
        riskRating: riskRating || req.riskRating || '',
        frameworks: frameworks || req.frameworks || '',
        compensatingControls: compensatingControls || req.compensatingControls || '',
        exceptions: exceptions || req.exceptions || ''
      };
      
      controls.push(controlData);
    });
  } catch (error) {
    console.error('Error extracting controls from SSP:', error);
  }
  
  return controls;
}

/**
 * Extract controls from catalog structure if present in SSP
 */
function extractControlsFromCatalog(catalog) {
  const controls = [];
  
  const processCatalog = (cat) => {
    if (!cat) return;
    
    // Process groups
    if (cat.groups && Array.isArray(cat.groups)) {
      cat.groups.forEach(group => {
        if (group.controls) {
          group.controls.forEach(control => {
            controls.push({
              id: control.id,
              catalogTitle: control.title || '',
              catalogDescription: extractControlDescription(control),
              groupTitle: group.title || '',
              status: 'not-assessed'
            });
          });
        }
        
        // Recursive for nested groups
        if (group.groups) {
          processCatalog({ groups: group.groups });
        }
      });
    }
    
    // Process root-level controls
    if (cat.controls && Array.isArray(cat.controls)) {
      cat.controls.forEach(control => {
        controls.push({
          id: control.id,
          catalogTitle: control.title || '',
          catalogDescription: extractControlDescription(control),
          groupTitle: '',
          status: 'not-assessed'
        });
      });
    }
  };
  
  processCatalog(catalog.catalog || catalog);
  
  return controls;
}

/**
 * Extract control description from parts
 */
function extractControlDescription(control) {
  if (!control.parts || control.parts.length === 0) {
    return '';
  }
  
  // Find statement or description parts
  const descParts = control.parts.filter(part => 
    part.name === 'statement' || part.name === 'description' || part.name === 'guidance'
  );
  
  if (descParts.length === 0) {
    // Try to get prose from any part
    const proseParts = control.parts.filter(part => part.prose);
    if (proseParts.length > 0) {
      return proseParts.map(p => p.prose).join('\n\n');
    }
    return '';
  }
  
  // Extract prose from description parts
  return descParts.map(part => part.prose || '').filter(Boolean).join('\n\n');
}

/**
 * Extract description from various OSCAL formats
 */
function extractDescription(req) {
  if (req.description && typeof req.description === 'string') {
    return req.description;
  }
  
  if (req.statements && Array.isArray(req.statements)) {
    return req.statements.map(s => s.description || '').join('\n');
  }
  
  if (req['control-description']) {
    return req['control-description'];
  }
  
  if (req.parts && Array.isArray(req.parts)) {
    return extractControlDescription({ parts: req.parts });
  }
  
  return '';
}

/**
 * Extract system information from SSP
 * @param {Object} sspData - OSCAL SSP JSON
 * @returns {Object} - System information object
 */
function extractSystemInfoFromSSP(sspData) {
  const systemInfo = {
    systemName: '',
    systemId: '',
    description: '',
    authorizationBoundary: '',
    securityLevel: 'moderate',
    confidentiality: 'moderate',
    integrity: 'moderate',
    availability: 'moderate',
    status: 'under-development',
    systemType: '',
    authorizationDate: '',
    organization: '',
    systemOwner: '',
    assessorDetails: '',
    cspIaaS: '',
    cspPaaS: '',
    cspSaaS: ''
  };
  
  try {
    // Handle OSCAL SSP format
    if (sspData['system-security-plan']) {
      const ssp = sspData['system-security-plan'];
      
      // Extract from system-characteristics
      if (ssp['system-characteristics']) {
        const sysChar = ssp['system-characteristics'];
        
        // System Name
        if (sysChar['system-name']) {
          systemInfo.systemName = sysChar['system-name'];
        }
        
        // System ID
        if (sysChar['system-ids'] && Array.isArray(sysChar['system-ids']) && sysChar['system-ids'].length > 0) {
          systemInfo.systemId = sysChar['system-ids'][0].id || sysChar['system-ids'][0].identifier || '';
        }
        
        // Description
        if (sysChar.description) {
          systemInfo.description = sysChar.description;
        }
        
        // Security Sensitivity Level
        if (sysChar['security-sensitivity-level']) {
          systemInfo.securityLevel = sysChar['security-sensitivity-level'];
        }
        
        // Security Impact Level
        if (sysChar['security-impact-level']) {
          const impact = sysChar['security-impact-level'];
          
          if (impact['security-objective-confidentiality']) {
            systemInfo.confidentiality = impact['security-objective-confidentiality'];
          }
          
          if (impact['security-objective-integrity']) {
            systemInfo.integrity = impact['security-objective-integrity'];
          }
          
          if (impact['security-objective-availability']) {
            systemInfo.availability = impact['security-objective-availability'];
          }
        }
        
        // System Status
        if (sysChar.status) {
          if (typeof sysChar.status === 'string') {
            systemInfo.status = sysChar.status;
          } else if (sysChar.status.state) {
            systemInfo.status = sysChar.status.state;
          }
        }
        
        // System Type
        if (sysChar['system-type']) {
          systemInfo.systemType = sysChar['system-type'];
        }
        
        // Authorization Boundary
        if (sysChar['authorization-boundary']) {
          if (sysChar['authorization-boundary'].description) {
            systemInfo.authorizationBoundary = sysChar['authorization-boundary'].description;
          }
          if (sysChar['authorization-boundary'].date) {
            systemInfo.authorizationDate = sysChar['authorization-boundary'].date;
          }
        }
        
        // Extract from props
        if (sysChar.props && Array.isArray(sysChar.props)) {
          sysChar.props.forEach(prop => {
            if (prop.name === 'organization' && prop.value) {
              systemInfo.organization = prop.value;
            } else if (prop.name === 'system-owner' && prop.value) {
              systemInfo.systemOwner = prop.value;
            } else if (prop.name === 'assessor-details' && prop.value) {
              systemInfo.assessorDetails = prop.value;
            } else if (prop.name === 'csp-iaas' && prop.value) {
              systemInfo.cspIaaS = prop.value;
            } else if (prop.name === 'csp-paas' && prop.value) {
              systemInfo.cspPaaS = prop.value;
            } else if (prop.name === 'csp-saas' && prop.value) {
              systemInfo.cspSaaS = prop.value;
            }
          });
        }
      }
      
      // Extract from metadata
      if (ssp.metadata) {
        // Organization
        if (ssp.metadata.parties && Array.isArray(ssp.metadata.parties)) {
          const orgParty = ssp.metadata.parties.find(p => p.type === 'organization');
          if (orgParty && orgParty.name) {
            systemInfo.organization = orgParty.name;
          }
        }
        
        // System Owner from responsible parties
        if (ssp.metadata['responsible-parties'] && Array.isArray(ssp.metadata['responsible-parties'])) {
          const ownerRole = ssp.metadata['responsible-parties'].find(rp => 
            rp['role-id'] === 'system-owner' || rp.role === 'system-owner'
          );
          if (ownerRole) {
            // Get party name
            const partyUuid = ownerRole['party-uuids'] && ownerRole['party-uuids'][0];
            if (partyUuid && ssp.metadata.parties) {
              const party = ssp.metadata.parties.find(p => p.uuid === partyUuid);
              if (party && party.name) {
                systemInfo.systemOwner = party.name;
              }
            }
          }
          
          // Assessor Details from responsible parties with role-id "prepared-by"
          // Find the organization party that is specifically the assessor (has the assessment remarks)
          const assessorRoles = ssp.metadata['responsible-parties'].filter(rp => 
            rp['role-id'] === 'prepared-by' || rp.role === 'prepared-by'
          );
          if (assessorRoles && assessorRoles.length > 0 && ssp.metadata.parties) {
            // Look for the party that is type "organization" AND has assessor-specific remarks
            for (const assessorRole of assessorRoles) {
              const partyUuid = assessorRole['party-uuids'] && assessorRole['party-uuids'][0];
              if (partyUuid) {
                const party = ssp.metadata.parties.find(p => 
                  p.uuid === partyUuid && 
                  p.type === 'organization' && 
                  p.remarks && 
                  p.remarks.includes('Assessment organization')
                );
                if (party && party.name) {
                  systemInfo.assessorDetails = party.name;
                  break; // Found the assessor organization
                }
              }
            }
          }
        }
      }
    }
    
    // Handle our simplified format (if exists)
    if (sspData.systemInfo) {
      return { ...systemInfo, ...sspData.systemInfo };
    }
    
    console.log('Extracted system info:', systemInfo);
  } catch (error) {
    console.error('Error extracting system info from SSP:', error);
  }
  
  return systemInfo;
}

