/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { v4 as uuidv4 } from 'uuid';
import { getOscalTargetForStatus } from './utils/constants.js';

// OSCAL empty placeholder for required fields
const OSCAL_EMPTY_PLACEHOLDER = "No_Input_Recorded";

/**
 * Sanitize strings for OSCAL compliance
 * OSCAL requires pattern: ^\S(.*\S)?$ (no leading/trailing whitespace)
 */
function sanitizeOSCALString(value, useDefault = true) {
  if (value === null || value === undefined) {
    return useDefault ? OSCAL_EMPTY_PLACEHOLDER : undefined;
  }
  
  let cleaned = String(value).trim();
  
  if (cleaned.length === 0) {
    return useDefault ? OSCAL_EMPTY_PLACEHOLDER : undefined;
  }
  
  return cleaned;
}

/**
 * Recursively sanitize all strings in an object
 */
function sanitizeOSCALObject(obj) {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  
  if (typeof obj === 'string') {
    return sanitizeOSCALString(obj, false);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeOSCALObject(item)).filter(item => item !== undefined);
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const cleanValue = sanitizeOSCALObject(value);
      if (cleanValue !== undefined) {
        sanitized[key] = cleanValue;
      }
    }
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }
  
  return obj;
}

/**
 * Generate local-objective for a control
 */
function generateLocalObjective(control) {
  const objective = {
    'control-id': sanitizeOSCALString(control.id)
  };
  
  // Add testing objective as description if available
  if (control.testingObjective) {
    objective.description = sanitizeOSCALString(control.testingObjective);
  }
  
  // Add props if available
  const props = [];
  if (control.status) {
    props.push({
      name: 'control-status',
      value: sanitizeOSCALString(control.status)
    });
  }
  
  if (props.length > 0) {
    objective.props = props;
  }
  
  // Initialize parts array (required by schema but can be empty)
  objective.parts = [];
  
  return objective;
}

/**
 * Generate assessment-method for a control
 */
function generateAssessmentMethod(control) {
  const method = {
    uuid: uuidv4()
  };
  
  // Add testing procedure as description if available
  if (control.testingProcedure) {
    method.description = sanitizeOSCALString(control.testingProcedure);
  }
  
  // Create assessment part (required)
  const part = {
    name: 'assessment',
    props: []
  };
  
  // Determine assessment method type from control type
  let methodType = 'TEST'; // Default
  if (control.controlType) {
    const controlType = control.controlType.toLowerCase();
    if (controlType.includes('automated')) {
      methodType = 'TEST';
    } else if (controlType.includes('policy')) {
      methodType = 'EXAMINE';
    } else if (controlType.includes('process')) {
      methodType = 'INTERVIEW';
    }
  }
  
  part.props.push({
    name: 'method',
    value: methodType
  });
  
  // Add testing frequency if available
  if (control.testingFrequency) {
    part.props.push({
      name: 'testing-frequency',
      value: sanitizeOSCALString(control.testingFrequency)
    });
  }
  
  method.part = part;
  
  return method;
}

/**
 * Generate observation for a control
 */
function generateObservation(control) {
  const observation = {
    uuid: uuidv4(),
    description: sanitizeOSCALString(
      control.implementation || 
      'Control implementation observation recorded during assessment.'
    )
  };
  
  // Determine observation method based on control type
  const methods = [];
  if (control.controlType) {
    const controlType = control.controlType.toLowerCase();
    if (controlType.includes('automated')) {
      methods.push('TEST');
    } else if (controlType.includes('policy')) {
      methods.push('EXAMINE');
    } else if (controlType.includes('process')) {
      methods.push('INTERVIEW', 'EXAMINE');
    } else {
      methods.push('TEST');
    }
  } else {
    methods.push('TEST');
  }
  
  observation.methods = methods;
  
  // Add observation type
  observation.types = ['control-objective'];
  
  // Add evidence if available
  if (control.evidence) {
    observation.props = [
      {
        name: 'evidence-location',
        value: sanitizeOSCALString(control.evidence)
      }
    ];
  }
  
  // Add relevant control
  observation['relevant-evidence'] = [
    {
      href: `#${control.id}`,
      description: sanitizeOSCALString(`Evidence for control ${control.id}`)
    }
  ];
  
  // Add collected timestamp
  observation.collected = new Date().toISOString();
  
  return observation;
}

/**
 * Generate finding for a control
 */
function generateFinding(control, observation) {
  const finding = {
    uuid: uuidv4(),
    title: sanitizeOSCALString(`Assessment Finding for ${control.id}`),
    description: sanitizeOSCALString(
      control.testingObjective || 
      `Assessment finding for control ${control.id}`
    )
  };
  
  // Link to observation
  finding['related-observations'] = [
    {
      'observation-uuid': observation.uuid
    }
  ];
  
  // Determine finding status from control status
  const status = control.status || 'not-assessed';
  const { status: oscalStatus, implementation } = getOscalTargetForStatus(status);
  finding.target = {
    'target-id': control.id,
    status: oscalStatus,
    implementation
  };
  
  return finding;
}

/**
 * Generate reviewed-controls for a control
 */
function generateReviewedControl(control) {
  return {
    'control-selections': [
      {
        description: sanitizeOSCALString(`Controls reviewed during assessment`),
        'include-controls': [
          {
            'with-ids': [control.id]
          }
        ]
      }
    ],
    'control-objective-selections': [
      {
        description: sanitizeOSCALString(`Control objectives assessed`),
        'include-objectives': [
          {
            'objective-id': control.id
          }
        ]
      }
    ]
  };
}

/**
 * Generate complete result object for all controls
 */
function generateResult(controls, assessmentInfo = {}) {
  const result = {
    uuid: uuidv4(),
    title: sanitizeOSCALString(
      assessmentInfo.title || 
      'Security Assessment Results'
    ),
    description: sanitizeOSCALString(
      assessmentInfo.description || 
      'Assessment results for implemented security controls'
    ),
    start: assessmentInfo.startDate || new Date().toISOString(),
    end: assessmentInfo.endDate || new Date().toISOString()
  };
  
  // Add props if available
  const props = [];
  if (assessmentInfo.assessor) {
    props.push({
      name: 'assessor',
      value: sanitizeOSCALString(assessmentInfo.assessor)
    });
  }
  
  if (props.length > 0) {
    result.props = props;
  }
  
  // Generate observations and findings for each control
  const observations = [];
  const findings = [];
  const reviewedControlsList = [];
  
  controls.forEach(control => {
    if (control.id) {
      // Generate observation
      const observation = generateObservation(control);
      observations.push(observation);
      
      // Generate finding linked to observation
      const finding = generateFinding(control, observation);
      findings.push(finding);
      
      // Add to reviewed controls
      const reviewed = generateReviewedControl(control);
      reviewedControlsList.push(reviewed);
    }
  });
  
  result.observations = observations;
  result.findings = findings;
  
  // Merge reviewed controls (combine all control selections)
  if (reviewedControlsList.length > 0) {
    result['reviewed-controls'] = {
      'control-selections': reviewedControlsList.flatMap(r => r['control-selections']),
      'control-objective-selections': reviewedControlsList.flatMap(r => r['control-objective-selections'])
    };
  }
  
  return result;
}

/**
 * Generate complete OSCAL Security Assessment Results document
 */
export function generateSAR({ metadata, controls, assessmentInfo = {}, validationOptions = {} }) {
  // Generate SAR metadata
  const sarMetadata = sanitizeOSCALObject(metadata) || {};
  
  // Override with SAR-specific values
  sarMetadata.title = sanitizeOSCALString(
    assessmentInfo.title || 
    metadata?.title || 
    'Security Assessment Results'
  );
  sarMetadata['last-modified'] = new Date().toISOString();
  sarMetadata.version = sanitizeOSCALString(
    assessmentInfo.version || 
    metadata?.version || 
    '1.0'
  );
  sarMetadata['oscal-version'] = '2.1.0';
  
  // Generate local-definitions with objectives-and-methods
  const objectivesAndMethods = [];
  const assessmentMethods = [];
  
  controls.forEach(control => {
    if (control.id) {
      // Generate local-objective
      const objective = generateLocalObjective(control);
      objectivesAndMethods.push(objective);
      
      // Generate assessment-method
      const method = generateAssessmentMethod(control);
      assessmentMethods.push(method);
    }
  });
  
  const localDefinitions = {
    'objectives-and-methods': objectivesAndMethods
  };
  
  // Add assessment methods to local definitions
  if (assessmentMethods.length > 0) {
    localDefinitions.activities = [
      {
        uuid: uuidv4(),
        title: sanitizeOSCALString('Assessment Activities'),
        description: sanitizeOSCALString('Assessment methods and procedures'),
        props: assessmentMethods.map(method => ({
          name: 'assessment-method-uuid',
          value: method.uuid
        }))
      }
    ];
  }
  
  // Generate results
  const results = [generateResult(controls, assessmentInfo)];
  
  // Build complete SAR document
  const sarDocument = {
    'assessment-results': {
      uuid: uuidv4(),
      metadata: sarMetadata,
      'import-ap': {
        href: sanitizeOSCALString(
          assessmentInfo.assessmentPlanRef || 
          '#assessment-plan'
        )
      },
      'local-definitions': localDefinitions,
      results: results
    }
  };
  
  return sarDocument;
}

export default {
  generateSAR,
  sanitizeOSCALString,
  sanitizeOSCALObject
};
