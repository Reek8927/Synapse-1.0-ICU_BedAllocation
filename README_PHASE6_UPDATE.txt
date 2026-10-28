PHASE 6 ML TARGET CORRECTION - READ FIRST

Why this patch exists:
The old target (any positive source SepsisLabel in the next six rows) was unsuitable for early-onset evaluation because the source PhysioNet label is already positive from six hours before annotated onset onward, including post-onset rows. The new pipeline estimates onset from the first source-positive row + 6 hours, creates target_sepsis_onset_next_6h, and excludes post-onset rows.

Safe update:
1. Extract this patch directly into your existing BedAllocation-Rebuild project root and allow the included ML files/docs/notebooks to overwrite their older versions.
2. Keep ml-service/.venv, ml-service/data/raw, ml-service/data/processed, all existing artifacts, backend/.env, frontend/.env.local, and MongoDB data unchanged.
3. Open PowerShell in ml-service, activate the existing .venv, then run:
   python -m unittest discover -s tests -v
4. Prepare corrected data into a NEW directory:
   python -m bedallocation_ml.prepare_dataset --raw-dir data/raw --output-dir data/processed_onset
   Do not set output-dir to data/processed; old datasets remain as historical artifacts.
5. Inspect data/processed_onset/schema.json and the split rows/positive rates before training. Send those counts for review.
6. Only after reviewing target counts, compare models:
   python -m bedallocation_ml.compare_models --data-dir data/processed_onset --artifact-dir artifacts
7. Select a candidate using validation results, then evaluate the test split once:
   python -m bedallocation_ml.evaluate_test --data-dir data/processed_onset --artifact-dir artifacts --model-key hist_gradient_boosting

Old trained model files and metrics are preserved and use the old target. Do not combine them with the new target results. All model outputs remain research-only, not an ICU-admission model or a clinical decision rule.
