/**
 * One definition of where a property publishes.
 *
 * Eight recorded instances of this estate being wrong about where a surface
 * lives, and every one was a tool guessing. The ninth was prevented by noticing
 * that `deploy/1` has declared it all along — per domain, with the framework
 * beside it, checked against the tree by that package's own checker.
 *
 * These tests exist to keep two properties true:
 *
 *   1. the derivation from `root` + `framework` is correct for every shape
 *      `deploy/1` permits, because that is the step a reader has to trust;
 *   2. **it refuses to guess.** A repository that declares nothing comes back
 *      `null`, never a plausible directory. The guessing version of the survey
 *      that consumes this read 13 properties where 16 serve a door, and scored
 *      repositories whose layout it had invented — reporting more while
 *      knowing less, which is the failure mode worth a test of its own.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WELL_KNOWN, publishedDir, publishedDirs, servedAt, servedAtRoot } from './served.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const ESTATE_BESIDE = existsSync(join(dirname(ROOT), 'gda-group'))

/** A repository with a deploy config and whatever files it publishes. */
function repo({ targets, files = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'served-'))
  if (targets) {
    mkdirSync(join(dir, '.deploy'), { recursive: true })
    writeFileSync(join(dir, '.deploy', 'config.json'), JSON.stringify({ contract: 'deploy/1', targets }))
  }
  for (const f of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true })
    writeFileSync(join(dir, f), '{}')
  }
  return dir
}

describe('the served directory is derived from root and framework', () => {
  // `root` is what the HOST serves, which is not always where the files are.
  for (const [framework, root, expected, why] of [
    ['static', 'sites/gord.capital', 'sites/gord.capital', 'a static target serves its root directly'],
    ['static', '.', '', 'a static target at the repository root'],
    ['next', 'public', 'public/public', 'a next app roots at the app and serves its own public/'],
    ['docker', 'apps/marketing', 'apps/marketing/public', 'the shape flashyos.com actually has'],
    ['next', '.', 'public', 'a next app at the repository root'],
    ['other', '.', '', 'an unknown framework is treated as static rather than assumed'],
  ]) {
    test(`${framework} at ${root}: ${why}`, () => {
      assert.equal(publishedDir(root, framework), expected)
    })
  }
})

describe('it refuses to guess', () => {
  test('a repository with no deploy config answers null, not a plausible directory', () => {
    // The whole point. A scan that finds `public/` in a repository that
    // actually deploys `sites/botz.games` produces a confident wrong answer,
    // and a confident wrong answer is worse than an absence.
    const dir = repo({ files: ['public/.well-known/frontdoor.json'] })
    assert.equal(publishedDirs(dir), null)
    assert.equal(servedAt(dir, '.well-known/frontdoor.json'), null)
  })

  test('a malformed config answers null rather than a partial reading', () => {
    const dir = mkdtempSync(join(tmpdir(), 'served-'))
    mkdirSync(join(dir, '.deploy'), { recursive: true })
    writeFileSync(join(dir, '.deploy', 'config.json'), '{ not json')
    assert.equal(publishedDirs(dir), null)
  })

  test('a config with no targets is an empty list, which is not null', () => {
    // Declaring nothing and declaring none are different findings: the first
    // is unread, the second is a property that hosts nothing here.
    assert.deepEqual(publishedDirs(repo({ targets: [] })), [])
  })
})

describe('a target nothing hosts from this tree is not published from it', () => {
  for (const state of ['external', 'none']) {
    test(`state "${state}" is skipped`, () => {
      // `external` means somebody else hosts it and this repository is not the
      // authority; `none` means nothing hosts it yet. Treating either as
      // published is how a survey reports a property as serving nothing when
      // it serves nothing *here*.
      const dir = repo({ targets: [{ domain: 'x.example', root: '.', framework: 'static', state }] })
      assert.deepEqual(publishedDirs(dir), [])
    })
  }

  test('a live target beside an external one is still published', () => {
    const dir = repo({
      targets: [
        { domain: 'live.example', root: 'sites/live', framework: 'static', state: 'live' },
        { domain: 'theirs.example', root: '.', framework: 'static', state: 'external' },
      ],
    })
    assert.deepEqual(publishedDirs(dir).map((d) => d.domain), ['live.example'])
  })
})

describe('both spellings of well-known, and the second is not a typo', () => {
  test('the variant is declared once, here, and is bounded at two', () => {
    assert.deepEqual([...WELL_KNOWN], ['.well-known', 'well-known'])
  })

  for (const wk of ['.well-known', 'well-known']) {
    test(`finds a door under ${wk}/`, () => {
      const dir = repo({
        targets: [{ domain: 'x.example', root: '.', framework: 'static', state: 'live' }],
        files: [`${wk}/frontdoor.json`],
      })
      assert.equal(servedAt(dir, '.well-known/frontdoor.json')?.file, join(wk, 'frontdoor.json'))
    })
  }
})

describe('a multi-domain repository attributes each file to its own property', () => {
  // The half a `sites/*` scan cannot supply and gets wrong: four domains in
  // one repository, and a door belongs to exactly one of them.
  const dir = () =>
    repo({
      targets: [
        { domain: 'first.example', root: 'sites/first', framework: 'static', state: 'live' },
        { domain: 'second.example', root: 'sites/second', framework: 'static', state: 'live' },
      ],
      files: ['sites/second/well-known/frontdoor.json'],
    })

  test('names the domain that actually serves it', () => {
    assert.equal(servedAt(dir(), '.well-known/frontdoor.json')?.domain, 'second.example')
  })

  test('builds the url a stranger would fetch, not the path on disk', () => {
    assert.equal(servedAt(dir(), '.well-known/frontdoor.json')?.url, 'https://second.example/.well-known/frontdoor.json')
  })
})

describe('files published at the property root', () => {
  test('agents.txt is found beside the site, not under well-known', () => {
    const dir = repo({
      targets: [{ domain: 'x.example', root: 'apps/marketing', framework: 'docker', state: 'live' }],
      files: ['apps/marketing/public/agents.txt'],
    })
    const at = servedAtRoot(dir, 'agents.txt')
    assert.equal(at?.url, 'https://x.example/agents.txt')
    assert.equal(at?.file, join('apps', 'marketing', 'public', 'agents.txt'))
  })

  test('absent is null, never a path that does not exist', () => {
    const dir = repo({ targets: [{ domain: 'x.example', root: '.', framework: 'static', state: 'live' }] })
    assert.equal(servedAtRoot(dir, 'agents.txt'), null)
  })
})

describe('it reads the real estate', () => {
  test(
    'resolves the layouts that have caught this estate out',
    { skip: !ESTATE_BESIDE && 'needs the estate beside this checkout' },
    () => {
      const at = (name, path) => servedAt(join(dirname(ROOT), name), path)

      // flashyos.com: root is `apps/marketing` and the files are a level
      // deeper. Derived, not listed.
      const own = servedAt(ROOT, '.well-known/frontdoor.json')
      assert.equal(own?.domain, 'flashyos.com')
      assert.match(own.file, /^apps\/marketing\/public\//)

      // gord.capital: a second domain inside a repository whose first domain
      // publishes from the root, under the undotted spelling.
      const cap = at('gold-holdings', '.well-known/frontdoor.json')
      if (cap) assert.ok(cap.domain.endsWith('.holdings') || cap.domain.endsWith('.capital'), cap.domain)

      // The vacuity guard: this test is worthless if it resolved nothing.
      assert.ok(own, 'resolved no surface in this repository')
    },
  )
})
