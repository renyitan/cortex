# Cortex lossless memory formation instrument result

> **Status as of 2026-08-31:** `instrument_invalid`
> **Frozen model:** `gpt-5-mini`, low reasoning
> **Cortex diagnostic commit:** `94965c0b186719d4c8903486dc83d3758bf116df`
> **Run-manifest SHA-256:** `09e3e00c3a8820f6c732dc57bf3568c7954e3149a10e962ecc1c814fad2564fb`

## Decision

The frozen oracle/raw instrument did not establish a reliable ceiling. Model formation and
model-enriched treatment were therefore not run.

The oracle condition beat raw in every repetition and gained 23.1 percentage points overall, but
the frozen gate required at least 35 correct answers out of 36 in every repetition. Oracle reached
only 22, 25, and 22.

| condition | repetition 1 | repetition 2 | repetition 3 | aggregate |
|---|---:|---:|---:|---:|
| raw direct | 15/36 | 13/36 | 16/36 | 44/108 (40.7%) |
| oracle enriched direct | 22/36 | 25/36 | 22/36 | 69/108 (63.9%) |

The single infrastructure failure occurred in a raw-direct cell. All 108 oracle calls completed, so
the failed absolute oracle gate is not explained by provider failure.

## Where the oracle reader failed

| dimension | oracle correct |
|---|---:|
| decisions | 24/36 |
| procedures | 24/36 |
| scoped preferences | 21/36 |
| current in-scope state | 24/36 |
| adjacent-scope boundary | 20/36 |
| historical as-of state | 25/36 |

The 39 incorrect oracle cells comprised 16 scope-boundary errors, 12 stale-value errors, and 11
historical-state errors.

## Interpretation

This is not evidence that evidence-preserving formation fails. The experiment stopped one gate
earlier: even evaluator-authored exact-copy claims with correct kind, subject, scope, time,
provenance, and supersession did not make the frozen direct reader reliable enough to evaluate
model-formed claims.

The result does show that structured claims materially helped this reader relative to raw
observations. That 23.1-point development gain is descriptive only. It cannot support a formation
claim because the oracle ceiling remained far below the frozen acceptance threshold.

Any retry must be a versioned replacement instrument with a new freeze and independent validation.
The failed frozen run must not be tuned or reinterpreted after seeing these outcomes.

## Execution record

- 216 answer calls completed or were retained in the frozen plan.
- 216 attempts and 216 turns were recorded.
- Total measured cost was `$0.4416898`, within the `$4.00` cap.
- Input tokens: 263,812.
- Output tokens: 183,326.
- Cache-read tokens: 363,392.
- Total tokens: 810,530.
- Measured cumulative latency: 2,187,817 ms.
- Production Cortex memory types, store, controller, and lifecycle remained unchanged.
- The original diagnostic commit was cherry-picked to public commit `c695ad0`; both commits have
  the identical tree `a7bb558b35942147141ad44ed64d0d87068fb874`.

## Public artifacts

- [`run-binding.json`](run-binding.json)
- [`redactions.json`](redactions.json)
- [`instrument-report.json`](instrument-report.json)
- [`terminal-report.json`](terminal-report.json)
- [Frozen fixture and specification](../../cognition-harness/fixtures/lossless-formation/)

The exact run manifest is not public because it contains a machine-local fixture path. Its SHA-256
is retained in `run-binding.json`. The equivalent evaluation code, exact synthetic fixture,
sanitized cell report, and sanitized terminal report are public.

One failed cell contained a complete provider-controlled HTML 502 response. The public reports
replace that body with a bounded status message. [`redactions.json`](redactions.json) records the
original message hash, length, affected JSON paths, and exact replacement.

`terminal-report.json` contains zero model-enriched cells and incomplete claim-audit fields because
those stages were blocked. They are placeholders, not observed treatment outcomes.
