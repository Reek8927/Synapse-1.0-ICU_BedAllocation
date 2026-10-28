# Phase 5 model comparison (historical, superseded)

The first Phase 5 logistic-vs-gradient-boosting comparison was run against the initial `target_future_sepsis_label_6h` target. That target is now considered unsuitable for evaluating early sepsis-onset prediction because it remains positive for rows after the source label has already turned positive.

The old metrics and model artifacts are retained as historical experiments only. Do not compare them directly with models trained on `target_sepsis_onset_next_6h`. Follow `docs/phase-6-corrected-target.md` and rebuild the processed data before training candidates again.
