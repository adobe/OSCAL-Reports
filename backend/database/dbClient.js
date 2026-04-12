/**
 * PostgreSQL client and test connection for Database Integration.
 * Used by Platform Settings (test-connection) and future schema-less storage.
 * Supports password auth and AWS RDS IAM database authentication (authMode: iam).
 *
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import pg from 'pg';
import { Signer } from '@aws-sdk/rds-signer';

const { Client } = pg;

/**
 * @param {string} host
 * @param {number} port
 * @param {string} user
 * @returns {Promise<string>}
 */
async function getIamAuthToken(host, port, user) {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const signer = new Signer({
    hostname: host,
    port,
    username: user,
    region
  });
  return signer.getAuthToken();
}

/**
 * Build pg Client config from databaseConfig (host, port, database, user, password, ssl, timeout).
 * For authMode iam, pass a freshly obtained token as password.
 * @param {Object} config - databaseConfig from getResolvedConfig()
 * @returns {Object} - Options suitable for new pg.Client(options)
 */
export function getClientConfig(config) {
  if (!config || !config.host || !config.database) {
    throw new Error('Database config requires host and database');
  }
  const port = Number(config.port) || 5432;
  const connectionTimeoutMillis = Number(config.connectionTimeout) || 10000;
  let ssl = false;
  if (config.sslMode === 'require' || config.sslMode === 'prefer') {
    ssl = { rejectUnauthorized: true };
  }
  return {
    host: config.host.trim(),
    port,
    database: config.database.trim(),
    user: (config.user || '').trim() || undefined,
    password: (config.password || '').trim() || undefined,
    connectionTimeoutMillis,
    ssl
  };
}

/**
 * Create a pg Client (not connected). Caller must connect, use, and end.
 * Prefer connectPgClient() when authMode may be iam.
 * @param {Object} config - databaseConfig from getResolvedConfig()
 * @returns {pg.Client}
 */
export function getClient(config) {
  return new Client(getClientConfig(config));
}

/**
 * Connect using resolved credentials (RDS IAM token when authMode is iam).
 * @param {Object} dbConfig - databaseConfig from getResolvedConfig()
 * @returns {Promise<pg.Client>}
 */
export async function connectPgClient(dbConfig) {
  if (!dbConfig || !dbConfig.host || !dbConfig.database) {
    throw new Error('Database config requires host and database');
  }
  const effective = { ...dbConfig };
  if (dbConfig.authMode === 'iam') {
    const user = (dbConfig.user || '').trim();
    if (!user) {
      throw new Error('IAM database authentication requires a database user');
    }
    const host = dbConfig.host.trim();
    const port = Number(dbConfig.port) || 5432;
    effective.password = await getIamAuthToken(host, port, user);
  }
  const client = new Client(getClientConfig(effective));
  await client.connect();
  return client;
}

/**
 * Idempotent creation of extended_data table for schema-less storage.
 * Safe to call on every connection; no migrations needed for new fields (they go in payload JSONB).
 * @param {pg.Client} client - Connected pg Client
 */
export async function ensureExtendedDataTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS extended_data (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (scope, scope_id)
    )
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS extended_data_scope_scope_id ON extended_data (scope, scope_id)
  `);
  await client.query(`
    CREATE INDEX IF NOT EXISTS extended_data_payload_gin ON extended_data USING GIN (payload)
  `);
}

/** Default options for Adobe Team Responsible dropdown (seed when Adobe_Teams table is empty). */
const ADOBE_TEAMS_SEED = [
  { label: 'Adobe Corporate', sort_order: 1 },
  { label: 'Adobe Product Engineering', sort_order: 2 },
  { label: 'Adobe SoC', sort_order: 3 },
  { label: 'Adobe Service Owner', sort_order: 4 },
  { label: 'Customer Success Team', sort_order: 5 }
];

/**
 * Idempotent creation and seed of Adobe_Teams lookup table.
 * Table name: adobe_teams (PostgreSQL lowercases unquoted identifiers).
 * Safe to call on every connection; seeds the five options if table is empty.
 * @param {pg.Client} client - Connected pg Client
 */
export async function ensureAdobeTeamsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS adobe_teams (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    )
  `);
  const countResult = await client.query('SELECT COUNT(*) AS c FROM adobe_teams');
  const count = parseInt(countResult.rows[0]?.c ?? '0', 10);
  if (count === 0) {
    for (const row of ADOBE_TEAMS_SEED) {
      await client.query(
        'INSERT INTO adobe_teams (label, sort_order) VALUES ($1, $2)',
        [row.label, row.sort_order]
      );
    }
  }
}

/** @deprecated Use ensureAdobeTeamsTable. Kept for backward compatibility. */
export async function ensureAdobeTeamOptionsTable(client) {
  return ensureAdobeTeamsTable(client);
}

/**
 * Fetch Adobe Team options for dropdown from adobe_teams (sorted by sort_order).
 * Call ensureAdobeTeamsTable(client) before using.
 * @param {pg.Client} client - Connected pg Client
 * @returns {Promise<Array<{ id: number, label: string }>>}
 */
export async function getAdobeTeamOptions(client) {
  const result = await client.query(
    'SELECT id, label FROM adobe_teams ORDER BY sort_order ASC, id ASC'
  );
  return result.rows.map((r) => ({ id: Number(r.id), label: String(r.label || '') }));
}

/**
 * Test database connectivity: connect, run SELECT 1, ensure extended_data table exists, then close.
 * Uses resolved config (password from pass/env or IAM token). Do not log password or token.
 * @param {Object} config - databaseConfig from getResolvedConfig()
 * @returns {Promise<{ ok: true }>}
 * @throws {Error} on connection or query failure
 */
export async function testConnection(config) {
  if (!config || !config.enabled) {
    throw new Error('Database integration is not enabled');
  }
  const client = await connectPgClient(config);
  try {
    await client.query('SELECT 1 AS ok');
    await ensureExtendedDataTable(client);
    await ensureAdobeTeamsTable(client);
    return { ok: true };
  } finally {
    await client.end().catch(() => {});
  }
}
