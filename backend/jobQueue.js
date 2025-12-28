/**
 * Job Queue Manager for Heavy Background Operations
 * 
 * Handles async processing of heavy operations like PDF/Excel generation
 * to prevent GUI timeouts and improve user experience.
 * 
 * @module jobQueue
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright 2025 Mukesh Kesharwani
 * @license MIT
 */

import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generatePDFReport } from './pdfExport.js';
import { generateCCMExport } from './ccmExport.js';
import ExcelJS from 'exceljs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Job storage (in-memory with optional file backup)
const jobs = new Map();
const JOB_STORAGE_DIR = path.join(__dirname, '../data/jobs');
const MAX_COMPLETED_JOBS = 100; // Keep only last 100 completed jobs
const JOB_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Job statuses
export const JOB_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

// Job types
export const JOB_TYPE = {
  PDF_EXPORT: 'pdf-export',
  EXCEL_EXPORT: 'excel-export',
  CCM_EXPORT: 'ccm-export'
};

/**
 * Initialize job storage directory
 */
function initJobStorage() {
  if (!fs.existsSync(JOB_STORAGE_DIR)) {
    fs.mkdirSync(JOB_STORAGE_DIR, { recursive: true });
  }
}

/**
 * Create a new job
 * @param {string} type - Job type (pdf-export, excel-export, ccm-export)
 * @param {Object} data - Job data
 * @param {Object} metadata - Optional metadata (user, session, etc.)
 * @returns {string} Job ID
 */
export function createJob(type, data, metadata = {}) {
  const jobId = uuidv4();
  const job = {
    id: jobId,
    type,
    status: JOB_STATUS.QUEUED,
    data,
    metadata,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    error: null,
    result: null,
    progress: 0
  };
  
  jobs.set(jobId, job);
  
  // Persist to file for recovery
  saveJobToFile(job);
  
  // Process job asynchronously
  processJob(jobId);
  
  return jobId;
}

/**
 * Get job status and details
 * @param {string} jobId - Job ID
 * @returns {Object|null} Job object or null if not found
 */
export function getJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    // Try to load from file
    return loadJobFromFile(jobId);
  }
  
  // Don't return result data in status check (can be large)
  const { result, ...jobStatus } = job;
  return {
    ...jobStatus,
    hasResult: !!result
  };
}

/**
 * Get job result (buffer or data)
 * @param {string} jobId - Job ID
 * @returns {Buffer|Object|null} Job result or null
 */
export function getJobResult(jobId) {
  const job = jobs.get(jobId) || loadJobFromFile(jobId);
  if (!job || job.status !== JOB_STATUS.COMPLETED) {
    return null;
  }
  return job.result;
}

/**
 * Delete a job
 * @param {string} jobId - Job ID
 */
export function deleteJob(jobId) {
  jobs.delete(jobId);
  
  // Delete file
  const jobFile = path.join(JOB_STORAGE_DIR, `${jobId}.json`);
  if (fs.existsSync(jobFile)) {
    fs.unlinkSync(jobFile);
  }
}

/**
 * List all jobs (with optional filtering)
 * @param {Object} filters - Optional filters (status, type, userId)
 * @returns {Array} Array of job objects
 */
export function listJobs(filters = {}) {
  let jobList = Array.from(jobs.values());
  
  if (filters.status) {
    jobList = jobList.filter(j => j.status === filters.status);
  }
  
  if (filters.type) {
    jobList = jobList.filter(j => j.type === filters.type);
  }
  
  if (filters.userId) {
    jobList = jobList.filter(j => j.metadata?.userId === filters.userId);
  }
  
  // Sort by creation time (newest first)
  jobList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  // Remove result data from list
  return jobList.map(({ result, ...job }) => ({
    ...job,
    hasResult: !!result
  }));
}

/**
 * Process a job asynchronously
 * @param {string} jobId - Job ID
 */
async function processJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    console.error(`Job ${jobId} not found`);
    return;
  }
  
  try {
    // Update status to processing
    job.status = JOB_STATUS.PROCESSING;
    job.startedAt = new Date().toISOString();
    job.progress = 10;
    saveJobToFile(job);
    
    console.log(`[JobQueue] Processing job ${jobId} (${job.type})`);
    
    let result;
    
    // Route to appropriate handler
    switch (job.type) {
      case JOB_TYPE.PDF_EXPORT:
        result = await processPDFExport(job);
        break;
        
      case JOB_TYPE.EXCEL_EXPORT:
        result = await processExcelExport(job);
        break;
        
      case JOB_TYPE.CCM_EXPORT:
        result = await processCCMExport(job);
        break;
        
      default:
        throw new Error(`Unknown job type: ${job.type}`);
    }
    
    // Update job with result
    job.status = JOB_STATUS.COMPLETED;
    job.completedAt = new Date().toISOString();
    job.progress = 100;
    job.result = result;
    saveJobToFile(job);
    
    console.log(`[JobQueue] Job ${jobId} completed successfully`);
    
    // Schedule cleanup
    scheduleJobCleanup(jobId);
    
  } catch (error) {
    console.error(`[JobQueue] Job ${jobId} failed:`, error);
    
    // Update job with error
    job.status = JOB_STATUS.FAILED;
    job.completedAt = new Date().toISOString();
    job.error = error.message;
    saveJobToFile(job);
  }
}

/**
 * Process PDF export job
 * @param {Object} job - Job object
 * @returns {Buffer} PDF buffer
 */
async function processPDFExport(job) {
  const { controls, systemInfo, metadata } = job.data;
  
  job.progress = 30;
  saveJobToFile(job);
  
  const pdfBuffer = await generatePDFReport(controls, systemInfo, metadata);
  
  job.progress = 90;
  saveJobToFile(job);
  
  return pdfBuffer;
}

/**
 * Process Excel export job
 * @param {Object} job - Job object
 * @returns {Buffer} Excel buffer
 */
async function processExcelExport(job) {
  const { controls, systemInfo } = job.data;
  
  job.progress = 30;
  saveJobToFile(job);
  
  const workbook = new ExcelJS.Workbook();
  
  // System Information sheet
  const systemSheet = workbook.addWorksheet('System Information');
  systemSheet.columns = [
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Value', key: 'value', width: 50 }
  ];

  systemSheet.addRows([
    { field: 'System Name', value: systemInfo.systemName || '' },
    { field: 'System ID', value: systemInfo.systemId || '' },
    { field: 'Description', value: systemInfo.description || '' },
    { field: 'Organisation', value: systemInfo.organization || '' },
    { field: 'System Owner', value: systemInfo.systemOwner || '' },
    { field: 'Assessor Details', value: systemInfo.assessorDetails || '' },
    { field: 'CSP IaaS Provider', value: systemInfo.cspIaaS || '' },
    { field: 'CSP PaaS Provider', value: systemInfo.cspPaaS || '' },
    { field: 'CSP SaaS Provider', value: systemInfo.cspSaaS || '' },
    { field: 'Security Level', value: systemInfo.securityLevel || '' },
    { field: 'Status', value: systemInfo.status || '' },
    { field: 'Catalogue URL', value: systemInfo.catalogueUrl || '' }
  ]);

  // Style the header
  systemSheet.getRow(1).font = { bold: true };
  systemSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  
  job.progress = 50;
  saveJobToFile(job);

  // Controls sheet
  const controlsSheet = workbook.addWorksheet('Controls Implementation');
  controlsSheet.columns = [
    { header: 'Control ID', key: 'id', width: 15 },
    { header: 'Control Title', key: 'title', width: 40 },
    { header: 'Group', key: 'group', width: 20 },
    { header: 'Implementation Status', key: 'status', width: 20 },
    { header: 'Implementation Description', key: 'implementation', width: 50 },
    { header: 'Remarks', key: 'remarks', width: 30 }
  ];

  controls.forEach(control => {
    controlsSheet.addRow({
      id: control.id,
      title: control.title,
      group: control.groupTitle || '',
      status: control.status || 'Not Assessed',
      implementation: control.implementation || '',
      remarks: control.remarks || ''
    });
  });

  // Style the header
  controlsSheet.getRow(1).font = { bold: true };
  controlsSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  
  job.progress = 80;
  saveJobToFile(job);

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  
  job.progress = 90;
  saveJobToFile(job);
  
  return buffer;
}

/**
 * Process CCM export job
 * @param {Object} job - Job object
 * @returns {Buffer} Excel buffer
 */
async function processCCMExport(job) {
  const { controls, systemInfo } = job.data;
  
  job.progress = 30;
  saveJobToFile(job);
  
  const workbook = await generateCCMExport(controls, systemInfo);
  
  job.progress = 80;
  saveJobToFile(job);
  
  const buffer = await workbook.xlsx.writeBuffer();
  
  job.progress = 90;
  saveJobToFile(job);
  
  return buffer;
}

/**
 * Save job to file
 * @param {Object} job - Job object
 */
function saveJobToFile(job) {
  try {
    initJobStorage();
    
    // Don't save result buffer to file (too large)
    const { result, ...jobData } = job;
    const jobFile = path.join(JOB_STORAGE_DIR, `${job.id}.json`);
    
    fs.writeFileSync(jobFile, JSON.stringify({
      ...jobData,
      hasResult: !!result
    }, null, 2));
  } catch (error) {
    console.error(`Failed to save job ${job.id} to file:`, error.message);
  }
}

/**
 * Load job from file
 * @param {string} jobId - Job ID
 * @returns {Object|null} Job object or null
 */
function loadJobFromFile(jobId) {
  try {
    const jobFile = path.join(JOB_STORAGE_DIR, `${jobId}.json`);
    if (fs.existsSync(jobFile)) {
      const jobData = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
      return jobData;
    }
  } catch (error) {
    console.error(`Failed to load job ${jobId} from file:`, error.message);
  }
  return null;
}

/**
 * Schedule job cleanup after retention period
 * @param {string} jobId - Job ID
 */
function scheduleJobCleanup(jobId) {
  setTimeout(() => {
    console.log(`[JobQueue] Cleaning up old job ${jobId}`);
    deleteJob(jobId);
  }, JOB_RETENTION_MS);
}

/**
 * Cleanup old completed jobs (call periodically)
 */
export function cleanupOldJobs() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [jobId, job] of jobs.entries()) {
    if (job.status === JOB_STATUS.COMPLETED || job.status === JOB_STATUS.FAILED) {
      const jobAge = now - new Date(job.completedAt || job.createdAt).getTime();
      
      if (jobAge > JOB_RETENTION_MS) {
        deleteJob(jobId);
        cleanedCount++;
      }
    }
  }
  
  // Limit number of completed jobs
  const completedJobs = Array.from(jobs.values())
    .filter(j => j.status === JOB_STATUS.COMPLETED)
    .sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
  
  if (completedJobs.length > MAX_COMPLETED_JOBS) {
    const toDelete = completedJobs.slice(0, completedJobs.length - MAX_COMPLETED_JOBS);
    toDelete.forEach(job => {
      deleteJob(job.id);
      cleanedCount++;
    });
  }
  
  if (cleanedCount > 0) {
    console.log(`[JobQueue] Cleaned up ${cleanedCount} old jobs`);
  }
  
  return cleanedCount;
}

// Auto-cleanup every hour
setInterval(cleanupOldJobs, 60 * 60 * 1000);

// Initialize on module load
initJobStorage();

console.log('[JobQueue] Job queue manager initialized');

