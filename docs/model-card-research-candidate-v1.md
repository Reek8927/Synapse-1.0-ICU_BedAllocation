# Model Card — BedAllocation Research Candidate v1

## Status and allowed use

**Status: research-only prototype. Not clinically validated. Not approved for clinical use.** This artifact may be used for a controlled software demonstration with synthetic inputs and for reproducibility research. It must not diagnose a patient, issue a clinical alert, determine ICU eligibility, rank patients, reserve beds, or authorize admission.

## Intended prediction target

- Target column: `target_sepsis_onset_next_6h`
- Definition: whether an *inferred annotated sepsis onset* occurs in the next 1–6 hourly positions.
- Inference of onset: the first source `SepsisLabel == 1` row plus the documented six-hour source-label shift from the PhysioNet Challenge 2019 data.
- Post-onset rows for sepsis-positive records are excluded. Final rows with incomplete future horizon are excluded for non-sepsis records.
- This is not an ICU-admission target, not a validated clinical sepsis prediction, and not a clinical priority score.

## Data and development

- Dataset: PhysioNet Computing in Cardiology Challenge 2019 raw training PSV files.
- Patient-level split: 70% train, 15% validation, 15% test, with no patient crossing splits.
- Features: 40 numeric source columns as enumerated in the generated dataset `schema.json`; `SepsisLabel` and `patient_id` are not model features.
- Current primary research reference: `HistGradientBoostingClassifier` pipeline, in artifact `sepsis_onset_next_6h_hist_gradient_boosting.joblib`.
- Challenger: class-weighted XGBoost, in artifact `sepsis_onset_next_6h_xgboost_weighted.joblib`.
- Preprocessing/model artifacts are created locally. Model files and patient data are not bundled with this source patch.

## Reported evaluation (provisional)

### Validation results

| Metric | Histogram Gradient Boosting | Weighted XGBoost |
|---|---:|---:|
| PR-AUC | 0.0535 | 0.0532 |
| ROC-AUC | 0.7853 | 0.7863 |
| Precision at 0.5 | 0.040 | 0.041 |
| Recall at 0.5 | 0.642 | 0.622 |
| F1 at 0.8 | 0.113 | 0.112 |
| Flagged rows at 0.8 | 5.05% | 4.42% |

On the validation set, at threshold 0.8, Histogram Gradient Boosting detected 165/440 positive-target windows (37.5%) and had 47.47 flagged negative-target hours per 1,000 negative-target hours. Weighted XGBoost detected 158/440 windows (35.9%) and had 41.59 flagged negative-target hours per 1,000 negative-target hours. The two models do not have a convincing overall winner from these metrics alone.

### Provisional test result for Histogram Gradient Boosting

The previously recorded test result for the corrected target at the *reporting threshold* 0.8 is PR-AUC 0.0766, ROC-AUC 0.8077, precision 0.0834, recall 0.3371, F1 0.1338, with 887 true-positive rows, 1,744 false-negative rows, and 9,744 false-positive rows among 199,073 hourly rows.

**The test result is provisional and must not be presented as a fully independent final evaluation.** The same test patients had been examined in an earlier iteration using a flawed target definition. XGBoost has no test result in this model card.

## Known limitations

- Source onset time is inferred from a shifted retrospective dataset label, not independently adjudicated clinical onset timestamps.
- Performance varies by score threshold; no threshold is a clinical cutoff.
- Precision is low and false-alert burden is substantial at thresholds that retain meaningful recall.
- Scores are uncalibrated; weighted XGBoost scores are especially not to be read as probabilities.
- The current hospital app collects far fewer than all 40 model features. Missingness and distribution shifts may make scores unreliable on app observations.
- Hourly row metrics do not equal patient-level clinical utility, episode-level lead-time benefit, or outcomes benefit.
- External, prospective, population-specific clinical validation and institutional/regulatory review would be required before any real-world clinical use.

## Safeguards in the inference service

- Requires a server-to-server API key for model information and prediction requests.
- Uses a fixed allowlist of schema feature names; rejects `patient_id`, `SepsisLabel`, unknown feature names, nonnumeric values, booleans, infinities, and all-missing requests.
- Checks model metadata and feature order against the corrected six-hour schema at startup.
- Returns a raw, uncalibrated research score plus feature-completeness information and limitations.
- Does not persist inputs, send inputs to analytics, or modify patient/queue/bed/allocation state.
- Intended to bind to loopback for local development. Do not expose directly to the public internet.

## Model selection decision

Keep Histogram Gradient Boosting as the default reference for the prototype's read-only research panel because it has marginally higher validation PR-AUC and detected slightly more target windows at threshold 0.8. Keep XGBoost as a challenger. This is a **software/research convenience choice**, not a declaration of clinical superiority. Both must remain isolated from operational decisions.
