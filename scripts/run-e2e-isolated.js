#!/usr/bin/env node
/**
 * Run the full e2e suite against a throw-away database.
 *
 * Why: the e2e specs create tenants/users/logs and never delete them. Running
 * them against the dev database (DB_NAME) pollutes demo data. This runner
 * builds a dedicated database from scratch, migrates + seeds it, runs Jest,
 * then drops it.
 *
 * Usage:
 *   npm run test:e2e:isolated                 # full suite, fresh DB, dropped after
 *   npm run test:e2e:isolated -- billing      # only matching spec files
 *   npm run test:e2e:isolated -- --keep       # keep the DB for debugging
 *
 * Environment (optional):
 *   E2E_DB_NAME          default business_os_e2e
 *   E2E_MAINTENANCE_DB   default postgres
 *   KEEP_E2E_DB=1        same as --keep
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

require('dotenv').config();

const ROOT = path.resolve(__dirname, '..');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = parseInt(process.env.DB_PORT || '5432', 10);
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
const APP_DB = process.env.DB_NAME || 'business_os';

const E2E_DB = process.env.E2E_DB_NAME || 'business_os_e2e';
const MAINTENANCE_DB = process.env.E2E_MAINTENANCE_DB || 'postgres';

const rawArgs = process.argv.slice(2);
const KEEP = rawArgs.includes('--keep') || process.env.KEEP_E2E_DB === '1';
const jestArgs = rawArgs.filter((arg) => arg !== '--keep');

function assertIdentifier(name) {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(
      `Unsafe database name "${name}". Only letters, digits and "_" are allowed.`,
    );
  }
}

async function withAdminClient(fn) {
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: MAINTENANCE_DB,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function dropDatabase(client, name) {
  try {
    await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  } catch (error) {
    // WITH (FORCE) needs PostgreSQL 13+; fall back for older servers.
    if (!/syntax|FORCE/i.test(error.message)) throw error;
    await client.query(`DROP DATABASE IF EXISTS "${name}"`);
  }
}

/**
 * Node flags that let us run TypeScript entrypoints directly, without relying
 * on a shell (and without the `shell: true` deprecation warning on Windows).
 */
const TS_NODE_FLAGS = [
  '-r',
  'ts-node/register',
  '-r',
  'tsconfig-paths/register',
];

function runStep(label, command, commandArgs, env) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, commandArgs, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });

  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

async function main() {
  assertIdentifier(E2E_DB);
  if (E2E_DB === APP_DB) {
    throw new Error(
      `E2E_DB_NAME must differ from DB_NAME (${APP_DB}) – refusing to drop your app database.`,
    );
  }

  const jestBin = path.join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js');
  if (!fs.existsSync(jestBin)) {
    throw new Error('jest not found. Run "npm install" first.');
  }

  console.log(
    `[e2e] isolated database: ${E2E_DB} @ ${DB_HOST}:${DB_PORT} (app DB: ${APP_DB})`,
  );

  await withAdminClient(async (client) => {
    console.log(`[e2e] recreating database ${E2E_DB}`);
    await dropDatabase(client, E2E_DB);
    await client.query(`CREATE DATABASE "${E2E_DB}"`);
  });

  const env = {
    DB_NAME: E2E_DB,
    E2E_DB_NAME: E2E_DB,
    E2E_ISOLATED: '1',
  };
  let failed = false;

  try {
    runStep(
      'migrations',
      process.execPath,
      [
        ...TS_NODE_FLAGS,
        path.join(ROOT, 'node_modules', 'typeorm', 'cli.js'),
        'migration:run',
        '-d',
        'src/config/typeorm.config.ts',
      ],
      env,
    );
    runStep(
      'seed',
      process.execPath,
      [
        ...TS_NODE_FLAGS,
        path.join(ROOT, 'src', 'database', 'seeds', 'run-seed.ts'),
      ],
      env,
    );
    runStep(
      'e2e tests',
      process.execPath,
      [
        jestBin,
        '--config',
        './test/jest-e2e.json',
        '--runInBand',
        ...jestArgs,
      ],
      env,
    );
  } catch (error) {
    failed = true;
    console.error(`\n[e2e] ${error.message}`);
  }

  if (KEEP) {
    console.log(`\n[e2e] kept database "${E2E_DB}" (--keep / KEEP_E2E_DB=1)`);
    console.log(`[e2e] inspect it with: psql -d ${E2E_DB}`);
  } else {
    await withAdminClient((client) => dropDatabase(client, E2E_DB));
    console.log(`[e2e] dropped database "${E2E_DB}"`);
  }

  return failed ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`\n[e2e] ${error.message ?? error}\n`);
    process.exit(1);
  });

