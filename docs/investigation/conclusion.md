# Cortex investigation conclusion

> **Status as of 2026-08-31:** Research complete. Product development parked.

## Conclusion

Cortex did not demonstrate enough behavioral value to justify continued product development.

The project succeeded at building inspectable lifecycle mechanics, operator-owned Markdown state,
bounded retrieval, validated writes, and an evaluation harness. Those mechanisms did not translate
into better task outcomes than the simpler baseline of giving the same evidence directly to the
model.

The most defensible public statement is:

> In controlled evaluation-only harnesses, Cortex enforced its tested lifecycle reliably and
> improved some memory-safety properties, but it did not establish better delayed-task accuracy
> than direct evidence use. Its tested semantic-formation and enforced-use paths both reduced
> multi-hop accuracy.

## Product decision

- Do not describe Cortex as a self-improving or superior memory system.
- Do not continue adding phases, prompts, schemas, or retrieval features without prior causal
  evidence.
- Preserve the plugin as a reference implementation and the repository as a negative-results
  research artifact.
- Keep the project unsupported and archive the GitHub repository after publication.

## Reopening condition

Cortex should be reconsidered only after an independent selective-context method demonstrates that
it can match or beat direct full-context use on tasks where the complete evidence genuinely cannot
fit in the available context window.

That work is a separate research question. It should prove its value before being incorporated into
Cortex, not use Cortex as the starting assumption.
