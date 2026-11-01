/**
 * Jest global setup file for e2e.
 *
 * Structural isolation guard: when the isolated runner is used
 * (`npm run test:e2e:isolated`), the test database is forced here. Even if a
 * shell/session leaks `DB_NAME=business_os` into the environment, e2e can never
 * write to the application database.
 */
const isolated = process.env.E2E_ISOLATED === '1';

if (isolated) {
  const target = process.env.E2E_DB_NAME;
  if (!target) {
    throw new Error('E2E_DB_NAME is required when E2E_ISOLATED=1');
  }
  process.env.DB_NAME = target;
}
