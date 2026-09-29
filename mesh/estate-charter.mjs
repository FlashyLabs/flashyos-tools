#!/usr/bin/env node
// Estate charter generator — one aao/0.1 charter with exactly five roles (five
// agents) per repository, plus its directory/1 fragment and a MESH.md note.
// Validated against the real vendored aao checker before anything is written.
//
//   node gen-charter.mjs <repo-dir> <owner/name> <kind>
//   node gen-charter.mjs --check <repo-dir>        # validate an existing charter
//
// node: builtins only. Refuses to overwrite an existing flashyos.roles.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const AAO_CHECK = new URL("vendor-aao-check.mjs", import.meta.url).pathname;
const ACCOUNTABLE = 'michael@gda.capital';

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const titleize = (name) =>
  name.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

// Five-role sets by kind. Every role: name (a standing job, 3-24 chars, <=3
// words, kebab, never a codename or a vendor), family (one of the ten), a
// purpose, a measure (a ratio someone else can check), capabilities (kebab
// verbs), and a human-approval floor. The lead role carries the mesh
// x-capability content-exchange, so the derived handshake is non-empty and
// every advertised capability is a role somebody is accountable for.
const R = (name, family, approval, purpose, measure, capabilities, lead = false) => ({
  name, family,
  purpose, measure,
  capabilities,
  humanApprovalAtOrAbove: approval,
  ...(lead ? { 'x-capability': ['content-exchange'] } : {}),
});

const ROLE_SETS = {
  spec: () => [
    R('canon', 'governance', 'HIGH', 'Publishes and maintains the normative specification — the schema, the conformance corpus and the dependency-free checker. The format refuses rather than guesses; a claim in the spec is checked, not decorative.', 'Normative sections carrying a conformance vector, as a share of the specification', ['publish-spec', 'revise-spec'], true),
    R('conformance', 'engineering', 'LOW', 'Runs the checker and the conformance vectors against every change, and reports which cases a fragment passes rather than a green tick that read nothing.', 'Conformance vectors passing, as a share of the published corpus', ['run-vectors', 'check-fragment']),
    R('release', 'operations', 'MEDIUM', 'Cuts versioned releases with a changelog entry, so a version says what the package will refuse and never moves once it ships.', 'Releases with a changelog entry, as a share of tags', ['tag-version', 'publish-package']),
    R('adoption', 'growth', 'LOW', 'Helps an independent adopter reach conformance and records real uptake, because a spec is a standard only after the first adopter and never before.', 'Independent adopters reaching level two, as a share of enquiries', ['guide-adopter', 'record-adopter']),
    R('review', 'risk', 'HIGH', 'Reviews a normative change proposal before it lands, because a change to what a valid document is breaks every adopter downstream.', 'Normative changes carrying an approving review, as a share of merges', ['review-proposal', 'approve-change']),
  ],
  platform: () => [
    R('product', 'product', 'HIGH', 'Owns what the product does and the order it is built in, and answers to the accountable human for the roadmap it commits to.', 'Roadmap items shipped, as a share of those planned', ['define-roadmap', 'prioritise-work'], true),
    R('engineering', 'engineering', 'HIGH', 'Builds and maintains the codebase, and keeps the invariants the product rests on enforced by a test rather than a guideline.', 'Changes carrying a test, as a share of merges', ['merge-changes', 'define-architecture']),
    R('operations', 'operations', 'CRITICAL', 'Runs the deploy and keeps the service up. A change to production waits for a named human at or above the critical floor — no agent ships to prod on its own say-so.', 'Deploys that stay green, as a share of deploys', ['deploy-release', 'roll-back']),
    R('review', 'governance', 'HIGH', 'Reviews and approves a change before it lands. Agents suggest; humans consent; nothing reaches the default branch without an approving review.', 'Merges carrying an approving review, as a share of merges', ['review-changes', 'approve-merge']),
    R('conformance', 'risk', 'LOW', 'Runs the tests, the lint and the mesh conformance check, and holds the default branch to what those checks require.', 'Checks passing on the default branch, as a share of runs', ['run-tests', 'run-checks']),
  ],
  site: () => [
    R('editor', 'product', 'MEDIUM', 'Decides what the site says and keeps every claim tied to a surface a stranger can reach — no unverified audience claim, no number a test cannot assert.', 'Pages with a named owner, as a share of pages', ['commission-copy', 'approve-copy'], true),
    R('author', 'support', 'MEDIUM', 'Writes and updates the content in the estate lexicon, and keeps a page current rather than letting it drift from what the product now does.', 'Pages reviewed in the last quarter, as a share of pages', ['write-content', 'update-content']),
    R('engineering', 'engineering', 'HIGH', 'Builds and maintains the site generator, and keeps the served output derived from source rather than hand-edited.', 'Builds that pass, as a share of builds', ['build-site', 'merge-changes']),
    R('release', 'operations', 'MEDIUM', 'Deploys the site and verifies the change is actually live at the domain, because committed is not served until a fetch settles it.', 'Deploys verified live, as a share of deploys', ['deploy-site', 'verify-live']),
    R('conformance', 'risk', 'LOW', 'Runs the content, link and lexicon checks, and refuses a build that links a surface which does not exist.', 'Link checks passing, as a share of runs', ['check-links', 'check-content']),
  ],
  library: () => [
    R('maintainer', 'engineering', 'HIGH', 'Owns the library’s correctness and its public API. Removing an export is a major version; the API surface is enumerated by hand, never a generated snapshot.', 'Changes carrying a test, as a share of merges', ['merge-changes', 'define-api'], true),
    R('review', 'governance', 'HIGH', 'Reviews a change before it lands, because a signature change breaks every consumer that embeds this package.', 'Merges carrying a review, as a share of merges', ['review-changes', 'approve-merge']),
    R('release', 'operations', 'MEDIUM', 'Versions and publishes to the registry, proving the package importable both ways before it ships and recording the release in the ledger.', 'Releases with a changelog entry, as a share of tags', ['tag-version', 'publish-package']),
    R('conformance', 'engineering', 'LOW', 'Runs the tests, the typecheck and the lint, and holds coverage to the threshold CI fails on.', 'Checks passing, as a share of runs', ['run-tests', 'run-lint']),
    R('adoption', 'growth', 'LOW', 'Helps a consumer integrate and records real usage, so a claim of adoption is a number somebody measured rather than assumed.', 'Consumers onboarded, as a share of enquiries', ['guide-consumer', 'record-usage']),
  ],
  tooling: () => [
    R('maintainer', 'engineering', 'HIGH', 'Owns the instrument’s correctness and the population it measures, and re-reads the source of truth rather than a copy that can go stale.', 'Runs producing a reading, as a share of runs', ['merge-changes', 'define-measure'], true),
    R('review', 'governance', 'HIGH', 'Reviews a change to what the tool measures, because a check that goes green for having looked at nothing is this estate’s recorded failure.', 'Merges carrying a review, as a share of merges', ['review-changes', 'approve-merge']),
    R('release', 'operations', 'MEDIUM', 'Versions and re-vendors the tool into the properties that copy it, keeping every copy byte-identical to canon.', 'Vendored copies current, as a share of copies', ['tag-version', 're-vendor']),
    R('conformance', 'engineering', 'LOW', 'Runs the tool’s own tests and its vacuity guard, so a traversal that resolves nothing is a red run rather than a clean estate.', 'Checks passing, as a share of runs', ['run-tests', 'guard-vacuity']),
    R('operations', 'operations', 'MEDIUM', 'Schedules the tool and reads its output, and keeps a staleness bound against the producer’s cadence rather than when a reader would call the number useless.', 'Scheduled runs producing a fresh reading, as a share of runs', ['schedule-run', 'read-output']),
  ],
  client: () => [
    R('delivery', 'operations', 'HIGH', 'Owns delivery to the client and answers to the accountable human for what was promised. Client work is never open-licensed; the grant is not ours to make.', 'Milestones delivered on date, as a share of those planned', ['plan-delivery', 'deliver-work'], true),
    R('engineering', 'engineering', 'MEDIUM', 'Builds the client work to the agreed specification and keeps it tested.', 'Changes carrying a test, as a share of merges', ['merge-changes', 'build-feature']),
    R('review', 'governance', 'HIGH', 'Reviews a change before it is delivered, because a defect delivered to a client is dearer than one caught in review.', 'Deliveries carrying a review, as a share of deliveries', ['review-changes', 'approve-merge']),
    R('release', 'operations', 'CRITICAL', 'Ships to the client environment. A production change waits for a named human at the critical floor.', 'Deploys verified in the client environment, as a share of deploys', ['deploy-release', 'verify-delivery']),
    R('account', 'support', 'LOW', 'The client’s point of contact — briefs the work and reports status on the agreed cadence.', 'Status reports sent on cadence, as a share of those due', ['brief-client', 'report-status']),
  ],
  vault: () => [
    R('steward', 'governance', 'HIGH', 'Accountable for the repository’s standing, its licence and its mesh presence, and keeps the served surfaces matching what the charter declares.', 'Declared mesh surfaces actually served, as a share of those declared', ['maintain-charter', 'govern-standing'], true),
    R('archivist', 'data', 'LOW', 'Keeps the content in order — every item in a place, stale material pruned or archived under a prefix the survey understands.', 'Items with a settled place, as a share of items', ['organise-content', 'prune-stale']),
    R('engineering', 'engineering', 'MEDIUM', 'Maintains any tooling the repository carries and keeps its build green.', 'Builds passing, as a share of builds', ['merge-changes', 'run-build']),
    R('review', 'governance', 'MEDIUM', 'Reviews a change before it lands.', 'Merges carrying a review, as a share of merges', ['review-changes', 'approve-merge']),
    R('release', 'operations', 'LOW', 'Publishes an update and verifies the output.', 'Updates verified, as a share of updates', ['publish-update', 'verify-output']),
  ],
};

const HOLDS = {
  spec: ['spec', 'schema', 'checker', 'conformance-corpus'],
  platform: ['product', 'service', 'deploy'],
  site: ['content', 'site'],
  library: ['library', 'api'],
  tooling: ['tooling', 'measure'],
  client: ['client-work'],
  vault: ['content', 'archive'],
};

const KIND_DESC = {
  spec: 'a specification on the FlashyOS mesh — a wire format published with a dependency-free checker, its conformance corpus and its versioned releases',
  platform: 'a product on the FlashyOS mesh — a running service with a roadmap, a deploy and the invariants it rests on enforced by tests',
  site: 'a site on the FlashyOS mesh — a generated property whose every claim is tied to a surface a stranger can reach',
  library: 'a library on the FlashyOS mesh — an installable package with a hand-enumerated API and a release ledger',
  tooling: 'an instrument on the FlashyOS mesh — a tool that measures the estate and re-reads its source of truth rather than a copy',
  client: 'client work carried on the FlashyOS mesh — delivered to a specification, reviewed before delivery, and never open-licensed',
  vault: 'a repository on the FlashyOS mesh — its standing, licence and mesh presence kept by a steward',
};

function charterFor(owner, name, kind) {
  const roles = (ROLE_SETS[kind] || ROLE_SETS.vault)();
  const repoName = name;
  for (const role of roles) role.worksIn = [repoName];
  return {
    'x-generated': `estate-charter/1; ${new Date().toISOString().slice(0, 10)}; every role is one standing job, and five roles are five agents`,
    aao: '0.1',
    name: titleize(name),
    slug: slugify(name),
    description: `${titleize(name)} — ${KIND_DESC[kind] || KIND_DESC.vault}. AAO expands to Agentic Autonomous Organization.`,
    accountableTo: ACCOUNTABLE,
    escalation: roles[0].name,
    repositories: [
      { name: repoName, url: `github.com/${owner}/${name}`, default: true, holds: HOLDS[kind] || HOLDS.vault },
    ],
    roles,
  };
}

function handshakeFor(charter) {
  const caps = [...new Set(charter.roles.flatMap((r) => r['x-capability'] || []))].sort();
  return {
    mesh: 'flashyos/1',
    org: { slug: charter.slug, name: charter.name, profile: `https://app.flashyos.com/org/${charter.slug}` },
    capabilities: caps,
    wants: 'https://api.flashyos.com/api/v1/network/roadmap',
    api: 'https://api.flashyos.com',
    join: 'https://flashyos.com/join',
  };
}

function fragmentFor(charter) {
  const org = `org/${charter.slug}`;
  const nodes = [
    { id: org, kind: 'org', name: charter.name },
    { id: 'person/michael', kind: 'person', name: 'Michael Gord' },
    ...charter.roles.map((r) => ({ id: `agent/${charter.slug}-${r.name}`, kind: 'agent', name: r.name, for: org })),
  ];
  const edges = charter.roles.map((r) => ({
    from: org, rel: 'staffs', to: `agent/${charter.slug}-${r.name}`, by: 'person/michael',
  }));
  return {
    contract: 'directory/1',
    generated: new Date().toISOString().slice(0, 10),
    org,
    nodes,
    edges,
    'x-note': 'Five agents, one per charter role. Generated from flashyos.roles.json; a live org is provisioned from the charter with provision-org-from-charter.',
  };
}

function meshNote(charter, owner, name) {
  const rows = charter.roles.map((r) => `| \`${r.name}\` | ${r.family} | ${r.humanApprovalAtOrAbove} | ${r.purpose.split('.')[0]}. |`).join('\n');
  return `# On the FlashyOS mesh

${charter.name} is ${KIND_DESC[Object.keys(KIND_DESC).find((k) => charter.description.includes(KIND_DESC[k])) || 'vault']}.

Its AAO charter is [\`flashyos.roles.json\`](flashyos.roles.json) — the single source the mesh
handshake and the directory fragment derive from, so two hand-written files can
never disagree. It declares **five roles**, and five roles are five agents:

| Role | Family | Human approval at/above | What it is accountable for |
|---|---|---|---|
${rows}

The charter validates against the estate's dependency-free AAO checker:

\`\`\`bash
node vendor-aao-check.mjs validate flashyos.roles.json   # 0 issues
\`\`\`

**Becoming a live organisation.** The charter is what a live org is provisioned
from. From a machine that holds \`DATABASE_URL\`:

\`\`\`bash
npx tsx packages/api/scripts/provision-org-from-charter.ts \\
  --charter flashyos.roles.json --tier FREE
\`\`\`

The FREE tier allows five agents, which is exactly this charter's five roles.
Provisioning is a database write a person runs; committing the charter is the
half a repository can hold. The authoritative conformance check runs against the
live domain after deploy: \`npx @flashyos/conformance <domain> --level 2\`.

\`directory.fragment.json\` is this org's \`directory/1\` node: the org, one agent
per role, and the accountable person.
`;
}

function validate(charterPath) {
  try {
    execFileSync('node', [AAO_CHECK, 'validate', charterPath], { stdio: 'pipe' });
    return { ok: true };
  } catch (e) {
    return { ok: false, out: (e.stdout || '').toString() + (e.stderr || '').toString() };
  }
}

// ─── main ───
const [a, b, c] = process.argv.slice(2);
if (a === '--check') {
  const p = join(b, 'flashyos.roles.json');
  if (!existsSync(p)) { console.log(`${b}: NO CHARTER`); process.exit(1); }
  const r = validate(p);
  console.log(`${b}: ${r.ok ? 'valid' : 'INVALID\n' + r.out}`);
  process.exit(r.ok ? 0 : 1);
}
const dir = a, full = b, kind = c;
if (!dir || !full || !kind) { console.error('usage: gen-charter.mjs <dir> <owner/name> <kind>'); process.exit(2); }
const [owner, name] = full.split('/');
const charterPath = join(dir, 'flashyos.roles.json');
if (existsSync(charterPath)) { console.log(`${full}: SKIP (charter exists)`); process.exit(3); }

const charter = charterFor(owner, name, kind);
writeFileSync(charterPath, JSON.stringify(charter, null, 2) + '\n');
const v = validate(charterPath);
if (!v.ok) { console.error(`${full}: GENERATED CHARTER INVALID\n${v.out}`); process.exit(4); }

// handshake + fragment + note, only where absent
const wkDir = join(dir, 'public', '.well-known');
const fragPath = join(dir, 'directory.fragment.json');
if (!existsSync(fragPath)) writeFileSync(fragPath, JSON.stringify(fragmentFor(charter), null, 2) + '\n');
writeFileSync(join(dir, 'MESH.md'), meshNote(charter, owner, name));
// handshake: only if a public/.well-known already exists (a served-file repo);
// otherwise leave it to the repo's own generator so we don't fight a route.
let hs = 'no-handshake (no public/.well-known; charter is the source)';
if (existsSync(wkDir)) {
  const hp = join(wkDir, 'flashyos.json');
  if (!existsSync(hp)) { writeFileSync(hp, JSON.stringify(handshakeFor(charter), null, 2) + '\n'); hs = 'handshake written'; }
  else hs = 'handshake exists (skipped)';
}
console.log(`${full}: charter(${charter.roles.length} roles) valid; ${existsSync(fragPath) ? 'fragment' : 'no-frag'}; ${hs}`);
