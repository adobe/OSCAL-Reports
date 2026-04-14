#!/usr/bin/env node
/**
 * Statistical summary of extended_data table (no row dump).
 * Uses app config (and pass-resolved password). Run: node backend/scripts/query-extended-data.js
 */

import { getResolvedConfig } from '../configManager.js';
import { connectPgClient, ensureExtendedDataTable } from '../database/dbClient.js';

const SCOPE_ID_SEPARATOR = '::';

function isEmpty(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

async function main() {
  const config = getResolvedConfig();
  const dbConfig = config?.databaseConfig;

  if (!dbConfig?.enabled) {
    console.log('Database Integration is disabled in config.');
    process.exit(0);
  }
  if (!dbConfig?.host || !dbConfig?.database) {
    console.log('Database config missing host or database name.');
    process.exit(1);
  }

  const client = await connectPgClient(dbConfig);
  try {
    await ensureExtendedDataTable(client);

    const res = await client.query(
      `SELECT scope, scope_id, created_at, updated_at, payload
       FROM extended_data`
    );

    const rows = res.rows;
    const byScope = {};
    let minCreated = null;
    let maxCreated = null;
    let minUpdated = null;
    let maxUpdated = null;

    const controlRows = [];
    const sspRows = [];

    for (const r of rows) {
      byScope[r.scope] = (byScope[r.scope] || 0) + 1;
      const created = r.created_at ? new Date(r.created_at).getTime() : null;
      const updated = r.updated_at ? new Date(r.updated_at).getTime() : null;
      if (created != null) {
        minCreated = minCreated == null ? created : Math.min(minCreated, created);
        maxCreated = maxCreated == null ? created : Math.max(maxCreated, created);
      }
      if (updated != null) {
        minUpdated = minUpdated == null ? updated : Math.min(minUpdated, updated);
        maxUpdated = maxUpdated == null ? updated : Math.max(maxUpdated, updated);
      }
      if (r.scope === 'control') controlRows.push(r);
      else if (r.scope === 'ssp') sspRows.push(r);
    }

    // --- Summary ---
    console.log('========================================');
    console.log('  extended_data — Statistical Summary');
    console.log('========================================\n');

    console.log('Row counts');
    console.log('  Total rows:     ', rows.length);
    console.log('  By scope:       ', byScope);
    console.log('');

    console.log('Date range');
    console.log('  created_at:     ', minCreated ? new Date(minCreated).toISOString() : '—', '  to  ', maxCreated ? new Date(maxCreated).toISOString() : '—');
    console.log('  updated_at:     ', minUpdated ? new Date(minUpdated).toISOString() : '—', '  to  ', maxUpdated ? new Date(maxUpdated).toISOString() : '—');
    console.log('');

    // Control payload: field coverage (how many controls have non-empty value per key)
    if (controlRows.length > 0) {
      const keyCounts = {};
      const statusCounts = {};
      const bySystem = {}; // scope_id = systemScopeId::controlId or legacy plain controlId
      for (const r of controlRows) {
        const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
        const systemKey = r.scope_id.includes(SCOPE_ID_SEPARATOR)
          ? r.scope_id.split(SCOPE_ID_SEPARATOR)[0]
          : (p.systemId || p.systemName || '(legacy)');
        bySystem[systemKey] = (bySystem[systemKey] || 0) + 1;
        for (const k of Object.keys(p)) {
          if (!isEmpty(p[k])) keyCounts[k] = (keyCounts[k] || 0) + 1;
        }
        if (p.status != null && String(p.status).trim() !== '') {
          const s = String(p.status).trim();
          statusCounts[s] = (statusCounts[s] || 0) + 1;
        }
      }
      const n = controlRows.length;
      if (Object.keys(bySystem).length > 0) {
        console.log('Controls by system (scope_id or payload systemId/systemName)');
        const sysEntries = Object.entries(bySystem).sort((a, b) => b[1] - a[1]);
        for (const [sys, count] of sysEntries) {
          console.log(`  ${sys.padEnd(42)} ${String(count).padStart(5)} controls`);
        }
        console.log('');
      }
      console.log('Control payload — field coverage (non-empty)');
      console.log('  Controls total: ', n);
      const sortedKeys = Object.keys(keyCounts).sort();
      for (const k of sortedKeys) {
        const count = keyCounts[k];
        const pct = ((100 * count) / n).toFixed(1);
        console.log(`  ${k.padEnd(22)} ${String(count).padStart(5)} / ${n}  (${pct}%)`);
      }
      if (Object.keys(statusCounts).length > 0) {
        console.log('');
        console.log('Control implementation status — distribution');
        const statusEntries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]);
        for (const [status, count] of statusEntries) {
          const pct = ((100 * count) / n).toFixed(1);
          console.log(`  ${status.padEnd(24)} ${String(count).padStart(5)}  (${pct}%)`);
        }
      }
      console.log('');
    }

    // SSP: one row per system; just report count and payload keys
    if (sspRows.length > 0) {
      const allKeys = new Set();
      for (const r of sspRows) {
        const p = r.payload && typeof r.payload === 'object' ? r.payload : {};
        Object.keys(p).forEach((k) => allKeys.add(k));
      }
      console.log('SSP (system) payload');
      console.log('  Systems (rows): ', sspRows.length);
      console.log('  Payload keys:   ', [...allKeys].sort().join(', '));
      console.log('');
    }

    console.log('========================================');
  } catch (err) {
    console.error('Error:', err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error('  → Cannot reach database (check host/port and that DB is running).');
    } else if (err.code === 'ENOTFOUND') {
      console.error('  → Host not found (check host name).');
    }
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

main();
