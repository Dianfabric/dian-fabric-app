import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const outDir = '/tmp/dian-catalog-profile-test-dist';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

execFileSync('npx', [
  'tsc',
  'src/lib/catalog-profile.ts',
  '--target', 'ES2022',
  '--module', 'NodeNext',
  '--moduleResolution', 'NodeNext',
  '--skipLibCheck',
  '--outDir', outDir,
], { stdio: 'inherit' });

assert.equal(existsSync(`${outDir}/catalog-profile.js`), true);
const mod = await import(`file://${outDir}/catalog-profile.js`);

assert.equal(mod.cleanText('  DIAN  '), 'DIAN');
assert.equal(mod.cleanText('   '), null);

const complete = mod.buildCatalogCustomerPayload(
  {
    name: ' 홍길동 ',
    phone: ' 010-1111-2222 ',
    company_name: ' 디안 ',
    position: ' 실장 ',
    favorite_fabrics: ' boucle, linen ',
  },
  { id: 'auth-1', email: 'user@example.com', app_metadata: { provider: 'email' }, user_metadata: {} },
);
assert.deepEqual(complete, {
  auth_user_id: 'auth-1',
  email: 'user@example.com',
  name: '홍길동',
  phone: '010-1111-2222',
  company_name: '디안',
  position: '실장',
  favorite_fabrics: 'boucle, linen',
  provider: 'email',
  profile_completed: true,
});

const incomplete = mod.buildCatalogCustomerPayload(
  { name: '카카오사용자' },
  { id: 'auth-2', email: 'kakao@example.com', app_metadata: { providers: ['kakao'] }, user_metadata: { name: '카카오' } },
);
assert.equal(incomplete.provider, 'kakao');
assert.equal(incomplete.profile_completed, false);
assert.deepEqual(mod.missingRequiredCatalogProfileFields(incomplete), ['phone', 'company_name']);

console.log('catalog-profile tests passed');
