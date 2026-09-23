// Was the domain down, or were we not allowed to ask?
//
// ── Why this is shared rather than written four times ──────────────────────
//
// `fetch` returns the same nothing for a parked domain, a DNS error, a host
// that is genuinely down, and an egress proxy refusing the CONNECT. Four tools
// in this repository make network calls and each had to decide what to say
// about a failure. Two had learned to hedge, in their own words; two reported
// the failure as a fact about somebody else's property.
//
// That is not a cosmetic difference. On 2026-08-31 `estate-join` called eleven
// hosts unreachable and every one was a proxy refusal — a reader would have
// concluded half the estate was down. The same environment answered `403` to a
// conformance run against flashygroup.com, which is indistinguishable from the
// site refusing, and an earlier report had written up a property as having
// Deployment Protection on exactly that measurement.
//
// ── What can honestly be said ──────────────────────────────────────────────
//
// Nothing here can prove a host is down. What it can do is know when it is not
// in a position to claim anything, and say so in one voice:
//
//   `refused`     an egress policy rejected the connection. A fact about this
//                 runner. Never counted against the property.
//   `unreachable` the connection failed with no proxy in the way. The nearest
//                 thing to a fact about the host, and still not a claim that
//                 the site is down — DNS and the wider network are between us.
//   `ambiguous`   the connection failed and a proxy is configured. Could be
//                 either, and saying which would be inventing the answer.
//
// A ratio is never computed over a host in any of these states. That rule is
// the reason the join survey's numbers were still true on a run where half the
// estate could not be reached.

/** The proxy this process would use, if any. Set by the environment, not us. */
export const proxyUrl = (env = process.env) =>
  env.HTTPS_PROXY ?? env.https_proxy ?? env.HTTP_PROXY ?? env.http_proxy ?? null

/**
 * Connection failures worth naming, and the ones that mean something specific.
 *
 * Deliberately matched on the code rather than the message: Node's phrasing
 * changes between versions and a tool that greps the sentence stops working
 * quietly, at the exact moment somebody is trying to find out why a domain is
 * silent.
 */
const CODES = {
  ENOTFOUND: 'no DNS record',
  EAI_AGAIN: 'DNS lookup failed',
  ECONNREFUSED: 'connection refused',
  ECONNRESET: 'connection reset',
  ETIMEDOUT: 'timed out',
  CERT_HAS_EXPIRED: 'the certificate has expired',
  ERR_TLS_CERT_ALTNAME_INVALID: 'the certificate is for another host',
}

const codeOf = (error) => {
  for (let e = error; e; e = e.cause) if (typeof e.code === 'string') return e.code
  return null
}

/**
 * What a failed fetch entitles you to say.
 *
 * `ENOTFOUND` is the one case a proxy does not muddy: a name that does not
 * resolve did not resolve, whoever asked. Everything else, behind a proxy, is
 * ambiguous — and this returns `ambiguous` rather than guessing, because the
 * cost of guessing wrong is a report saying somebody's site is down when it is
 * not.
 */
export function classify(error, env = process.env) {
  const code = codeOf(error)
  const why = CODES[code] ?? String(error?.message ?? error).slice(0, 80)

  // A name that does not resolve is a fact regardless of what sits in front of
  // us — the lookup happens before any CONNECT.
  if (code === 'ENOTFOUND') return { state: 'unreachable', code, why }
  // An abort is our own timeout firing, not the host's answer.
  if (error?.name === 'AbortError' || code === 'ABORT_ERR') {
    return { state: proxyUrl(env) ? 'ambiguous' : 'unreachable', code: code ?? 'ABORT_ERR', why: 'timed out' }
  }
  if (proxyUrl(env)) return { state: 'ambiguous', code, why: `${why}, and an egress proxy is configured` }
  return { state: 'unreachable', code, why }
}

/**
 * Whether an HTTP status is the host's answer or the thing in front of it.
 *
 * A gateway answers 403 to a CONNECT it will not make, and a site answers 403
 * to a request it will not serve. Identical on the wire. Behind a proxy the
 * only honest reading is that we do not know — which is what stopped
 * flashygroup.com being written up as failing conformance on a measurement
 * that never left this machine.
 */
export function classifyStatus(status, env = process.env) {
  if (status === 403 && proxyUrl(env)) {
    return { state: 'ambiguous', code: '403', why: '403 — the site refusing, or this runner’s egress refusing; identical from here' }
  }
  return null
}

/** One line, in the same words everywhere. */
export function say(result) {
  if (result.state === 'refused') return `refused by this runner’s egress — ${result.why}`
  if (result.state === 'ambiguous') return `silent — down, parked, or blocked from here (${result.why})`
  return `unreachable — ${result.why}`
}

/** States that must never be counted for or against a property. */
export const UNCOUNTABLE = new Set(['refused', 'ambiguous', 'unreachable'])
