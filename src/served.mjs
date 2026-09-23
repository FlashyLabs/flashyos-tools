#!/usr/bin/env node
// Where a property publishes. One definition, read from the record.
//
// **Being wrong about where a surface lives is this estate's most repeated
// mistake.** Eight instances are written down: a sibling's build read as ours,
// a charter served from `site/` while the checks read `public/`, a scanner
// that knew `.well-known/` and not `well-known/` and so read 13 properties
// where 16 serve a door. Every one of them was a tool guessing a layout.
//
// The estate already ended this and nothing noticed. `deploy/1` declares, in
// `.deploy/config.json` at each repository root, **the directory the host
// serves** — per domain, with `framework` beside it, and both *checked against
// the tree* by that package's own checker. Fifteen repositories carry one. No
// survey read it; they all hand-rolled a list of plausible directories, which
// is the guess wearing a different hat.
//
// So this module is to paths what `shippingRefName` is to refs: the single
// place that answers the question, imported rather than re-derived. A second
// layout list anywhere in this repository is the ninth instance waiting to
// happen.
//
// ## What it will not do
//
// **It does not guess.** A repository with no `.deploy/config.json` is
// returned as `null` and reported by name as unread. It is not scanned for
// likely directories, because a scan that finds `public/` in a repository that
// actually deploys `sites/botz.games` produces a confident wrong answer, and a
// confident wrong answer is worse than an absence — the estate's rule is that
// unread is not zero, and this is the shape of unread.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Both spellings of the well-known directory, and the second is not a typo.
 *
 * Vercel does not reliably serve dot-directories from a static deployment, so
 * several properties commit to `well-known/` and rewrite `/.well-known/*` onto
 * it — gold-holdings writes that decision up in its own CLAUDE.md. This is the
 * one layout variant that is genuinely a variant rather than a guess, it is
 * bounded at two, and it is declared here so no tool has to remember it.
 */
export const WELL_KNOWN = Object.freeze(['.well-known', 'well-known'])

/**
 * The static directory a target actually serves, derived from its framework.
 *
 * `root` is what the HOST serves, which is not always where the files are. A
 * `next` or `docker` target roots at the app and serves its `public/`; a
 * `static` target serves the root itself. `deploy/1` already constrains
 * `framework` to those four and verifies each against the tree, so this is a
 * reading of a checked declaration rather than an inference.
 */
export function publishedDir(root, framework) {
  const base = root === '.' || !root ? '' : root
  return framework === 'next' || framework === 'docker' ? join(base, 'public') : base
}

/**
 * Every domain this repository publishes, and the directory each serves from.
 *
 * `null` when the repository declares no deploy target — which is a finding
 * with a name, not an empty list.
 */
export function publishedDirs(repo) {
  const cfg = join(repo, '.deploy', 'config.json')
  if (!existsSync(cfg)) return null
  let doc
  try {
    doc = JSON.parse(readFileSync(cfg, 'utf8'))
  } catch {
    return null
  }
  const targets = Array.isArray(doc?.targets) ? doc.targets : []
  const out = []
  for (const t of targets) {
    if (!t?.domain) continue
    // `external` means somebody else hosts it and this repository is not the
    // authority; `none` means nothing hosts it yet. Neither publishes from
    // this tree, and treating them as though they did is how a survey reports
    // a property as serving nothing when it serves nothing *here*.
    if (t.state === 'external' || t.state === 'none') continue
    out.push({
      domain: t.domain,
      root: t.root ?? '.',
      framework: t.framework ?? null,
      dir: publishedDir(t.root ?? '.', t.framework),
      state: t.state ?? null,
    })
  }
  return out
}

/**
 * Where a repository serves a given well-known path from, if anywhere.
 *
 * Returns the first match as `{ domain, file, url }` so a caller gets the
 * property the file belongs to rather than only its path — which is the half a
 * `sites/*` scan cannot supply and gets wrong in a repository publishing four
 * domains.
 */
export function servedAt(repo, wellKnownPath) {
  const dirs = publishedDirs(repo)
  if (!dirs) return null
  const tail = wellKnownPath.replace(/^\.?well-known\//, '').replace(/^\//, '')
  for (const d of dirs) {
    for (const wk of WELL_KNOWN) {
      const rel = join(d.dir, wk, tail)
      if (existsSync(join(repo, rel)))
        return { domain: d.domain, file: rel, url: `https://${d.domain}/.well-known/${tail}` }
    }
  }
  return null
}

/** A file published at the root of a property, rather than under well-known. */
export function servedAtRoot(repo, name) {
  const dirs = publishedDirs(repo)
  if (!dirs) return null
  for (const d of dirs) {
    const rel = join(d.dir, name)
    if (existsSync(join(repo, rel))) return { domain: d.domain, file: rel, url: `https://${d.domain}/${name}` }
  }
  return null
}

const RUN = import.meta.url === `file://${process.argv[1]}`
if (RUN) {
  const { readdirSync } = await import('node:fs')
  const { dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const ESTATE = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

  let declared = 0
  const unread = []
  const rows = []
  for (const e of readdirSync(ESTATE, { withFileTypes: true })) {
    if (!e.isDirectory() || !existsSync(join(ESTATE, e.name, '.git'))) continue
    const dirs = publishedDirs(join(ESTATE, e.name))
    if (dirs === null) {
      unread.push(e.name)
      continue
    }
    declared++
    for (const d of dirs) rows.push({ repo: e.name, ...d })
  }

  if (!declared && !unread.length) {
    process.stderr.write('\n  read no repository — the estate is not beside this checkout\n\n')
    process.exit(2)
  }

  process.stdout.write(`\n  Where each property publishes, from deploy/1\n`)
  process.stdout.write(`  Declared, never guessed. A repository with no config is named, not scanned.\n\n`)
  process.stdout.write(`    repositories declaring a deploy target   ${declared}\n`)
  process.stdout.write(`    domains published from this estate       ${rows.length}\n`)
  process.stdout.write(`    unread (no .deploy/config.json)          ${unread.length}\n\n`)
  for (const r of rows)
    process.stdout.write(`    ${r.domain.padEnd(26)} ${r.repo.padEnd(18)} ${(r.dir || '.').padEnd(38)} ${r.framework ?? '—'}\n`)
  if (unread.length) {
    process.stdout.write(`\n    unread, by name:\n`)
    for (const u of unread) process.stdout.write(`      ${u}\n`)
  }
  process.stdout.write('\n')
}
