/**
 * Sync export data (controls + system info) to the connected database when Database Integration is enabled.
 * Called on every export (SSP, PDF, Excel, CCM, SAR). If DB is enabled but unreachable, throws so caller can return 503.
 * Control rows are namespaced by system (scope_id = systemScopeId::controlId) so data from different systems is not comingled.
 * Every record includes systemId and systemName in the payload for easy identification.
 *
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import { getResolvedConfig } from '../configManager.js';
import { connectPgClient, ensureExtendedDataTable } from './dbClient.js';

/** Separator for composite scope_id (system::control) so control rows are unique per system. */
const SCOPE_ID_SEPARATOR = '::';

/**
 * Control fields to store in extended_data payload.
 * Excludes OSCAL-schema content (implementation narrative, remarks) so the DB holds only
 * custom/operational fields for reporting—not a duplicate of the OSCAL document.
 * - implementation: in OSCAL it lives in implemented-requirement.statements[].parts[].prose
 * - remarks: first-class property on implemented-requirement
 */
const CONTROL_PAYLOAD_KEYS = [
  'status', 'responsibleParty', 'controlOwner', 'consumerGuidance',
  'implementationDate', 'reviewDate', 'nextReviewDate', 'controlType', 'evidence', 'testingObjective',
  'testingProcedure', 'testingFrequency', 'lastTestDate', 'apiUrl', 'apiCredentialId', 'apiResponseData',
  'apiDataHistory', 'riskRating', 'frameworks', 'compensatingControls', 'exceptions',
  'id', 'title', 'catalogTitle', 'groupTitle', 'catalogDescription',
  'adobeTeamResponsible'
];

/**
 * Build payload object for a control (only include defined keys that exist).
 * Adds systemId and systemName from systemInfo so the record clearly identifies which system it belongs to.
 * @param {Object} control - Control object from frontend
 * @param {Object} systemInfo - System information (systemId, systemName)
 * @returns {Object} - Plain object for JSONB
 */
function controlPayload(control, systemInfo = {}) {
  const payload = {};
  for (const key of CONTROL_PAYLOAD_KEYS) {
    if (control[key] !== undefined && control[key] !== null) {
      payload[key] = control[key];
    }
  }
  // Ensure every control record reflects system identity for easy identification and to avoid comingling
  const systemId = (systemInfo.systemId ?? '').toString().trim();
  const systemName = (systemInfo.systemName ?? '').toString().trim();
  if (systemId) payload.systemId = systemId;
  if (systemName) payload.systemName = systemName;
  return payload;
}

/**
 * Sync controls and system info to extended_data table. No-op if Database Integration is disabled.
 * @param {Array} controls - Array of control objects
 * @param {Object} systemInfo - System information object
 * @returns {{ skipped: true } | { synced: true, controlsCount: number, systemSynced: boolean }}
 * @throws {Error} With code 'DATABASE_UNAVAILABLE' when DB is enabled but connection/write fails
 */
export async function syncExportToDatabase(controls = [], systemInfo = {}) {
  const config = getResolvedConfig();
  const dbConfig = config?.databaseConfig;
  if (!dbConfig || !dbConfig.enabled) {
    return { skipped: true };
  }

  const client = await connectPgClient(dbConfig);
  try {
    await ensureExtendedDataTable(client);

    const systemScopeId = (systemInfo.systemId || systemInfo.systemName || 'default').toString().trim() || 'default';

    // Ensure SSP payload always includes systemId and systemName for clear identification
    const sspPayload = { ...(systemInfo || {}) };
    if (!sspPayload.systemId) sspPayload.systemId = systemScopeId;
    if (!sspPayload.systemName) sspPayload.systemName = systemScopeId !== 'default' ? systemScopeId : '';

    // Upsert system/SSP row (scope_id = system identifier; payload includes systemName, systemId)
    await client.query(
      `INSERT INTO extended_data (scope, scope_id, payload, created_at, updated_at)
       VALUES ('ssp', $1, $2::jsonb, now(), now())
       ON CONFLICT (scope, scope_id) DO UPDATE SET payload = $2::jsonb, updated_at = now()`,
      [systemScopeId, JSON.stringify(sspPayload)]
    );

    // Upsert each control: scope_id = systemScopeId::controlId so different systems never overwrite the same row
    let controlsCount = 0;
    for (const control of controls) {
      const cid = (control.id || control['control-id'] || '').toString().trim();
      if (!cid) continue;
      const payload = controlPayload(control, systemInfo);
      const controlScopeId = `${systemScopeId}${SCOPE_ID_SEPARATOR}${cid}`;
      await client.query(
        `INSERT INTO extended_data (scope, scope_id, payload, created_at, updated_at)
         VALUES ('control', $1, $2::jsonb, now(), now())
         ON CONFLICT (scope, scope_id) DO UPDATE SET payload = $2::jsonb, updated_at = now()`,
        [controlScopeId, JSON.stringify(payload)]
      );
      controlsCount += 1;
    }

    return { synced: true, controlsCount, systemSynced: true };
  } catch (err) {
    const e = new Error(err.message || 'Database connection or write failed');
    e.code = 'DATABASE_UNAVAILABLE';
    throw e;
  } finally {
    await client.end().catch(() => {});
  }
}
