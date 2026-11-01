/**
 * E2E preflight (Jest `globalSetup`).
 *
 * `npm run test:e2e:isolated` always migrates + seeds a throw-away database,
 * but `npm run test:e2e` runs against whatever `DB_NAME` points at. After a
 * pull that adds migrations (e.g. C5/C6) that database may be behind, which
 * used to surface as dozens of unrelated "relation does not exist" failures.
 *
 * Fail fast with an actionable message instead.
 */
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const REQUIRED_TABLES = [
  'audit_events',
  'scim_endpoints',
  'sso_sessions',
  'compliance_evidence',
  'security_events',
];

module.exports = async () => {
  if (process.env.E2E_ISOLATED === '1') return; // runner migrates before Jest

  const database = process.env.DB_NAME || 'business_os';
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database,
  });

  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [REQUIRED_TABLES],
    );
    const present = new Set(rows.map((row) => row.table_name));
    const missing = REQUIRED_TABLES.filter((table) => !present.has(table));

    if (missing.length > 0) {
      throw new Error(
        [
          `E2E preflight failed: database "${database}" is missing tables: ${missing.join(', ')}.`,
          'Run "npm run migration:run" (then "npm run seed") first,',
          'or use "npm run test:e2e:isolated" which migrates automatically.',
        ].join(' '),
      );
    }
  } finally {
    await client.end();
  }
};
