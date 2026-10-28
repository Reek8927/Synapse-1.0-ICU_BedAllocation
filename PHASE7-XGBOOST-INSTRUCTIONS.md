# BedAllocation Phase 7: XGBoost candidate add-on

This is a small source patch for the existing Phase 6 project. It adds a separate XGBoost comparison module and unit tests. It does not contain or replace your patient data, existing models, environment files, or hospital application.

1. Extract this ZIP.
2. Copy its `ml-service` and `docs` contents into your current project root (`E:\BedAllocation-Rebuild-Phase4\BedAllocation-Rebuild`), merging folders and replacing `ml-service\pyproject.toml` with the included version.
3. From the existing `ml-service` terminal, run `python -m unittest discover -s tests -v`.
4. Run `python -m bedallocation_ml.compare_models_xgboost --data-dir data/processed_onset --artifact-dir artifacts_onset`.

See `docs/phase-7-xgboost.md` for details.
