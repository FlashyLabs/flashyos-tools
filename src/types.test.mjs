/**
 * The .d.ts is checked against the module, not against a reviewer's memory.
 *
 * A type declaration decays in one direction and in silence: somebody adds an
 * export, nobody adds a line here, and every consumer's editor keeps agreeing
 * with a file that has stopped describing the module. The compiler cannot
 * catch it — a .d.ts is authoritative BY CONSTRUCTION, so a missing export is
 * simply a name TypeScript says does not exist, and an export declared here
 * but deleted from the module is a name it says does.
 *
 * So this imports the real module, reads what it actually exports, and
 * compares the two sets. It does NOT check the signatures — that would want a
 * compiler, and this package has no dependencies on purpose. What it holds is
 * the half that rots: the names.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as mod from './index.mjs'

const dts = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.d.ts'), 'utf8')

/** Value exports only — a type or interface has no runtime name to compare. */
const declared = new Set([...dts.matchAll(/^export declare (?:const|function) (\w+)/gm)].map((m) => m[1]))
const actual = new Set(Object.keys(mod))

test('the declarations name something', () => {
  // Vacuity guard. A regex that matched nothing would make both assertions
  // below pass over two empty sets, and report a perfectly typed package.
  assert.ok(declared.size > 0, 'no value exports parsed out of index.d.ts')
  assert.ok(actual.size > 0, 'the module exports nothing')
})

test('every export the module has is declared', () => {
  const missing = [...actual].filter((n) => !declared.has(n)).sort()
  assert.deepEqual(missing, [], 'exported and untyped: ' + missing.join(', '))
})

test('every declaration names an export that exists', () => {
  const phantom = [...declared].filter((n) => !actual.has(n)).sort()
  assert.deepEqual(phantom, [], 'declared and not exported: ' + phantom.join(', '))
})
