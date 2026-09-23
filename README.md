# flashyos-tools

**Two small answers to questions that fail silently.**

In a repository with more than one deploy target, which directory ends up at which URL? And when a fetch comes back with nothing, was that the host or your own egress proxy? Both have a correct answer, neither is usually checked, and both fail the same way — a confident wrong answer arrives and nothing goes red.

## Install

```bash
npx @flashyos/tools served .
```

## Why it exists

Everything here exists because of a defect that shipped somewhere real and
was not noticed. The failure mode these share is a confident wrong answer
rather than an error: nothing goes red, the number looks fine, and it is
acted on.

## It works alone

No account, no API key, no telemetry, and no network call unless you ask
for one. If a tool here ever needs a service of ours to answer, that is a
bug — you would be right to refuse a checker with a dependency on the party
being checked.

## Licence

Apache-2.0, copyright Flashy Labs. See [LICENSE](LICENSE).

## If you are here from a `$id` or a corpus

The formats these tools were written for are published, machine-readable and
implementable without installing anything:

```bash
curl -s https://flashyos.com/.well-known/specs.json | jq .
```
