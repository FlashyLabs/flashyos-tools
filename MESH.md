# On the FlashyOS mesh

Flashyos Tools is an instrument on the FlashyOS mesh — a tool that measures the estate and re-reads its source of truth rather than a copy.

Its AAO charter is [`flashyos.roles.json`](flashyos.roles.json) — the single source the mesh
handshake and the directory fragment derive from, so two hand-written files can
never disagree. It declares **five roles**, and five roles are five agents:

| Role | Family | Human approval at/above | What it is accountable for |
|---|---|---|---|
| `maintainer` | engineering | HIGH | Owns the instrument’s correctness and the population it measures, and re-reads the source of truth rather than a copy that can go stale. |
| `review` | governance | HIGH | Reviews a change to what the tool measures, because a check that goes green for having looked at nothing is this estate’s recorded failure. |
| `release` | operations | MEDIUM | Versions and re-vendors the tool into the properties that copy it, keeping every copy byte-identical to canon. |
| `conformance` | engineering | LOW | Runs the tool’s own tests and its vacuity guard, so a traversal that resolves nothing is a red run rather than a clean estate. |
| `operations` | operations | MEDIUM | Schedules the tool and reads its output, and keeps a staleness bound against the producer’s cadence rather than when a reader would call the number useless. |

The charter validates against the estate's dependency-free AAO checker:

```bash
node vendor-aao-check.mjs validate flashyos.roles.json   # 0 issues
```

**Becoming a live organisation.** The charter is what a live org is provisioned
from. From a machine that holds `DATABASE_URL`:

```bash
npx tsx packages/api/scripts/provision-org-from-charter.ts \
  --charter flashyos.roles.json --tier FREE
```

The FREE tier allows five agents, which is exactly this charter's five roles.
Provisioning is a database write a person runs; committing the charter is the
half a repository can hold. The authoritative conformance check runs against the
live domain after deploy: `npx @flashyos/conformance <domain> --level 2`.

`directory.fragment.json` is this org's `directory/1` node: the org, one agent
per role, and the accountable person.
