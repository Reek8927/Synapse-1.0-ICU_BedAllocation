# Phase 4 ML checklist (historical, superseded)

The initial Phase 4 implementation built a target that was 1 when the source PhysioNet `SepsisLabel` was positive in any of the next six rows. That target was useful for exercising the pipeline but is **not suitable for evaluating early sepsis-onset prediction**: the source `SepsisLabel` itself remains positive from six hours before annotated onset and through subsequent rows.

Use the corrected target in `docs/phase-6-corrected-target.md` and rerun dataset preparation before any further model comparison. Existing Phase 4/5 models and metrics refer to the old target and must not be combined with corrected-target results.
