import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const outDir = '/tmp/dian-catalog-admin-test-dist';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

execFileSync('npx', [
  'tsc',
  'src/lib/catalog-admin-utils.ts',
  '--target', 'ES2022',
  '--module', 'NodeNext',
  '--moduleResolution', 'NodeNext',
  '--skipLibCheck',
  '--outDir', outDir,
], { stdio: 'inherit' });

assert.equal(existsSync(`${outDir}/catalog-admin-utils.js`), true);
const mod = await import(`file://${outDir}/catalog-admin-utils.js`);

assert.deepEqual(mod.parseCatalogAdminList(' A@example.com, b@example.com ,, '), ['a@example.com', 'b@example.com']);
assert.equal(mod.isCatalogAdminUser({ id: 'u1', email: 'admin@example.com' }, ['admin@example.com'], []), true);
assert.equal(mod.isCatalogAdminUser({ id: 'u2', email: 'user@example.com' }, ['admin@example.com'], ['u2']), true);
assert.equal(mod.isCatalogAdminUser({ id: 'u3', email: 'user@example.com' }, ['admin@example.com'], []), false);
assert.equal(mod.isCatalogAdminUser({ id: 'u4', email: null }, [], ['u4']), true);

console.log('catalog-admin-auth tests passed');
