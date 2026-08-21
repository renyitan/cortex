# cortex — memory-schema reference

> **What this is.** The complete, canonical record schema for cortex's memory stores — the full field
> semantics, the parse contract, and the link mechanics. It is the **one source of truth** for the
> record format; `operating.md` keeps only a compact resident core and points here, and the skills
> (`consolidate`, `curate`, `recall`, `encode`) name this file as the canonical schema.
>
> **Why it's separate.** This is reference detail, consulted when *writing* or *checking* a record —
> not a per-turn behavioral rule. It ships with the plugin but is **not** part of the always-on
> identity (`cortex-bind` injects only `charter + ethos + operating`), so keeping the precise mechanics
> here instead of in `operating.md` removes inert reference text from every turn's attention budget
> without losing the contract. Load it on demand: it's the schema authority for `SLEEP` (`consolidate`)
> and `CURATE` (`curate`).

## The record (plain markdown, human- and model-readable)

```markdown
### <key>  ·  type:<pattern|pitfall|preference|tool|operational|architecture|investigation>  ·  conf:<n>/10
insight:  <one claim, ≤25 words, one main verb — one record, one insight>
trigger:  <when this should fire>
tags:     <3–8 lowercase keywords / short phrases, comma-separated>
evidence: <pointer + date + at most one fact — a citation, not a second essay>
source:   observed | operator | imported      scope: global | <track>
updated:  <YYYY-MM-DD — last date this record's substance changed>
derives-from: <key>, <key>          # optional — only on a record synthesised from other records
see-also: <key>, <key>              # optional — lateral links to topically-related records
```

Decisions use the same shape with `supersedes: <key>` in place of `conf`.

## Field semantics

- **Atomicity — one record, one insight.** A record must be independently retrievable and dedup-able,
  so it carries exactly one lesson. A record that bundles two gets split (a `consolidate`/`curate`
  judgment, proposed not silent). This is what lets retrieval surface *the* relevant lesson rather than
  a grab-bag. Two write-time bars keep it atomic from birth, so `curate` rarely has to: `insight:` is
  **one claim, ≤25 words, one main verb** (a claim stapled to its rationale with `;`/`and` is two
  records); `evidence:` is **a citation, not a second essay** — pointer + date + at most one fact, with
  the backstory left in the linked artifact. Relocating insight detail into `evidence:` as prose is not
  a fix — it moves bloat instead of cutting it.
- **`tags:` — the curated keyword surface.** 3–8 lowercase keywords or short phrases naming the
  synonyms and concepts the `insight:` prose didn't spell out (e.g. a record about "blocking the event
  loop" tags `async, ui-freeze, performance`). Lexical retrieval matches `tags:` alongside the prose,
  so this is the cheapest partial fix for vocabulary-mismatch *without* embeddings — a human-legible
  keyword layer the agent and a cold reader both use.
- **`updated:` — the record's own clock.** `YYYY-MM-DD`, the last time the record's *substance*
  changed (not a re-read or a tag tweak). Recency is a first-class retrieval and decay signal and
  shouldn't have to be parsed out of an `evidence:` string; `evidence:` keeps its own inline dates as
  the provenance trail, `updated:` is the record's clock.

## Parse contract (the canonical form *is* the schema)

A record starts at a line matching `^### `; the heading is `### <key>  ·  type:<t>  ·  conf:<n>/10`
(or `· supersedes:<key>` for decisions); field lines match `^<name>:` followed by whitespace; the
record ends at the next `^### ` or EOF. Tools that scan, index, or dedup records rely on exactly this —
keeping the contract canonical here means there's no separate schema file to drift from the form.

## Stable references and scope

A public record reference is `<repo-relative-store>::<record-key>`, for example
`memory/learnings.md::search-before-building`. The store path is always repository-relative and uses
forward slashes. The key is the exact heading key before the first metadata separator. Sidecar row
IDs, absolute paths, and line numbers are not public identity because they can change on rebuild.

Scope selectors map to the stored `scope:` value:

- `global` matches `scope: global`;
- `track:<slug>` matches `scope: <slug>` after removing the selector prefix;
- `all` disables scope filtering.

Unknown selector forms are errors. A missing or malformed record scope is a schema defect, not an
implicit global record.

## Link mechanics

- **Derivation links (`derives-from:`).** A record *synthesised from other records* (an inference
  built on existing learnings, not mined straight from raw work) carries an optional `derives-from:`
  line naming the stable `### <key>`s it rests on. `evidence:` stays human prose — *why* I believe it;
  `derives-from:` is the machine-walkable layer — *which records* it stands on. This implements the
  ethos rule "derived things stay **linked** to their source, not mirrored by hand": it lets `curate`
  walk **up** from a belief to its premises and **down** to its dependents, so pruning a parent can't
  silently orphan a child. Raw `observed`/`operator` records with no parent simply omit the line — no
  tax on the common case. Keys are headings that can be renamed or superseded, so a `derives-from:`
  edit is a rename-through-the-seams change: `refs <key>` finds the referrers (it greps every
  tracked file, `derives-from:` lines included), and `cortex-lint` fails when a link resolves to no
  record.
- **Association links (`see-also:`).** Where `derives-from:` is *vertical* (provenance — which records
  this one was built **from**), `see-also:` is *lateral* — an optional line naming topically-related
  records worth reading **alongside** this one, with no claim that either was derived from the other.
  This is the **scaling primitive**: as memory grows, what keeps recall precise is not deeper folders
  but a denser web of association, so retrieval can start from one hit and **spread one hop** to its
  neighbours (the lesson that solves the current problem is often *beside* the one you searched for,
  not inside it). Three properties: (1) **Associative, not hierarchical** — the relation is mutual in
  meaning, so it's declared on **either** record (no need to mirror it on both), and one-hop expansion
  follows it in **both** directions (out-links on the record, plus in-links found by grepping for this
  key in other `see-also:` lines). (2) **A soft link** — unlike a `derives-from:` premise, a `see-also:`
  target carries no orphan risk: retiring a related record doesn't strand this one, so a dangling
  `see-also:` is just removed (lossless), not a retirement blocker. (3) **Proposed at write time** —
  `consolidate` suggests lateral links when it files a record near existing ones; like `derives-from:`,
  the keys are rename-tracked by `refs` and a link that resolves to no record produces an advisory
  `cortex-lint` warning. Records with no obvious neighbour simply omit the line.

Retrieval expands both edge types in both directions. It may walk one or two hops and must deduplicate
cycles. A missing hard derivation target makes the graph invalid. A missing soft association is
reported but does not invalidate otherwise usable records.
