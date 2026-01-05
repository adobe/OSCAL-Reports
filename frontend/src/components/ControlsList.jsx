/**
 * ControlsList Component - Display and manage list of security controls
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import React, { useState } from 'react';
import ControlItemCCM from './ControlItemCCM';
import './ControlsList.css';

function ControlsList({ controls, onControlUpdate, organizationName = 'Organization' }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterChange, setFilterChange] = useState('all');
  const [filterControlType, setFilterControlType] = useState('all');
  const [filterResponsibleParty, setFilterResponsibleParty] = useState('all');
  const [filterClass, setFilterClass] = useState('all');
  const [expandedControl, setExpandedControl] = useState(null);

  // Safety check: ensure controls is an array
  if (!controls || !Array.isArray(controls)) {
    console.error('ControlsList: controls is not an array:', controls);
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Error: No controls data available</p>
      </div>
    );
  }

  // Get unique groups
  const groups = ['all', ...new Set(controls.map(c => c.groupTitle).filter(Boolean))];

  // Get unique control types
  const controlTypes = ['all', ...new Set(controls.map(c => c.controlType).filter(Boolean))];

  // Get unique responsible parties
  const responsibleParties = ['all', ...new Set(controls.map(c => c.responsibleParty).filter(Boolean))];

  // Get unique classes
  const classes = ['all', ...new Set(controls.map(c => c.class).filter(Boolean))];

  // Check if any controls have change status
  const hasChangeData = controls.some(c => c.changeStatus);

  // Filter controls
  const filteredControls = controls.filter(control => {
    // Simple search in basic fields only (reverted from enhanced search)
    const matchesSearch = !searchTerm || 
      control.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      control.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      control.description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesGroup = filterGroup === 'all' || control.groupTitle === filterGroup;
    const matchesStatus = filterStatus === 'all' || control.status === filterStatus;
    const matchesChange = filterChange === 'all' || control.changeStatus === filterChange;
    const matchesControlType = filterControlType === 'all' || control.controlType === filterControlType;
    const matchesResponsibleParty = filterResponsibleParty === 'all' || control.responsibleParty === filterResponsibleParty;
    const matchesClass = filterClass === 'all' || control.class === filterClass;

    return matchesSearch && matchesGroup && matchesStatus && matchesChange && 
           matchesControlType && matchesResponsibleParty && matchesClass;
  });

  const toggleControl = (controlId) => {
    setExpandedControl(expandedControl === controlId ? null : controlId);
  };

  // Bulk actions
  const handleBulkStatusChange = (status) => {
    const statusLabels = {
      'effective': 'Effective',
      'alternate-control': 'Alternate Control',
      'not-implemented': 'Not Implemented',
      'not-applicable': 'Not Applicable'
    };
    const label = statusLabels[status] || status;
    
    if (window.confirm(`Set status to "${label}" for all filtered controls?`)) {
      filteredControls.forEach(control => {
        onControlUpdate(control.id, 'status', status);
      });
    }
  };

  return (
    <div className="controls-list-container">
      <div className="controls-toolbar">
        {/* Row 1: Search and Control Groups */}
        <div className="filters-row filters-row-1">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search controls..."
              className="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-box">
            <select
              className="filter-select"
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
            >
              <option value="all">All Groups</option>
              {groups.filter(g => g !== 'all').map(group => (
                <option key={group} value={group}>{group}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 2: Other Filters and Bulk Actions */}
        <div className="filters-row filters-row-2">
          <div className="filters-left">
            <select
              className="filter-select"
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
            >
              <option value="all">All Classes</option>
              {classes.filter(c => c !== 'all').map(cls => (
                <option key={cls} value={cls}>{cls}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="not-assessed">Not Assessed</option>
              <option value="effective">Effective</option>
              <option value="alternate-control">Alternate Control</option>
              <option value="ineffective">Ineffective</option>
              <option value="no-visibility">No Visibility</option>
              <option value="not-implemented">Not Implemented</option>
              <option value="not-applicable">Not Applicable</option>
            </select>

            <select
              className="filter-select"
              value={filterControlType}
              onChange={(e) => setFilterControlType(e.target.value)}
            >
              <option value="all">All Control Types</option>
              {controlTypes.filter(t => t !== 'all').map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>

            <select
              className="filter-select"
              value={filterResponsibleParty}
              onChange={(e) => setFilterResponsibleParty(e.target.value)}
            >
              <option value="all">All Responsible Parties</option>
              {responsibleParties.filter(rp => rp !== 'all').map(party => (
                <option key={party} value={party}>{party}</option>
              ))}
            </select>

            {hasChangeData && (
              <select
                className="filter-select filter-change"
                value={filterChange}
                onChange={(e) => setFilterChange(e.target.value)}
              >
                <option value="all">All Changes</option>
                <option value="new">🆕 New Controls</option>
                <option value="changed">⚠️ Changed Controls</option>
                <option value="unchanged">✓ Unchanged Controls</option>
              </select>
            )}
          </div>

          <div className="bulk-actions">
            <span className="bulk-label">Bulk Actions:</span>
            <button
              className="bulk-btn bulk-effective"
              onClick={() => handleBulkStatusChange('effective')}
              title="Mark all filtered as Effective"
            >
              ✓
            </button>
            <button
              className="bulk-btn bulk-alternate"
              onClick={() => handleBulkStatusChange('alternate-control')}
              title="Mark all filtered as Alternate Control"
            >
              ⚡
            </button>
            <button
              className="bulk-btn bulk-not-implemented"
              onClick={() => handleBulkStatusChange('not-implemented')}
              title="Mark all filtered as Not Implemented"
            >
              ✗
            </button>
            <button
              className="bulk-btn bulk-not-applicable"
              onClick={() => handleBulkStatusChange('not-applicable')}
              title="Mark all filtered as Not Applicable"
            >
              −
            </button>
          </div>
        </div>
      </div>

      <div className="controls-stats">
        <div className="stat">
          <span className="stat-label">Total:</span>
          <span className="stat-value">{controls.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Filtered:</span>
          <span className="stat-value">{filteredControls.length}</span>
        </div>
        <div className="stat stat-effective">
          <span className="stat-label">Effective:</span>
          <span className="stat-value">
            {controls.filter(c => c.status === 'effective').length}
          </span>
        </div>
        <div className="stat stat-alternate">
          <span className="stat-label">Alternate Control:</span>
          <span className="stat-value">
            {controls.filter(c => c.status === 'alternate-control').length}
          </span>
        </div>
        <div className="stat stat-ineffective">
          <span className="stat-label">Ineffective:</span>
          <span className="stat-value">
            {controls.filter(c => c.status === 'ineffective').length}
          </span>
        </div>
        <div className="stat stat-no-visibility">
          <span className="stat-label">No Visibility:</span>
          <span className="stat-value">
            {controls.filter(c => c.status === 'no-visibility').length}
          </span>
        </div>
        <div className="stat stat-not-implemented">
          <span className="stat-label">Not Implemented:</span>
          <span className="stat-value">
            {controls.filter(c => c.status === 'not-implemented').length}
          </span>
        </div>
        <div className="stat stat-na">
          <span className="stat-label">Not Applicable:</span>
          <span className="stat-value">
            {controls.filter(c => c.status === 'not-applicable').length}
          </span>
        </div>
        
        {hasChangeData && (
          <>
            <div className="stat-divider"></div>
            <div className="stat stat-new">
              <span className="stat-label">🆕 New:</span>
              <span className="stat-value">
                {controls.filter(c => c.changeStatus === 'new').length}
              </span>
            </div>
            <div className="stat stat-changed">
              <span className="stat-label">⚠️ Changed:</span>
              <span className="stat-value">
                {controls.filter(c => c.changeStatus === 'changed').length}
              </span>
            </div>
            <div className="stat stat-unchanged">
              <span className="stat-label">✓ Unchanged:</span>
              <span className="stat-value">
                {controls.filter(c => c.changeStatus === 'unchanged').length}
              </span>
            </div>
          </>
        )}
      </div>

      {hasChangeData && (
        <div className="comparison-banner">
          <span className="banner-icon">ℹ️</span>
          <span className="banner-text">
            Comparison mode active: Focus on <strong>{controls.filter(c => c.changeStatus === 'new' || c.changeStatus === 'changed').length}</strong> new or changed controls
          </span>
        </div>
      )}

      <div className="controls-list">
        {filteredControls.length === 0 ? (
          <div className="no-results">
            <p>No controls match your filters</p>
          </div>
        ) : (
          filteredControls.map(control => (
            <ControlItemCCM
              key={control.id}
              control={control}
              isExpanded={expandedControl === control.id}
              organizationName={organizationName}
              onToggle={() => toggleControl(control.id)}
              onUpdate={onControlUpdate}
              allControls={controls}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default ControlsList;

