#!/usr/bin/env node
// vendor-mesh-roster.mjs — the dependency-free checker for mesh-roster/1.
//
//   node vendor-mesh-roster.mjs check <roster.json>   validate; exit 1 on any finding
//   node vendor-mesh-roster.mjs list  <roster.json>   repo -> org -> kind -> charter
//
// node: builtins only. The roster is the population the estate's claim
// "every repository is a five-agent mesh organisation" is measured against;
// a checker that needs an install is a check that can quietly not run.
import { readFileSync } from 'node:fs';
import process from 'node:process';

export const CONTRACT = 'mesh-roster/1';
export const KINDS = ['platform', 'spec', 'site', 'library', 'tooling', 'client', 'vault'];
export const PROVISION = ['pending', 'planned', 'committed'];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REPO = /^[^/]+\/[^/]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every problem with a roster, not just the first. */
export function validateRoster(doc) {
  const issues = [];
  const fail = (path, msg) => issues.push({ path, message: msg });
  if (!doc || typeof doc !== 'object') return [{ path: '', message: 'roster must be an object' }];
  if (doc.contract !== CONTRACT) fail('contract', `must be "${CONTRACT}"`);
  if (!DATE.test(doc.generated || '')) fail('generated', 'must be a YYYY-MM-DD date');
  if (!Array.isArray(doc.orgs) || doc.orgs.length === 0) { fail('orgs', 'must be a non-empty array'); return issues; }

  const repos = new Set(), orgs = new Set();
  doc.orgs.forEach((o, i) => {
    const at = `orgs[${i}]`;
    if (!REPO.test(o?.repo || '')) fail(`${at}.repo`, 'must be owner/name');
    else if (repos.has(o.repo)) fail(`${at}.repo`, `duplicate repo "${o.repo}"`);
    else repos.add(o.repo);
    if (!SLUG.test(o?.org || '')) fail(`${at}.org`, 'must be a kebab org slug');
    else if (orgs.has(o.org)) fail(`${at}.org`, `duplicate org slug "${o.org}"`);
    else orgs.add(o.org);
    if (!KINDS.includes(o?.kind)) fail(`${at}.kind`, `must be one of ${KINDS.join(', ')}`);
    if (!o?.charter || typeof o.charter !== 'object') fail(`${at}.charter`, 'required');
    else {
      if (typeof o.charter.present !== 'boolean') fail(`${at}.charter.present`, 'must be a boolean');
      // A present charter must declare a role count; five is the target.
      if (o.charter.present && !(Number.isInteger(o.charter.roles) && o.charter.roles > 0))
        fail(`${at}.charter.roles`, 'a present charter names a role count');
    }
    if (!PROVISION.includes(o?.provision)) fail(`${at}.provision`, `must be one of ${PROVISION.join(', ')}`);
  });
  return issues;
}

/** Summary counts a survey reads without parsing every row. */
export function summarise(doc) {
  const orgs = doc.orgs || [];
  const withCharter = orgs.filter((o) => o.charter?.present);
  const fiveAgents = withCharter.filter((o) => o.charter.roles === 5);
  const valid = withCharter.filter((o) => o.charter.valid === true);
  return {
    repos: orgs.length,
    charter: withCharter.length,
    fiveAgents: fiveAgents.length,
    valid: valid.length,
    provisioned: orgs.filter((o) => o.provision === 'committed').length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, path] = process.argv.slice(2);
  if (!path) { console.error('usage: vendor-mesh-roster.mjs check|list <roster.json>'); process.exit(2); }
  let doc;
  try { doc = JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { console.error(`cannot read ${path}: ${e.message}`); process.exit(2); }
  if (cmd === 'list') {
    for (const o of doc.orgs || [])
      console.log(`${o.repo.padEnd(38)} ${o.org.padEnd(24)} ${o.kind.padEnd(9)} ${o.charter?.present ? o.charter.roles + ' roles' + (o.charter.valid ? ' valid' : '') : 'no charter'}`);
    const s = summarise(doc);
    console.log(`\n${s.repos} repos; ${s.charter} carry a charter; ${s.fiveAgents} have exactly five agents; ${s.valid} validate; ${s.provisioned} provisioned.`);
    process.exit(0);
  }
  const issues = validateRoster(doc);
  if (issues.length) { for (const i of issues) console.error(`${i.path}: ${i.message}`); process.exit(1); }
  const s = summarise(doc);
  console.log(`ok: ${CONTRACT}, ${s.repos} repos, ${s.charter} chartered, ${s.fiveAgents} at five agents, ${s.valid} valid.`);
  process.exit(0);
}
