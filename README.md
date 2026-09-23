# flashyos-tools

```
        ██
       ██
      ██████
        ██
       ██
      ██
```

[![CI](https://github.com/flashylabs/flashyos-tools/actions/workflows/ci.yml/badge.svg)](https://github.com/flashylabs/flashyos-tools/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/licence-Apache--2.0-blue)](LICENSE)

**Two small answers to questions that fail silently.**

In a repository with more than one deploy target, which directory ends up at which URL? And when a fetch comes back with nothing, was that the host or your own egress proxy? Both have a correct answer, neither is usually checked, and both fail the same way — a confident wrong answer arrives and nothing goes red.

## Using it

```bash
npx @flashyos/tools served .
# flashyos.com                 apps/marketing/public
# app.flashyos.com             apps/web/public

npx @flashyos/tools reachable https://example.org/.well-known/thing.json
# 200
```

As a library, where the answers matter more than the printing:

```js
import { publishedDirs, servedAt } from '@flashyos/tools'

// null, not a guess, when nothing declares where this repository publishes.
const targets = publishedDirs('.')
if (targets === null) throw new Error('unread — no .deploy/config.json')

// Which domain actually serves a file, not just which path holds it.
servedAt('.', '.well-known/openapi.json')
// → { domain: 'api.example.org', file: 'sites/api/.well-known/openapi.json',
//     url: 'https://api.example.org/.well-known/openapi.json' }
```

`reachability` is the other half, and it is forty lines:

```js
import { classify, classifyStatus, say, UNCOUNTABLE } from '@flashyos/tools'

try {
  const res = await fetch(url)
  const hedge = classifyStatus(res.status)   // 403 behind a proxy → ambiguous
  if (hedge) console.log(say(hedge))
} catch (e) {
  const result = classify(e)                 // unreachable | ambiguous | refused
  if (UNCOUNTABLE.has(result.state)) return  // never enters a ratio
}
```

## The invariants

Everything here follows from these. Each is enforced by something rather
than promised, because a rule with nothing behind it erodes one
convenience at a time.

| Invariant | Why | Enforced by |
| --- | --- | --- |
| **Declared, never scanned** | A scan that finds `public/` in a repository deploying `sites/x` is confidently wrong | `publishedDirs` reads `.deploy/config.json` and returns `null` otherwise |
| **Unread is not zero** | A repository that declares nothing has not declared an empty list | `null` is a distinct return, and the CLI exits 2 rather than printing nothing |
| **Three silences, not one** | A proxy refusal and a dead host need opposite fixes | `unreachable`, `ambiguous` and `refused` are separate states in `UNCOUNTABLE` |
| **No ratio over a silence** | A percentage computed over hosts you could not reach is a fiction | `UNCOUNTABLE` exists to be checked before counting |

> A confident wrong answer is worse than an absence, because it is acted on.

## It works alone

No account, no API key, no telemetry, and no network call unless you ask
for one. If anything here ever needs a service of ours to answer, that is a
bug — you would be right to refuse a checker with a dependency on the party
being checked. That applies to the documentation too: every command in this
file runs against a file in this repository, because a README whose first
line fetches from our domain is one that stops working when we do.

## Types

Shipped, and checked against the module rather than against somebody’s
memory of it. `src/types.test.mjs` imports the real barrel and fails if a
declaration names an export that does not exist, or if an export has no
declaration — the two directions a `.d.ts` rots in, neither of which a
compiler can catch, because a declaration file is authoritative by
construction.

```ts
import { publishedDirs, servedAt, classify, UNCOUNTABLE } from '@flashyos/tools'
```

## What flashyos-tools is not

- **Not a deployment tool.** It reads a declaration; it does not deploy, configure a host, or talk to a provider.
- **Not an uptime monitor.** `reachable` answers once, about one URL, from where you are standing — and is careful about how little that proves.
- **Not a framework detector.** It reads `framework` out of your config. Guessing one from a lockfile is the mistake this package exists to stop.

## A shallow clone answers ancestry questions wrongly

Not a hazard in this package — a hazard in the CI you run it from, and the
reason `.github/workflows/ci.yml` here checks out at `fetch-depth: 0`.

`git merge-base --is-ancestor` exits non-zero for a commit outside a shallow
clone's graft window, which is **byte-identical to "not an ancestor"**. A job
that asks an ancestry question on a default `fetch-depth: 1` checkout gets a
confident wrong answer and no error. It is worth knowing about because
GitHub's default is shallow and most workflows never notice.

## Both spellings of well-known are real

`servedAt` looks under `.well-known/` **and** `well-known/`, and the second
is not a typo. Some static hosts will not reliably serve a dot-directory, so
projects commit the undotted spelling and rewrite onto it.

A checker that knew only the dotted form read 13 properties where 16 served
the file. The variant is bounded at two and declared in one place rather than
remembered in several.

## Status

Pre-1.0. `served` and `reachability` have been running against a
thirty-eight repository estate for months; the API is small and unlikely to
move, but the version says 0.x until somebody outside that estate has depended
on it.

## Contributing

**The most useful thing you can send is an implementation that disagrees
with ours about a refusal.** Two implementations that have never met,
agreeing about what to reject, is the only real evidence a specification
says what it means.

Sign-off rather than a copyright assignment — see
[CONTRIBUTING.md](CONTRIBUTING.md). There is no CLA.

## ⚡ The Strike

This README commits to a sentence that is already on it:

```
sha256: cf97cf4e5cf2d8931cf16bfa6c802e483c4142b7d5cb60b3c708ad7e0db23d44
```

One line, reconstructable exactly by a careful reader of the invariants.
Recover it, verify the hash yourself — never trust, verify, and that
includes us — and open an issue titled `⚡ STRIKE` containing the
preimage.

No prize, no token, no airdrop.

## Licence

[Apache-2.0](LICENSE), copyright Flashy Labs. The rules are open and the
tooling is open; fork either, and check ours against yours.

## The formats these were written for

`directory/1`, `frontdoor/1`, `countersign/1`, `backlog/1`, `shipped/1` and the
rest are Apache-2.0 and specified in the open at
[github.com/flashylabs](https://github.com/flashylabs). Nothing in them requires
an account, a key, or a call to us — including the checking.
