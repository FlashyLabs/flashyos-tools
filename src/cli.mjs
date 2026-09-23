#!/usr/bin/env node
// The command line for `@flashyos/tools`. The modules beside it are the
// library; this is the thin part that reads argv and prints.
//
// It lives here as a real file rather than as a string inside the generator,
// for the reason every generated-source shortcut eventually teaches: source
// assembled from string fragments cannot be linted, cannot be run, and cannot
// be tested until after it has been written out somewhere. This one runs in
// place.
//
// It takes the directory it is asked about as an argument. A public tool does
// not assume it is standing in an estate.
import { classify, classifyStatus, say } from './reachability.mjs'
import { publishedDirs } from './served.mjs'

const USAGE = `
  flashyos-tools <command> [args]

    served <dir>       Which directory does each domain in this repository publish from?
    reachable <url>    Fetch a URL and say whether silence was the host or the network.

  Both answer questions that have a correct answer nothing usually checks, and
  both refuse rather than guess when they cannot answer.
`

const [command, ...rest] = process.argv.slice(2)

if (command === 'served') {
  const dirs = publishedDirs(rest[0] ?? '.')
  if (dirs === null) {
    // Unread is not zero. A repository that declares no deploy target has not
    // declared an empty one, and scanning for a likely directory is how a
    // survey produces a confident wrong answer — which is worse than an
    // absence, because it is acted on.
    process.stderr.write('\n  no .deploy/config.json here — nothing declares where this repository publishes\n\n')
    process.exit(2)
  }
  if (!dirs.length) {
    process.stdout.write('\n  declared, and hosts nothing from this tree\n\n')
    process.exit(0)
  }
  for (const d of dirs) process.stdout.write(`${d.domain.padEnd(28)} ${d.dir || '.'}\n`)
} else if (command === 'reachable') {
  const url = rest[0]
  if (!url) {
    process.stderr.write(USAGE)
    process.exit(2)
  }
  try {
    const res = await fetch(url)
    // A 403 from an egress proxy and a 403 from a host are identical on the
    // wire. Where they cannot be told apart, say so rather than pick one.
    const ambiguous = classifyStatus(res.status)
    process.stdout.write(ambiguous ? `${say(ambiguous)}\n` : `${res.status}\n`)
    process.exit(res.ok || ambiguous ? 0 : 1)
  } catch (e) {
    process.stdout.write(`${say(classify(e))}\n`)
    process.exit(1)
  }
} else {
  process.stderr.write(USAGE)
  process.exit(command ? 2 : 0)
}
