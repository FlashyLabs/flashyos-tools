// The estate charter generator and the mesh roster, held to their contracts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const here = new URL('.', import.meta.url).pathname;
const GEN = join(here, 'estate-charter.mjs');
const ROSTER = join(here, 'vendor-mesh-roster.mjs');
const PROVISION = join(here, 'estate-provision.mjs');
const AAO = join(here, 'vendor-aao-check.mjs');
const KINDS = ['spec', 'platform', 'site', 'library', 'tooling', 'client', 'vault'];

function gen(dir, full, kind) {
  return execFileSync('node', [GEN, dir, full, kind], { encoding: 'utf8' });
}

test('every kind generates a valid five-role charter (five agents)', () => {
  for (const kind of KINDS) {
    const dir = mkdtempSync(join(tmpdir(), `charter-${kind}-`));
    const out = gen(dir, `FlashyLabs/probe-${kind}`, kind);
    assert.match(out, /charter\(5 roles\) valid/, `${kind}: ${out}`);
    const c = JSON.parse(readFileSync(join(dir, 'flashyos.roles.json'), 'utf8'));
    assert.equal(c.aao, '0.1');
    assert.equal(c.roles.length, 5, `${kind}: five roles = five agents`);
    // the real AAO checker, not a paraphrase of it
    execFileSync('node', [AAO, 'validate', join(dir, 'flashyos.roles.json')], { stdio: 'pipe' });
    // a role name is a job, within the naming bounds
    for (const r of c.roles) {
      assert.ok(r.name.length >= 3 && r.name.length <= 24, `${kind}: role "${r.name}" length`);
      assert.ok(r.family && r.purpose && r.measure && r.capabilities.length, `${kind}: role "${r.name}" is fully declared`);
      assert.ok(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(r.humanApprovalAtOrAbove));
      assert.deepEqual(r.worksIn, [`probe-${kind}`]);
    }
    // the handshake capabilities are a subset of what a role carries (x-capability)
    const advertised = new Set(c.roles.flatMap((r) => r['x-capability'] || []));
    assert.ok(advertised.size >= 1, `${kind}: at least one mesh capability`);
  }
});

test('the generator refuses to overwrite an existing charter', () => {
  const dir = mkdtempSync(join(tmpdir(), 'charter-skip-'));
  gen(dir, 'FlashyLabs/probe-spec', 'spec');
  const before = readFileSync(join(dir, 'flashyos.roles.json'), 'utf8');
  let out = '';
  try { out = gen(dir, 'FlashyLabs/probe-spec', 'platform'); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); } // exit 3 on skip
  assert.match(out.toString(), /SKIP/);
  assert.equal(readFileSync(join(dir, 'flashyos.roles.json'), 'utf8'), before, 'charter unchanged');
});

test('the committed roster validates against its checker', () => {
  const out = execFileSync('node', [ROSTER, 'check', join(here, 'orgs.json')], { encoding: 'utf8' });
  assert.match(out, /mesh-roster\/1/);
});

test('every roster org slug is unique and kebab; every repo unique', () => {
  const doc = JSON.parse(readFileSync(join(here, 'orgs.json'), 'utf8'));
  const orgs = new Set(), repos = new Set();
  for (const o of doc.orgs) {
    assert.match(o.org, /^[a-z0-9]+(-[a-z0-9]+)*$/, `slug ${o.org}`);
    assert.ok(!orgs.has(o.org), `duplicate slug ${o.org}`); orgs.add(o.org);
    assert.ok(!repos.has(o.repo), `duplicate repo ${o.repo}`); repos.add(o.repo);
    // a present charter's measured role count is a positive integer
    if (o.charter.present) assert.ok(Number.isInteger(o.charter.roles) && o.charter.roles > 0);
  }
});

test('the provision planner names a tier per ready org and refuses --commit without DATABASE_URL', () => {
  const plan = execFileSync('node', [PROVISION, join(here, 'orgs.json'), '--json'], { encoding: 'utf8' });
  const doc = JSON.parse(plan);
  assert.equal(doc.contract, 'provision-plan/1');
  for (const p of doc.plan) {
    assert.ok(p.command.includes('provision-org-from-charter'), 'names the real provisioning script');
    assert.ok(['FREE', 'GROWTH', 'ENTERPRISE'].includes(p.tier));
    if (p.roles <= 5) assert.equal(p.tier, 'FREE', 'five agents fit the FREE tier');
  }
  // --commit refuses without DATABASE_URL (a live org is a person's write)
  const env = { ...process.env }; delete env.DATABASE_URL;
  let failed = false;
  try { execFileSync('node', [PROVISION, join(here, 'orgs.json'), '--commit'], { env, stdio: 'pipe' }); }
  catch { failed = true; }
  assert.ok(failed, '--commit must refuse without DATABASE_URL');
});

test('the vendored AAO checker is byte-identical to canon when the sibling is present', () => {
  const sibling = join(here, '..', '..', 'aao', 'vendor-aao-check.mjs');
  if (!existsSync(sibling)) { console.log('# aao sibling absent — drift UNKNOWN, not passed'); return; }
  assert.equal(readFileSync(join(here, 'vendor-aao-check.mjs'), 'utf8'), readFileSync(sibling, 'utf8'), 're-vendor mesh/vendor-aao-check.mjs from ../aao');
});
