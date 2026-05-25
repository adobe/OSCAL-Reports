/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { getResolvedConfig } from '../configManager.js';
import { normalizeAdobeTeamResponsibleSlots } from '../utils/adobeTeamResponsible.js';
import { connectPgClient, ensureExtendedDataTable } from './dbClient.js';

const SCOPE_ID_SEPARATOR = '::';

/**
 * @param {Array<Object>} controls - Control objects with id
 * @param {Object} systemInfo - systemId / systemName for scope_id prefix
 * @returns {Promise<{ merged: boolean, controls: Array<Object> }>}
 */
export async function mergeControlsFromExtendedData(controls = [], systemInfo = {}) {
  const config = getResolvedConfig();
  const dbConfig = config?.databaseConfig;
  if (!dbConfig?.enabled || !controls.length) {
    return { merged: false, controls };
  }
  if (!dbConfig.host || !dbConfig.database) {
    return { merged: false, controls };
  }

  const systemScopeId = (systemInfo.systemId || systemInfo.systemName || 'default').toString().trim() || 'default';
  const prefix = `${systemScopeId}${SCOPE_ID_SEPARATOR}`;

  const client = await connectPgClient(dbConfig);
  try {
    await ensureExtendedDataTable(client);
    const result = await client.query(
      `SELECT scope_id, payload FROM extended_data
       WHERE scope = 'control'
         AND strpos(scope_id, $1) = 1
         AND char_length(scope_id) > char_length($1)`,
      [prefix]
    );

    const byControlId = new Map();
    for (const row of result.rows) {
      const sid = String(row.scope_id || '');
      if (!sid.startsWith(prefix)) continue;
      const controlId = sid.slice(prefix.length);
      if (!controlId) continue;
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
      byControlId.set(controlId, payload);
    }

    if (byControlId.size === 0) {
      return { merged: false, controls };
    }

    const mergedControls = controls.map((c) => {
      const cid = (c.id || c['control-id'] || '').toString().trim();
      if (!cid) return c;
      const payload = byControlId.get(cid);
      if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'adobeTeamResponsible')) {
        return c;
      }
      return {
        ...c,
        adobeTeamResponsible: normalizeAdobeTeamResponsibleSlots(payload.adobeTeamResponsible)
      };
    });

    return { merged: true, controls: mergedControls };
  } finally {
    await client.end().catch(() => {});
  }
}
