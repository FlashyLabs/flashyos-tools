import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
// The source lives in a monorepo that may or may not be checked out beside
// this one. Absent is UNKNOWN, never passed: a drift test that quietly
// succeeds when it cannot see the source is worse than no drift test, because
// it reads as a check that ran.
const SOURCE = join(HERE, '..', '..', 'flashyos', 'tools')

const COPIED = ["served.mjs","reachability.mjs"]

describe('the copies still match their source', () => {
  for (const file of COPIED) {
    test(`${file} is byte-identical to its origin`, { skip: !existsSync(join(SOURCE, file)) && 'flashyos is not checked out beside this repository — unknown, not current' }, () => {
      assert.equal(
        readFileSync(join(HERE, file), 'utf8'),
        readFileSync(join(SOURCE, file), 'utf8'),
        `${file} has drifted from its source`,
      )
    })
  }

  test('there is something to compare', () => {
    assert.ok(COPIED.length > 0, 'no files are declared as copies, so the check above asserts nothing')
  })
})
