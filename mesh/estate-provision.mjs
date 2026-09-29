#!/usr/bin/env node
// estate-provision.mjs — turn the roster into a provisioning plan.
//
//   node estate-provision.mjs <roster.json>          dry-run PLAN (the default)
//   node estate-provision.mjs <roster.json> --json   the plan as provision-plan/1
//   node estate-provision.mjs <roster.json> --commit  run it (needs DATABASE_URL)
//
// The FREE tier allows five agents, which is exactly a five-role charter. A
// charter with more than five roles needs a larger tier; the plan says which.
// --commit refuses without DATABASE_URL and never runs in a test.
import { readFileSync } from 'node:fs';
import process from 'node:process';

const TIER_CAP = { FREE: 5, GROWTH: 50, ENTERPRISE: 500 };
function tierFor(roles) {
  for (const [tier, cap] of Object.entries(TIER_CAP)) if (roles <= cap) return tier;
  return 'ENTERPRISE';
}

const [path, ...flags] = process.argv.slice(2);
if (!path) { console.error('usage: estate-provision.mjs <roster.json> [--json|--commit]'); process.exit(2); }
const doc = JSON.parse(readFileSync(path, 'utf8'));
const ready = (doc.orgs || []).filter((o) => o.charter?.present && o.charter?.valid && o.provision !== 'committed');

const plan = ready.map((o) => {
  const tier = tierFor(o.charter.roles);
  const charterPath = `flashyos.roles.json`; // relative to each repo checkout
  return {
    repo: o.repo, org: o.org, roles: o.charter.roles, tier,
    command: `npx tsx packages/api/scripts/provision-org-from-charter.ts --charter ${charterPath} --tier ${tier}`,
  };
});

if (flags.includes('--json')) {
  process.stdout.write(JSON.stringify({ contract: 'provision-plan/1', generated: new Date().toISOString().slice(0, 10), plan }, null, 2) + '\n');
  process.exit(0);
}

if (flags.includes('--commit')) {
  if (!process.env.DATABASE_URL) {
    console.error('refusing to commit: DATABASE_URL is not set. Provisioning writes to the FlashyOS database and is run by whoever holds that, never by a workflow without the secret.');
    process.exit(1);
  }
  console.error('commit path is deliberately not wired in this vendored copy: run each command below from its repo checkout against the estate API. A live org is a decision a person signs.');
  process.exit(1);
}

// default: the plan
console.log(`${plan.length} organisations ready to provision (valid five-agent charter, not yet live):\n`);
for (const p of plan) console.log(`# ${p.repo} — org/${p.org} — ${p.roles} agents — tier ${p.tier}\n  ${p.command}\n`);
const notReady = (doc.orgs || []).filter((o) => !(o.charter?.present && o.charter?.valid));
if (notReady.length) console.log(`${notReady.length} repositories not yet ready (no charter or not checked out): ${notReady.map((o) => o.repo).join(', ')}`);
