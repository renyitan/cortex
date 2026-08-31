# Stage 1: lifecycle feasibility

## Question

Could host code enforce a real `WAKE -> WORK -> SLEEP` sequence instead of relying on a model to
remember the procedure?

## Result

Yes. An evaluation-only Pi controller constrained each phase to one schema-bound completion
receipt, rejected invalid state transitions, and committed only host-validated memory writes.

One synthetic two-session trial stored a fictional release-note convention, recalled it later,
applied it correctly, and avoided a redundant memory write.

## Boundary

This established mechanism feasibility only. It did not compare Cortex with direct memory
injection, estimate a stable pass rate, test realistic accumulated memory, or show that the extra
phases improved task quality.

That missing comparison became the next stage rather than being inferred from the successful
demonstration.
