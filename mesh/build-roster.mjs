#!/usr/bin/env node
// Build estate/orgs.json (mesh-roster/1) by MEASURING each repo's charter in a
// sibling checkout under a root, from the population list repos.tsv. A repo not
// checked out is reported present:false, roles:null, valid:null — unread, never
// counted as zero.
//
//   node build-roster.mjs <repos.tsv> <checkout-root> <aao-check.mjs> > orgs.json
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const [tsvPath, root, aaoCheck] = process.argv.slice(2);
const rows = readFileSync(tsvPath, 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const PRIVATE_KINDS = new Set(['client']);
const PRIVATE_REPOS = new Set(['second-brain', 'ritualos', 'FlashyMobileLegacy', 'FlashyGold', 'michaelgord', 'sarahgord', 'multibank-litigation', 'mystandard-website']);
const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const orgs = rows.map(([full, kind, dir]) => {
  const [, name] = full.split('/');
  const d = join(root, dir === 'dot-github' ? '.github' : dir);
  const cp = join(d, 'flashyos.roles.json');
  let present = false, roles = null, valid = null;
  if (existsSync(cp)) {
    present = true;
    try {
      const c = JSON.parse(readFileSync(cp, 'utf8'));
      roles = Array.isArray(c.roles) ? c.roles.length : 0;
    } catch { roles = 0; }
    try { execFileSync('node', [aaoCheck, 'validate', cp], { stdio: 'pipe' }); valid = true; }
    catch { valid = false; }
  }
  const listing = (PRIVATE_KINDS.has(kind) || PRIVATE_REPOS.has(name)) ? 'private' : 'public';
  return {
    repo: full,
    org: slug(name),
    kind,
    charter: { present, roles, valid },
    listing,
    served: { domain: null, handshake: null },
    provision: 'pending',
  };
});

const doc = {
  $schema: './mesh-roster-1.schema.json',
  contract: 'mesh-roster/1',
  generated: new Date().toISOString().slice(0, 10),
  'x-note': 'Charter present/roles/valid are MEASURED from a sibling checkout when present, null when the repo is not checked out (unread, never zero). served.handshake is null everywhere: proving a domain serves the handshake needs a live fetch this survey does not make. provision is pending for all until a person runs provision-org-from-charter with DATABASE_URL.',
  orgs,
};
process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
