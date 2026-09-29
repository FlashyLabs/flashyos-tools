#!/usr/bin/env node
// The static half of @flashyos/aao, with nothing to install.
//
//   node vendor-aao-check.mjs conform  <charter.json>   the seven questions
//   node vendor-aao-check.mjs validate <charter.json>   the document alone
//   node vendor-aao-check.mjs <charter.json>            same as conform
//   add --json for a machine-readable report
//
// Exit 0 when every static check passes, 1 on any failure, 2 when the file
// cannot be read or the arguments make no sense.
//
// Why this file exists beside src/: the promise that a stranger can verify a
// manifest offline is part of the spec, not an implementation detail (see
// AGENTS.md, "Static means static"). A check that needs `npm install` and a
// build is a check that quietly does not run, and the estate has ten
// byte-identical mirrors of these rules in `scripts/check-charter.mjs` files
// that agreed with each other for weeks while disagreeing with the spec in
// four places. So this is a port of `src/manifest.ts`, `src/nomenclature.ts`,
// `src/charter.ts` and `src/conformance.ts` — same paths, same messages — and
// `src/parity.test.ts` runs both over every vector in `vectors/` and fails on
// the first disagreement. A mirror that nothing compares is a guess.
//
// Three of the seven questions are runtime facts. They are reported as
// `deferred`, never as passed: an org that merely claims its agents are
// revocable has said nothing, and a report that dropped the three hardest
// questions would be exactly the green tick this package argues against.
//
// Imports `node:` builtins only. Add nothing.
import { readFileSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

export const AAO_VERSION = '0.1'
export const IMPACT_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
export const FAMILIES = [
  'growth', 'revenue', 'product', 'engineering', 'operations',
  'data', 'finance', 'risk', 'governance', 'support',
]
export const CHARTER_TOP_KEYS = ['repositories', 'escalation']
export const CHARTER_ROLE_KEYS = ['family', 'measure', 'worksIn', 'renamedFrom']

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const AGENT_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const EMAIL_RE = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/
const REPO_NAME_RE = /^[a-zA-Z0-9._-]+$/

// ─── manifest.ts ───────────────────────────────────────────────────────────

const UNKNOWN_KEY = `Not part of aao ${AAO_VERSION} — nothing enforces it. Prefix "x-" to carry it as an explicit extension`

/** Every problem with a 0.1 manifest, not just the first. Mirrors validateManifest. */
export function validateManifest(input, opts = {}) {
  const issues = []
  const fail = (path, message) => issues.push({ path, message })

  if (typeof input !== 'object' || input === null) {
    return [{ path: '', message: 'Manifest must be an object' }]
  }
  const m = input

  const KNOWN_TOP = new Set([
    'aao', 'name', 'slug', 'description', 'accountableTo', 'roles', 'network',
    ...(opts.knownExtraTop ?? []),
  ])
  for (const key of Object.keys(m)) {
    if (!KNOWN_TOP.has(key) && !key.startsWith('x-')) fail(key, UNKNOWN_KEY)
  }

  if (m.aao !== AAO_VERSION) {
    fail('aao', `Must be "${AAO_VERSION}" (got ${JSON.stringify(m.aao)})`)
  }
  if (!str(m.name)) fail('name', 'Required — the product name a human reads')
  if (!str(m.description)) fail('description', 'Required — one line on what this org is for')

  if (!str(m.slug)) {
    fail('slug', 'Required — the org slug on the network')
  } else if (!SLUG_RE.test(m.slug)) {
    fail('slug', 'Lowercase letters, numbers and single hyphens only')
  }

  if (!str(m.accountableTo)) {
    fail('accountableTo', 'Required — name the human accountable for this org, question five of seven')
  } else if (!EMAIL_RE.test(m.accountableTo)) {
    fail('accountableTo', 'Must be an email address, so the accountable human is reachable')
  }

  if (!Array.isArray(m.roles) || m.roles.length === 0) {
    fail('roles', 'Required — an org with no roles is not an organization')
    return issues
  }

  const seen = new Set()
  m.roles.forEach((role, i) => {
    const at = `roles[${i}]`

    if (!str(role?.name)) {
      fail(`${at}.name`, 'Required — becomes the agent name on the network')
    } else if (!AGENT_NAME_RE.test(role.name)) {
      fail(`${at}.name`, 'Lowercase letters, numbers and single hyphens only')
    } else if (seen.has(role.name)) {
      fail(`${at}.name`, `Duplicate role name "${role.name}" — agent names are unique within an org`)
    } else {
      seen.add(role.name)
    }

    if (!str(role?.purpose)) {
      fail(`${at}.purpose`, 'Required — one line a human can read')
    }
    if (!Array.isArray(role?.capabilities) || role.capabilities.length === 0) {
      fail(`${at}.capabilities`, 'Required — declare what this role may do, even if it is one thing')
    } else if (role.capabilities.some((c) => typeof c !== 'string' || !c.trim())) {
      fail(`${at}.capabilities`, 'Capabilities must be non-empty strings')
    }

    if (role?.humanApprovalAtOrAbove !== undefined && !IMPACT_ORDER.includes(role.humanApprovalAtOrAbove)) {
      fail(`${at}.humanApprovalAtOrAbove`, `Must be one of ${IMPACT_ORDER.join(', ')}`)
    }

    if (role && typeof role === 'object') {
      const KNOWN_ROLE = new Set([
        'name', 'purpose', 'capabilities', 'humanApprovalAtOrAbove',
        ...(opts.knownExtraRole ?? []),
      ])
      for (const key of Object.keys(role)) {
        if (!KNOWN_ROLE.has(key) && !key.startsWith('x-')) fail(`${at}.${key}`, UNKNOWN_KEY)
      }
    }
  })

  return issues
}

function str(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export function declaredCapabilities(manifest) {
  return [...new Set(manifest.roles.flatMap((r) => r.capabilities))].sort()
}

// ─── nomenclature.ts ───────────────────────────────────────────────────────

const ROLE_NAME_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/
export const ROLE_NAME_MIN = 3
export const ROLE_NAME_MAX = 24
export const ROLE_NAME_MAX_WORDS = 3

const VENDOR_WORDS = ['claude', 'anthropic', 'gpt', 'chatgpt', 'openai', 'copilot', 'codex', 'gemini', 'llama', 'mistral', 'cursor', 'devin']
const GIT_WORDS = ['main', 'master', 'trunk', 'head', 'develop', 'dev', 'release-branch']
const SCRATCH_WORDS = ['test', 'tmp', 'temp', 'foo', 'bar', 'dummy', 'sample', 'example']
const GENERIC_WORDS = ['agent', 'bot', 'ai', 'assistant', 'worker', 'service', 'handler', 'manager', 'default', 'new', 'misc', 'other', 'general', 'thing', 'stuff']
// A heuristic, documented as one: no validator can tell `atlas` from `audit`.
const KNOWN_CODENAMES = ['nova', 'hermes', 'aura', 'sage', 'atlas', 'forge', 'nexus', 'kira', 'apex', 'apollo', 'minerva', 'athena', 'zeus', 'odin', 'thor', 'orion', 'titan', 'phoenix']
const RANDOM_SUFFIX_RE = /-(?=[a-z0-9]*[0-9])(?=[a-z0-9]*[a-z])[a-z0-9]{6,}$/

/** Every reason a role name is invalid. Mirrors validateRoleName. */
export function validateRoleName(name) {
  const issues = []
  if (typeof name !== 'string' || !name.trim()) {
    return [{ rule: 'empty', message: 'A role needs a name — the function it is accountable for.', example: 'retention' }]
  }
  const value = name.trim()

  if (!ROLE_NAME_RE.test(value)) {
    return [{
      rule: 'charset',
      message: 'Lowercase letters and digits, separated by single hyphens, starting with a letter. No capitals, spaces, underscores or slashes.',
      example: 'network-effects',
    }]
  }

  if (value.length < ROLE_NAME_MIN || value.length > ROLE_NAME_MAX) {
    issues.push({ rule: 'length', message: `Between ${ROLE_NAME_MIN} and ${ROLE_NAME_MAX} characters (got ${value.length}).`, example: 'conversion' })
  }

  const parts = value.split('-')

  if (parts.length > ROLE_NAME_MAX_WORDS) {
    issues.push({
      rule: 'words',
      message: `At most ${ROLE_NAME_MAX_WORDS} words (got ${parts.length}). A longer name is describing a task, not a standing responsibility.`,
      example: 'product-research',
    })
  }

  if (RANDOM_SUFFIX_RE.test(value)) {
    issues.push({
      rule: 'random-suffix',
      message: 'Ends in a machine identifier. Those belong in the id, never in the name — a name with a random suffix cannot be a standing role.',
      example: 'intelligence',
    })
  }

  const vendor = parts.find((w) => VENDOR_WORDS.includes(w))
  if (vendor) {
    issues.push({
      rule: 'vendor',
      message: `"${vendor}" names a model vendor. The model behind a role is an implementation detail that will change; name the job instead.`,
      example: 'release',
    })
  }

  const git = parts.find((w) => GIT_WORDS.includes(w))
  if (git) {
    issues.push({ rule: 'git', message: `"${git}" is a branch, not a role. A branch is an assignment; a role outlives it.`, example: 'infrastructure' })
  }

  const scratch = parts.find((w) => SCRATCH_WORDS.includes(w))
  if (scratch) {
    issues.push({ rule: 'placeholder', message: `"${scratch}" marks scratch work. A role is a standing responsibility, not an experiment.`, example: 'compliance' })
  } else if (parts.every((w) => GENERIC_WORDS.includes(w))) {
    issues.push({ rule: 'placeholder', message: `"${value}" names nothing. Say what this role is accountable for.`, example: 'compliance' })
  }

  if (parts.length === 1 && KNOWN_CODENAMES.includes(value)) {
    issues.push({
      rule: 'codename',
      message: `"${value}" is a codename — it needs a glossary a stranger reading the directory does not have. Name the function it performs.`,
      example: 'retention',
    })
  }

  return issues
}

// ─── charter.ts ────────────────────────────────────────────────────────────

/** The 0.1 manifest underneath plus the charter's own fields. Mirrors validateCharterDocument. */
export function validateCharterDocument(input) {
  return [
    ...validateManifest(input, { knownExtraTop: CHARTER_TOP_KEYS, knownExtraRole: CHARTER_ROLE_KEYS }),
    ...validateCharter(input),
  ]
}

/** The charter fields only. Mirrors validateCharter. */
export function validateCharter(input) {
  const issues = []
  const fail = (path, message) => issues.push({ path, message })

  if (typeof input !== 'object' || input === null) {
    return [{ path: '', message: 'Charter must be an object' }]
  }
  const c = input

  const repoNames = new Set()
  if (c.repositories !== undefined) {
    if (!Array.isArray(c.repositories)) {
      fail('repositories', 'Must be an array')
    } else {
      let defaults = 0
      c.repositories.forEach((repo, i) => {
        const at = `repositories[${i}]`
        if (!str(repo?.name)) {
          fail(`${at}.name`, 'Required — the short name roles[].worksIn refers to')
        } else if (!REPO_NAME_RE.test(repo.name)) {
          fail(`${at}.name`, 'Letters, digits, dots, hyphens and underscores only')
        } else if (repoNames.has(repo.name)) {
          fail(`${at}.name`, `Duplicate repository "${repo.name}"`)
        } else {
          repoNames.add(repo.name)
        }
        if (!str(repo?.url)) fail(`${at}.url`, 'Required — where this repository lives')
        if (!Array.isArray(repo?.holds) || repo.holds.length === 0) {
          fail(`${at}.holds`, 'Required — name the subject areas this repository holds, so work can be routed to it')
        }
        if (repo?.default) defaults++
      })
      if (defaults > 1) fail('repositories', 'At most one repository may be the default')
    }
  }

  const roleNames = new Set()
  if (Array.isArray(c.roles)) {
    c.roles.forEach((role, i) => {
      const at = `roles[${i}]`
      if (typeof role?.name === 'string') roleNames.add(role.name)

      for (const issue of validateRoleName(role?.name)) {
        fail(`${at}.name`, `${issue.message} Example: ${issue.example}`)
      }

      if (role?.family !== undefined && !FAMILIES.includes(role.family)) {
        fail(`${at}.family`, 'Must be one of the ten declared families')
      }

      if (role?.worksIn !== undefined) {
        if (!Array.isArray(role.worksIn) || role.worksIn.length === 0) {
          fail(`${at}.worksIn`, 'Must be a non-empty array of repository names')
        } else {
          for (const repo of role.worksIn) {
            if (repoNames.size && !repoNames.has(repo)) {
              fail(`${at}.worksIn`, `"${repo}" is not a repository in this charter`)
            }
          }
        }
      }

      if (role?.renamedFrom !== undefined) {
        if (!Array.isArray(role.renamedFrom)) {
          fail(`${at}.renamedFrom`, 'Must be an array of prior names, newest first')
        } else if (role.renamedFrom.includes(role.name)) {
          fail(`${at}.renamedFrom`, 'A role cannot be renamed from itself')
        }
      }
    })
  }

  if (c.escalation !== undefined && !roleNames.has(c.escalation)) {
    fail('escalation', `"${c.escalation}" is not a role in this charter. Escalation must name a role that exists.`)
  }

  if (repoNames.size && Array.isArray(c.roles)) {
    const covered = new Set(c.roles.flatMap((r) => r.worksIn ?? []))
    for (const repo of repoNames) {
      if (!covered.has(repo)) {
        fail('repositories', `No role works in "${repo}". Every repository needs an owning role, or nobody is accountable for it.`)
      }
    }
  }

  return issues
}

// ─── conformance.ts ────────────────────────────────────────────────────────

function validateForConformance(manifest) {
  return validateManifest(manifest, { knownExtraTop: CHARTER_TOP_KEYS, knownExtraRole: CHARTER_ROLE_KEYS })
}

export const CONFORMANCE_CHECKS = [
  {
    id: 'manifest-valid',
    question: 'Is this a well-formed AAO at all?',
    kind: 'static',
    check: (m) => {
      const issues = validateForConformance(m)
      return issues.length === 0 ? null : issues.map((i) => `${i.path}: ${i.message}`).join('; ')
    },
  },
  {
    id: 'agents-identified',
    question: 'Who is this agent?',
    kind: 'static',
    check: (m) => (m.roles.every((r) => r.name.trim().length > 0)
      ? null
      : 'Every role must have a stable name — it becomes the agent identity on the network'),
  },
  {
    id: 'capabilities-declared',
    question: 'What can it do?',
    kind: 'static',
    check: (m) => {
      const vague = m.roles.filter((r) => r.capabilities.some((c) => c.split('-').length === 1 && c.length > 12))
      if (vague.length > 0) {
        return `Capabilities should name actions, not departments — ${vague.map((r) => r.name).join(', ')} declare capabilities that read like org units`
      }
      return declaredCapabilities(m).length > 0 ? null : 'No capabilities declared anywhere in the manifest'
    },
  },
  {
    id: 'human-accountable',
    question: 'Which human is responsible?',
    kind: 'static',
    check: (m) => (m.accountableTo && m.accountableTo !== 'you@example.com'
      ? null
      : 'accountableTo is still the template placeholder — name the real human accountable for this org'),
  },
  {
    id: 'approval-thresholds-considered',
    question: 'What happens before an agent does something consequential?',
    kind: 'static',
    check: (m) => (m.roles.some((r) => r.humanApprovalAtOrAbove)
      ? null
      : 'No role requires human approval at any impact level — an org where nothing needs a human is automated, not governed'),
  },
  {
    id: 'authorization-recorded',
    question: 'Who authorized this agent?',
    kind: 'live',
    requires: 'Every agent token in the org records the human who minted it, or is a documented CI token. Checked against GET /orgs/:id/agents.',
  },
  {
    id: 'revocable',
    question: 'Can I revoke it?',
    kind: 'live',
    requires: 'Revoking an agent stops it on its next request. Checked by revoking a scratch agent and confirming its next call is rejected.',
  },
  {
    id: 'auditable',
    question: 'What did it do?',
    kind: 'live',
    requires: 'The org produces decision records for consequential actions, and agent events for the rest. Checked against the org public record.',
  },
]

/** Every static check; live checks come back `deferred`. Mirrors runStaticConformance. */
export function runStaticConformance(manifest) {
  return CONFORMANCE_CHECKS.map((c) => {
    if (c.kind === 'live') {
      return { id: c.id, question: c.question, kind: c.kind, status: 'deferred', detail: c.requires }
    }
    const issues = validateForConformance(manifest)
    if (issues.length > 0 && c.id !== 'manifest-valid') {
      return { id: c.id, question: c.question, kind: c.kind, status: 'fail', detail: 'Not evaluated — the manifest itself is invalid' }
    }
    const failure = c.check(manifest)
    return failure === null
      ? { id: c.id, question: c.question, kind: c.kind, status: 'pass' }
      : { id: c.id, question: c.question, kind: c.kind, status: 'fail', detail: failure }
  })
}

/** Asked only of a manifest that answered the first seven. Mirrors eighthQuestion. */
export function eighthQuestion(results) {
  const statics = results.filter((r) => r.kind === 'static')
  if (statics.length === 0 || statics.some((r) => r.status !== 'pass')) return null
  return '⚡ Q8 · Who verifies the verifier? — You, just now. Welcome to the network.'
}

// ─── the command ───────────────────────────────────────────────────────────

const USAGE = `usage: aao conform  <charter.json> [--json]
       aao validate <charter.json> [--json]
Exit 0 when every static check passes, 1 on a failure, 2 on a bad call.`

/**
 * A full conformance report for one document: the charter document's own
 * issues (the naming standard lives there, and the seven questions alone do
 * not ask it), the static verdicts, and the live ones deferred. `ok` needs
 * both halves clean — `conform` is never weaker than `validate`.
 */
export function conform(doc) {
  const issues = validateCharterDocument(doc)
  const results = runStaticConformance(doc)
  const failed = results.filter((r) => r.status === 'fail').length
  return { issues, results, failed, ok: issues.length === 0 && failed === 0, eighth: eighthQuestion(results) }
}

/** The human-readable report. Shared shape with dist/cli.js, pinned by the vectors suite. */
export function renderConform(source, doc, { issues, results, failed, eighth }) {
  const lines = []
  const name = typeof doc?.name === 'string' ? doc.name : source
  const roles = Array.isArray(doc?.roles) ? doc.roles.length : 0
  lines.push(`aao conform ${source} — ${name} · ${roles} role(s)`, '')
  if (issues.length) {
    lines.push(`  document — ${issues.length} issue(s)`)
    for (const i of issues) lines.push(`    ${i.path || '(document)'}: ${i.message}`)
    lines.push('')
  }
  for (const r of results) {
    const tag = r.status === 'pass' ? 'pass    ' : r.status === 'fail' ? 'FAIL    ' : 'deferred'
    lines.push(`  ${tag}  ${r.id.padEnd(32)} ${r.question}`)
    if (r.status !== 'pass' && r.detail) lines.push(`            ${r.detail}`)
  }
  const passed = results.filter((r) => r.status === 'pass').length
  const deferred = results.filter((r) => r.status === 'deferred').length
  lines.push('', `  ${passed} pass · ${failed} fail · ${deferred} deferred (live — verified against a running org, never from a file)`)
  if (eighth && issues.length === 0) lines.push('', `  ${eighth}`)
  return lines.join('\n')
}

export function renderValidate(source, doc, issues) {
  const name = typeof doc?.name === 'string' ? doc.name : source
  const lines = [`aao validate ${source} — ${name}`, '']
  for (const i of issues) lines.push(`  ${i.path || '(document)'}: ${i.message}`)
  lines.push(issues.length === 0 ? '  valid — 0 issues' : '', `  ${issues.length} issue(s)`)
  return lines.filter((l, n, all) => !(l === '' && all[n - 1] === '')).join('\n')
}

function readDoc(path) {
  let text
  try {
    text = readFileSync(path, 'utf8')
  } catch (e) {
    throw new Error(`cannot read ${path}: ${e.code ?? e.message}`)
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new Error(`${path} is not JSON: ${e.message}`)
  }
}

/** Runs the command. Returns the exit code; writes through `out`/`err` so tests can capture. */
export function main(argv, out = (s) => process.stdout.write(`${s}\n`), err = (s) => process.stderr.write(`${s}\n`)) {
  const args = argv.filter((a) => a !== '--json')
  const json = args.length !== argv.length
  let [command, path] = args
  if (command && !['conform', 'validate'].includes(command)) {
    if (path === undefined) { path = command; command = 'conform' } else { err(USAGE); return 2 }
  }
  if (!command || !path) { err(USAGE); return 2 }

  let doc
  try {
    doc = readDoc(path)
  } catch (e) {
    err(e.message)
    return 2
  }

  if (command === 'validate') {
    const issues = validateCharterDocument(doc)
    out(json ? JSON.stringify({ command, source: path, valid: issues.length === 0, issues }, null, 2) : renderValidate(path, doc, issues))
    return issues.length === 0 ? 0 : 1
  }

  const report = conform(doc)
  out(json
    ? JSON.stringify({ command, source: path, ok: report.ok, issues: report.issues, results: report.results, eighth: report.ok ? report.eighth : null }, null, 2)
    : renderConform(path, doc, report))
  return report.ok ? 0 : 1
}

function invokedDirectly() {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}

if (invokedDirectly()) {
  process.exit(main(process.argv.slice(2)))
}
