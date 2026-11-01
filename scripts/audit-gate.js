#!/usr/bin/env node
/**
 * Production-dependency audit gate.
 *
 * Fails CI when `npm audit --omit=dev` reports a critical/high advisory that is
 * not explicitly allowlisted (with owner, mitigation and expiry) in
 * security/audit-allowlist.json.
 *
 * Usage:
 *   npm run audit:gate
 *   node scripts/audit-gate.js --audit-json=tmp/audit.json   # offline / tests
 *   node scripts/audit-gate.js --allowlist=path/to/file.json
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BLOCKING = new Set(['critical', 'high']);

function argValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

const allowlistPath = path.resolve(
  ROOT,
  argValue('allowlist') || 'security/audit-allowlist.json',
);
const auditJsonPath = argValue('audit-json');

function parseJson(text) {
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

function loadAllowlist() {
  if (!fs.existsSync(allowlistPath)) {
    throw new Error(`Allowlist not found: ${allowlistPath}`);
  }
  const parsed = parseJson(fs.readFileSync(allowlistPath, 'utf8'));
  return Array.isArray(parsed.entries) ? parsed.entries : [];
}

function npmInvocation() {
  if (process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, 'audit', '--omit=dev', '--json'],
    };
  }
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm audit --omit=dev --json'],
    };
  }
  return { command: 'npm', args: ['audit', '--omit=dev', '--json'] };
}

function runAudit() {
  if (auditJsonPath) {
    return fs.readFileSync(path.resolve(ROOT, auditJsonPath), 'utf8');
  }
  const invocation = npmInvocation();
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`npm audit failed to start: ${result.error.message}`);
  }
  // npm audit exits 1 when vulnerabilities exist – the JSON is still valid.
  if (!result.stdout || !result.stdout.trim().startsWith('{')) {
    throw new Error(
      `npm audit returned no JSON (exit ${result.status}): ${result.stderr || ''}`,
    );
  }
  return result.stdout;
}

function main() {
  const allowEntries = loadAllowlist();
  const report = parseJson(runAudit());
  const vulnerabilities = report.vulnerabilities || {};

  const blocking = Object.entries(vulnerabilities).filter(([, vuln]) =>
    BLOCKING.has(vuln.severity),
  );

  const failures = [];
  const allowed = [];

  for (const [name, vuln] of blocking) {
    const entry = allowEntries.find((item) => item.module === name);
    if (!entry) {
      failures.push(
        `${name} (${vuln.severity}) is not allowlisted – add it with owner, mitigation and expiry or fix it`,
      );
      continue;
    }
    if (entry.severity !== vuln.severity && entry.severity !== 'critical') {
      failures.push(
        `${name}: allowlist covers "${entry.severity}" but audit reports "${vuln.severity}"`,
      );
      continue;
    }
    if (!entry.owner || !entry.mitigation || !entry.expiresOn) {
      failures.push(
        `${name}: allowlist entry must include owner, mitigation and expiresOn`,
      );
      continue;
    }
    const expiry = new Date(`${entry.expiresOn}T23:59:59Z`);
    if (Number.isNaN(expiry.getTime()) || expiry < new Date()) {
      failures.push(
        `${name}: allowlist entry expired on ${entry.expiresOn} – re-review the advisory`,
      );
      continue;
    }
    allowed.push(`${name} (${vuln.severity}, expires ${entry.expiresOn})`);
  }

  const stale = allowEntries.filter(
    (entry) =>
      !Object.prototype.hasOwnProperty.call(vulnerabilities, entry.module),
  );

  const counts = (report.metadata && report.metadata.vulnerabilities) || {};
  console.log(
    `[audit-gate] production deps → critical=${counts.critical || 0} high=${
      counts.high || 0
    } moderate=${counts.moderate || 0} low=${counts.low || 0}`,
  );
  if (allowed.length) {
    console.log('[audit-gate] allowlisted:');
    for (const item of allowed) console.log(`  - ${item}`);
  }
  if (stale.length) {
    console.warn(
      `[audit-gate] stale allowlist entries (no current advisory, safe to remove): ${stale
        .map((entry) => entry.module)
        .join(', ')}`,
    );
  }

  if (failures.length) {
    console.error('[audit-gate] FAILED:');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log('[audit-gate] PASS – no unallowlisted critical/high advisories');
}

try {
  main();
} catch (error) {
  console.error(`[audit-gate] ERROR: ${error.message}`);
  process.exit(2);
}
