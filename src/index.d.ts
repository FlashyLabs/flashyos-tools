/**
 * Types for @flashyos/tools.
 *
 * Hand-written signatures over derived names: `types.test.mjs` imports the
 * real module and fails if this file declares an export the module does not
 * have, or omits one it does. A .d.ts that has quietly stopped describing its
 * own module is worse than none, because a consumer's editor keeps agreeing
 * with it.
 */

// ── served ──────────────────────────────────────────────────────────────────

/** Both spellings, because some static hosts will not serve a dot-directory. */
export declare const WELL_KNOWN: readonly ['.well-known', 'well-known']

/** `deploy/1` constrains this; it is never inferred from a lockfile. */
export type Framework = 'next' | 'docker' | 'static' | 'none'

export interface PublishedTarget {
  /** The domain the host answers on. */
  domain: string
  /** The directory the target is rooted at, as declared. */
  root: string
  /** Null when the declaration names none — not a default. */
  framework: Framework | null
  /** The directory the host actually serves, derived from `framework`. */
  dir: string
  state: string | null
}

export interface ServedFile {
  domain: string
  /** Path relative to the repository root. */
  file: string
  /** Where it is reachable, if the host is up. Committed is not served. */
  url: string
}

/** The static directory a target serves, derived from its framework. */
export declare function publishedDir(root: string, framework?: Framework | null): string

/**
 * Every domain this repository publishes, and the directory each serves from.
 *
 * `null` means the repository DECLARES NOTHING — a finding with a name, and
 * not the same as an empty array, which means it declares targets that publish
 * from elsewhere. Callers that collapse the two report a repository as serving
 * nothing when it was never asked.
 */
export declare function publishedDirs(repo: string): PublishedTarget[] | null

/** Where a repository serves a given well-known path from, if anywhere. */
export declare function servedAt(repo: string, wellKnownPath: string): ServedFile | null

/** The same, for a file at a property's root rather than under well-known. */
export declare function servedAtRoot(repo: string, name: string): ServedFile | null

// ── reachability ────────────────────────────────────────────────────────────

/**
 * Three silences, never one.
 *
 * `refused` is a fact about the runner and never counts against a property;
 * `unreachable` is the nearest thing to a fact about the host; `ambiguous`
 * is what a failure behind a proxy entitles you to say, which is nothing.
 */
export type Silence = 'unreachable' | 'ambiguous' | 'refused'

export interface Reachability {
  state: Silence
  /** Node's error code where there was one — never its message. */
  code: string | null
  why: string
}

export declare function proxyUrl(env?: NodeJS.ProcessEnv): string | null

/** What a failed fetch entitles you to say. */
export declare function classify(error: unknown, env?: NodeJS.ProcessEnv): Reachability

/**
 * Whether an HTTP status is the host's answer or the thing in front of it.
 *
 * `null` where the status is the host's own and needs no hedge.
 */
export declare function classifyStatus(status: number, env?: NodeJS.ProcessEnv): Reachability | null

/** One line, in the same words everywhere. */
export declare function say(result: Reachability): string

/** States that must never be counted for or against a property. */
export declare const UNCOUNTABLE: ReadonlySet<Silence>
