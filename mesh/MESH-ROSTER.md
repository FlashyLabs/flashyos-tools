# The mesh roster — every repository as a five-agent organisation

`mesh/orgs.json` (contract `mesh-roster/1`) is the population the estate's claim
*"every repository is a five-agent FlashyOS organisation"* is measured against:
one row per repository the estate owns, its AAO org slug, its kind, and whether
it carries a **valid charter** — measured from a sibling checkout, never assumed.

## The three tools

| Tool | Does |
|---|---|
| `estate-charter.mjs` | Generates an `aao/0.1` charter with **exactly five roles** (five agents) for a repository by kind, plus its `directory/1` fragment and a `MESH.md` note. Refuses to overwrite an existing charter, and never reduces one. Validated against the vendored AAO checker before it writes. |
| `vendor-mesh-roster.mjs` | The dependency-free checker for `mesh-roster/1` (`check` / `list`). |
| `build-roster.mjs` | Rebuilds `orgs.json` by **measuring** each repo's charter in a checkout root. A repo not checked out is `present:false, roles:null, valid:null` — unread, never counted as zero. |
| `estate-provision.mjs` | Turns the roster into a provisioning plan: the exact `provision-org-from-charter` command and tier per ready org. `--commit` refuses without `DATABASE_URL`. |

```bash
node mesh/estate-charter.mjs <repo-dir> <owner/name> <kind>   # spec|platform|site|library|tooling|client|vault
node mesh/build-roster.mjs mesh/repos.tsv <checkout-root> mesh/vendor-aao-check.mjs > mesh/orgs.json
node mesh/vendor-mesh-roster.mjs list mesh/orgs.json
node mesh/estate-provision.mjs mesh/orgs.json            # the plan
```

## Five roles = five agents, and why not always five

A charter declares standing **roles**; the mesh mints one **agent** per role.
Five roles is the target because the FREE tier allows five agents. The generator
writes exactly five for a repository that has none.

It **never trims an existing charter to hit five.** A property that legitimately
declares more roles (or fewer, like Rites Protocol's three-rung ladder) keeps
them — cutting a governance charter to fit a plan cap is the metric gamed rather
than met, the estate's recorded rule. So `orgs.json` reports the *measured* role
count, and `mesh-roster/1` counts "five agents" and "chartered" separately.

## Becoming live is a person's write

Committing a charter is the half a repository can hold. A **live** organisation
is provisioned from the charter into the FlashyOS database:

```bash
npx tsx packages/api/scripts/provision-org-from-charter.ts \
  --charter flashyos.roles.json --tier FREE
```

That is a `DATABASE_URL` write run by whoever holds it, never by a workflow
without the secret — a live org is a decision a person signs. `estate-provision.mjs`
prints the plan; it will not run it for you.

## Repo-only, not part of the published package

These tools are **estate instruments that run in a checkout of this
repository — not exports of `@flashyos/tools`**. The published package's `files`
list is `["src", "README.md", "LICENSE"]`, so nothing under `mesh/` is packed
into the npm tarball, and nothing in `src/` (the shipped library, the CLI, or
the type declarations) imports from `mesh/`. That is deliberate: `build-roster`,
`estate-charter` and `estate-provision` only mean anything against this estate's
own population (`repos.tsv`, sibling checkouts, the FlashyOS provisioning API),
so they are run as `node mesh/<tool>.mjs …` from here, never `import`ed by a
consumer of the package. `mesh/packaging.test.mjs` asserts the boundary — `mesh`
absent from `files`, `src/` free of any `mesh/` reference — so a future change
cannot quietly ship the instruments under a README that documents only the
library.

## Re-vendoring

`vendor-aao-check.mjs` is byte-identical to `aao/vendor-aao-check.mjs`. The test
compares them when the sibling is checked out beside this repository and reports
**UNKNOWN**, never passed, when it is not. Re-vendor from `aao`; never edit here.
