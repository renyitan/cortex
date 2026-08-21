# Findings and limitations

This page is the concise conclusion for Cortex `v0.33.0`. It distinguishes
properties exercised by checked-in tests from broader claims the project did not establish.

![Evidence boundary from deterministic tests and inspectable local mechanism evidence to the unestablished questions of model delivery, model use, and behavioral improvement](diagrams/evidence-boundary.png)

## Supported conclusions

| Conclusion | Repository evidence | Boundary |
|---|---|---|
| Agent state can remain plain Markdown while local tools use faster projections. | Memory contracts, `recall-index`, index audit and regression tests | Shows state separation and retrieval mechanics, not model use |
| Identity and persona can be composed deterministically into host entrypoints. | `cortex-bind` and the local-install regression test | Verified Copilot projection, not equivalent behavior across hosts |
| A session-start adapter can make setup, projection refresh, state scaffolding, and retrieval readiness observable. | Local-install, cognition event, phase, and retrieval tests | Shows that mechanisms ran, not that recall completed |
| Canonical memory writes can be pre-image checked, receipted, and reconciled. | Consolidation transaction contract and tests | Protects write integrity; semantic judgment remains model- or operator-owned |
| Local operational traces can avoid storing prompts and memory bodies. | Cognition event schema, path checks, redaction tests | Applies to Cortex events, not to host or model-provider telemetry |

These conclusions concern implementation properties. They are reproducible without a model by
running:

```bash
scripts/cortex-lint
for test in tests/test-*; do "$test"; done
```

## Not established

Cortex `v0.33.0` does not provide public evidence that:

- recalled records consistently entered the model's context;
- an LLM attended to or followed those records;
- `WAKE`, `WORK`, `SLEEP`, and `CURATE` all ran automatically;
- accumulated memory improved general task quality;
- optional dense retrieval improved downstream behavior;
- the design remains reliable under concurrent writers or a large fleet of agents;
- Claude Code or another host enforced the same lifecycle as Copilot CLI.

The distinction matters because an index hit, hook event, or loaded skill is only mechanism
evidence. None is a behavioral outcome by itself.

## Practical conclusion

Cortex is best read as a design and implementation study in operator-owned agent cognition. Its
strongest contribution is not a claim of autonomous self-improvement. It is the explicit separation
between:

- canonical state and removable projections;
- semantic phases and host callbacks;
- mechanism evidence and behavioral evidence;
- automatic writes and operator approval.

Those boundaries remain useful reference points. Proving the behavioral loop would require a
separate controlled research program rather than inference from the plugin's mechanisms.
