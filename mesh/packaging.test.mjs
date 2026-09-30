// The package boundary is a decision, not an accident.
//
// The library `@flashyos/tools` is `served` + `reachability`, under `src/`.
// The estate instruments under `mesh/` (charter generator, roster builder,
// mesh-roster checker, provisioning planner) are run in place from a checkout
// of this repository and are deliberately NOT part of the published package.
//
// These tests assert that boundary from both ends — the packed file set, and
// the runtime coupling — so the mesh tooling cannot silently start shipping
// under a README, `exports` and `bin` that describe only the library, nor stop
// shipping if a maintainer later decides it should. Behaviour, not prose: the
// `files` array is the exact mechanism npm uses to build the tarball.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const ROOT = join(HERE, '..');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

describe('the mesh tooling is repo-only, not shipped in the package', () => {
  test('mesh/ exists on disk, so the exclusion is a decision about real files', () => {
    assert.ok(existsSync(join(ROOT, 'mesh')), 'mesh/ directory is present in the repository');
    const tools = readdirSync(join(ROOT, 'mesh')).filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'));
    // The instruments the README and MESH-ROSTER.md name.
    for (const t of ['build-roster.mjs', 'estate-charter.mjs', 'estate-provision.mjs', 'vendor-mesh-roster.mjs']) {
      assert.ok(tools.includes(t), `mesh/${t} is one of the repo-only instruments`);
    }
  });

  test('package.json "files" ships the library and nothing under mesh/', () => {
    assert.ok(Array.isArray(pkg.files) && pkg.files.length > 0, '"files" is a non-empty allowlist');
    assert.ok(pkg.files.includes('src'), 'the shipped library lives under src/');
    for (const entry of pkg.files) {
      assert.ok(
        !/^\.?\/?mesh(\/|$)/.test(entry),
        `"files" must not ship mesh/ — found "${entry}". If the mesh tooling is meant to be an installable export, that is a larger change: give it exports/bin/types and document it in the shipped README, do not just add it here.`,
      );
    }
  });

  test('the shipped entrypoints resolve under src/, never mesh/', () => {
    const under = (p) => typeof p === 'string' && /^\.?\/?src\//.test(p);
    // bin
    const bins = typeof pkg.bin === 'string' ? [pkg.bin] : Object.values(pkg.bin || {});
    assert.ok(bins.length > 0, 'a bin is declared');
    for (const b of bins) assert.ok(under(b), `bin "${b}" must live under src/`);
    // exports (default + types) and top-level types
    const dot = pkg.exports?.['.'] || {};
    for (const [k, v] of Object.entries(dot)) assert.ok(under(v), `exports["."].${k} = "${v}" must live under src/`);
    if (pkg.types) assert.ok(under(pkg.types), `"types" = "${pkg.types}" must live under src/`);
  });

  test('nothing in src/ imports or references mesh/ — no runtime coupling', () => {
    for (const f of readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.mjs') || f.endsWith('.d.ts'))) {
      const body = readFileSync(join(ROOT, 'src', f), 'utf8');
      assert.ok(!/\.\.?\/mesh\//.test(body), `src/${f} reaches into mesh/ — the library must not depend on the repo-only instruments`);
    }
  });

  test('the decision is written down where a reader will meet it', () => {
    // README is the SHIPPED doc; MESH-ROSTER.md is beside the instruments.
    // Both must say the tooling is repo-only, so the boundary is a recorded
    // choice rather than a surprise on either side.
    const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
    assert.match(readme, /mesh tooling is repo-only/i, 'README documents that mesh/ is repo-only');
    assert.match(readme, /\[["'`]?src["'`]?, ["'`]?README\.md["'`]?, ["'`]?LICENSE["'`]?\]/, 'README states the exact files allowlist that excludes mesh/');
    const roster = readFileSync(join(HERE, 'MESH-ROSTER.md'), 'utf8');
    assert.match(roster, /repo-only|not part of the published package/i, 'MESH-ROSTER.md documents the exclusion');
  });
});
