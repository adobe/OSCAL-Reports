/**
 * PDF Compliance Report Export Module
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 * 
 * Generate Compliance Report PDF with system information and control details
 */

import PDFDocument from 'pdfkit';
export async function generatePDFReport(controls, systemInfo, metadata) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      // Collect PDF data
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', reject);

      // Title Page
      doc.fontSize(28)
         .fillColor('#2563eb')
         .text('Compliance Report', { align: 'center' });
      
      doc.moveDown(0.5);
      doc.fontSize(18)
         .fillColor('#64748b')
         .text(systemInfo.systemName || 'System Security Assessment', { align: 'center' });
      
      doc.moveDown(2);
      doc.fontSize(12)
         .fillColor('#1e293b')
         .text(`Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
      
      doc.moveDown(0.5);
      if (metadata?.title) {
        doc.fontSize(11)
           .fillColor('#64748b')
           .text(`Framework: ${metadata.title}`, { align: 'center' });
      }
      
      // System Information Section
      doc.addPage();
      addSectionHeader(doc, 'System Information');
      
      const systemDetails = [
        ['System Name', systemInfo.systemName || 'N/A'],
        ['System ID', systemInfo.systemId || 'N/A'],
        ['Description', systemInfo.description || 'N/A'],
        ['Organization', systemInfo.organization || 'N/A'],
        ['System Owner', systemInfo.systemOwner || 'N/A'],
        ['Assessor Details', systemInfo.assessorDetails || 'N/A'],
        ['Data/System Classification', (systemInfo.securityLevel || 'N/A').toUpperCase()],
        ['System Status', formatSystemStatus(systemInfo.status) || 'N/A'],
        ['System Type', systemInfo.systemType || 'N/A'],
        ['Authorization Date', systemInfo.authorizationDate || 'N/A']
      ];
      
      systemDetails.forEach(([label, value]) => {
        doc.fontSize(10).fillColor('#1e293b').text(`${label}:`, { continued: false, bold: true });
        doc.fontSize(10).fillColor('#64748b').text(`  ${value}`, { indent: 20 });
        doc.moveDown(0.3);
      });

      // CSP Providers Section
      if (systemInfo.cspIaaS || systemInfo.cspPaaS || systemInfo.cspSaaS) {
        doc.moveDown(0.5);
        doc.fontSize(11).fillColor('#2563eb').text('CSP Providers:', { underline: true });
        doc.moveDown(0.3);
        
        if (systemInfo.cspIaaS) {
          doc.fontSize(10).fillColor('#1e293b').text('IaaS Provider:', { continued: false });
          doc.fontSize(10).fillColor('#64748b').text(`  ${systemInfo.cspIaaS}`, { indent: 20 });
          doc.moveDown(0.3);
        }
        if (systemInfo.cspPaaS) {
          doc.fontSize(10).fillColor('#1e293b').text('PaaS Provider:', { continued: false });
          doc.fontSize(10).fillColor('#64748b').text(`  ${systemInfo.cspPaaS}`, { indent: 20 });
          doc.moveDown(0.3);
        }
        if (systemInfo.cspSaaS) {
          doc.fontSize(10).fillColor('#1e293b').text('SaaS Provider:', { continued: false });
          doc.fontSize(10).fillColor('#64748b').text(`  ${systemInfo.cspSaaS}`, { indent: 20 });
          doc.moveDown(0.3);
        }
      }

      // Control Statistics
      doc.addPage();
      addSectionHeader(doc, 'Control Assessment Summary');
      
      const stats = {
        total: controls.length,
        effective: controls.filter(c => c.status === 'effective').length,
        alternateControl: controls.filter(c => c.status === 'alternate-control').length,
        ineffective: controls.filter(c => c.status === 'ineffective').length,
        noVisibility: controls.filter(c => c.status === 'no-visibility').length,
        notImplemented: controls.filter(c => c.status === 'not-implemented').length,
        notApplicable: controls.filter(c => c.status === 'not-applicable').length,
        notAssessed: controls.filter(c => c.status === 'not-assessed').length
      };
      
      const implementationRate = stats.total > 0 
        ? (((stats.effective + stats.alternateControl) / stats.total) * 100).toFixed(1) 
        : 0;
      
      doc.fontSize(11).fillColor('#1e293b').text(`Total Controls: ${stats.total}`);
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#16a34a').text(`✓ Effective: ${stats.effective}`);
      doc.fontSize(11).fillColor('#84cc16').text(`✓ Alternate Control: ${stats.alternateControl}`);
      doc.fontSize(11).fillColor('#ef4444').text(`✗ Ineffective: ${stats.ineffective}`);
      doc.fontSize(11).fillColor('#64748b').text(`◯ No Visibility: ${stats.noVisibility}`);
      doc.fontSize(11).fillColor('#f97316').text(`◯ Not Implemented: ${stats.notImplemented}`);
      doc.fontSize(11).fillColor('#9ca3af').text(`− Not Applicable: ${stats.notApplicable}`);
      doc.fontSize(11).fillColor('#a855f7').text(`? Not Assessed: ${stats.notAssessed}`);
      doc.moveDown(1);
      doc.fontSize(12).fillColor('#2563eb').text(`Implementation Rate: ${implementationRate}%`, { bold: true });

      // Control Details
      doc.addPage();
      addSectionHeader(doc, 'Control Implementation Details');
      
      controls.forEach((control, index) => {
        // Check if we need a new page
        if (doc.y > 700) {
          doc.addPage();
        }
        
        // Control ID Header
        doc.fontSize(12)
           .fillColor('#2563eb')
           .text(`Control ID: ${control.id}`, { underline: true, bold: true });
        doc.moveDown(0.4);
        
        // Control Domain
        if (control.groupTitle) {
          doc.fontSize(9).fillColor('#1e293b').text('Control Domain:', { bold: true, continued: true });
          doc.fontSize(9).fillColor('#64748b').text(` ${control.groupTitle}`, { bold: false });
          doc.moveDown(0.3);
        }
        
        // Control Title
        doc.fontSize(9).fillColor('#1e293b').text('Control Title:', { bold: true, continued: true });
        doc.fontSize(9).fillColor('#64748b').text(` ${control.title || 'N/A'}`, { bold: false });
        doc.moveDown(0.3);
        
        // Control Description
        if (control.description) {
          doc.fontSize(9).fillColor('#1e293b').text('Control Description:', { bold: true });
          doc.fontSize(8).fillColor('#64748b').text(control.description, { width: 500, align: 'justify' });
          doc.moveDown(0.4);
        }
        
        // Divider before implementation details
        doc.strokeColor('#cbd5e1')
           .lineWidth(1)
           .moveTo(50, doc.y)
           .lineTo(550, doc.y)
           .stroke();
        doc.moveDown(0.4);
        
        // Implementation Status
        const statusColor = getStatusColor(control.status);
        doc.fontSize(9)
           .fillColor('#1e293b')
           .text('Implementation Status: ', { bold: true, continued: true });
        doc.fontSize(9)
           .fillColor(statusColor)
           .text(formatStatus(control.status), { bold: true });
        doc.moveDown(0.3);
        
        // Implementation Details
        if (control.implementation) {
          doc.fontSize(9).fillColor('#1e293b').text('Implementation Details:', { bold: true });
          doc.fontSize(8).fillColor('#64748b').text(control.implementation, { width: 500, align: 'justify' });
          doc.moveDown(0.3);
        }
        
        // Responsible Party
        if (control.responsibleParty) {
          doc.fontSize(8).fillColor('#64748b').text(`Responsible Party: ${control.responsibleParty}`);
          doc.moveDown(0.2);
        }
        
        // Consumer Guidance
        if (control.consumerGuidance) {
          doc.fontSize(8).fillColor('#1e293b').text('Consumer Guidance:', { bold: true });
          doc.fontSize(8).fillColor('#64748b').text(control.consumerGuidance, { width: 500 });
          doc.moveDown(0.2);
        }
        
        // Cloud Provider Responsibility
        if (control.controlOwner) {
          doc.fontSize(8).fillColor('#64748b').text(`Cloud Provider Responsibility: ${control.controlOwner}`);
          doc.moveDown(0.2);
        }
        
        // Control Type
        if (control.controlType) {
          doc.fontSize(8).fillColor('#64748b').text(`Control Type: ${control.controlType}`);
          doc.moveDown(0.2);
        }
        
        // Testing & Evidence (if not automated)
        if (control.controlType !== 'Automated by Tools') {
          if (control.evidence) {
            doc.fontSize(8).fillColor('#64748b').text(`Evidence Location: ${control.evidence}`);
            doc.moveDown(0.2);
          }
          if (control.testingProcedure) {
            doc.fontSize(8).fillColor('#1e293b').text('Testing Procedure:', { bold: true });
            doc.fontSize(8).fillColor('#64748b').text(control.testingProcedure, { width: 500 });
            doc.moveDown(0.2);
          }
        } else {
          // API information for automated controls
          if (control.apiUrl) {
            doc.fontSize(8).fillColor('#64748b').text(`API URL: ${control.apiUrl}`);
            doc.moveDown(0.2);
          }
          
          // API Data History
          if (control.apiDataHistory && control.apiDataHistory.length > 0) {
            doc.fontSize(8).fillColor('#1e293b').text('API Data History (Last 12 Entries):', { bold: true });
            control.apiDataHistory.slice(0, 12).forEach((entry, idx) => {
              const timestamp = new Date(entry.timestamp).toLocaleString();
              const status = entry.success ? '✓ Success' : '✗ Failed';
              doc.fontSize(7).fillColor('#64748b').text(`${idx + 1}. ${timestamp} - ${status}`);
              if (entry.data) {
                doc.fontSize(7).fillColor('#94a3b8').text(`   Data: ${JSON.stringify(entry.data).substring(0, 100)}...`);
              }
            });
            doc.moveDown(0.2);
          }
        }
        
        // Remarks
        if (control.remarks) {
          doc.fontSize(8).fillColor('#1e293b').text('Remarks:', { bold: true });
          doc.fontSize(8).fillColor('#64748b').text(control.remarks, { width: 500 });
          doc.moveDown(0.2);
        }
        
        doc.moveDown(0.5);
        
        // Add separator line between controls
        doc.strokeColor('#e5e7eb')
           .lineWidth(2)
           .moveTo(50, doc.y)
           .lineTo(550, doc.y)
           .stroke();
        doc.moveDown(0.5);
      });

      // Footer on each page
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8)
           .fillColor('#9ca3af')
           .text(
             `Page ${i + 1} of ${range.count} - Keekar's OSCAL SOA/SSP/CCM Generator`,
             50,
             doc.page.height - 50,
             { align: 'center' }
           );
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// Helper Functions
function addSectionHeader(doc, title) {
  doc.fontSize(16)
     .fillColor('#2563eb')
     .text(title);
  doc.moveDown(0.5);
  doc.strokeColor('#2563eb')
     .lineWidth(2)
     .moveTo(50, doc.y)
     .lineTo(550, doc.y)
     .stroke();
  doc.moveDown(1);
}

function formatStatus(status) {
  const statusMap = {
    'not-assessed': 'Not Assessed',
    'effective': 'Effective',
    'alternate-control': 'Alternate Control',
    'ineffective': 'Ineffective',
    'no-visibility': 'No Visibility',
    'not-implemented': 'Not Implemented',
    'not-applicable': 'Not Applicable'
  };
  return statusMap[status] || status;
}

function formatSystemStatus(status) {
  const statusMap = {
    'under-development': 'Under Development',
    'operational': 'Operational',
    'under-major-modification': 'Under Major Modification',
    'disposition': 'Disposition',
    'other': 'Other'
  };
  return statusMap[status] || status;
}

function getStatusColor(status) {
  const colorMap = {
    'effective': '#16a34a',
    'alternate-control': '#84cc16',
    'ineffective': '#ef4444',
    'no-visibility': '#64748b',
    'not-implemented': '#f97316',
    'not-applicable': '#9ca3af',
    'not-assessed': '#a855f7'
  };
  return colorMap[status] || '#64748b';
}

