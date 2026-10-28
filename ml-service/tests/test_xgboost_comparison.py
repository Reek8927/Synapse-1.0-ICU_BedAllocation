"""Fast synthetic tests for the validation-only XGBoost experiment."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from bedallocation_ml.compare_models_xgboost import compare_xgboost
from bedallocation_ml.train_baseline import evaluate_scores


class XGBoostComparisonTests(unittest.TestCase):
    def _write_split(self, path: Path, seed: int, rows: int, positive_rate: float) -> None:
        rng = np.random.default_rng(seed)
        f0 = rng.normal(size=rows)
        f1 = rng.normal(size=rows)
        logits = -2.7 + 0.9 * f0 + 0.7 * f1
        probability = 1 / (1 + np.exp(-logits))
        y = (rng.random(rows) < probability).astype(int)
        # Guarantee both classes in tiny synthetic splits.
        y[0], y[1] = 0, 1
        frame = pd.DataFrame({
            "f0": f0.astype("float32"),
            "f1": f1.astype("float32"),
            "target_sepsis_onset_next_6h": y.astype("int8"),
        })
        frame.to_csv(path, index=False)

    def test_validation_comparison_does_not_require_test_csv(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            data_dir = root / "processed_onset"
            artifact_dir = root / "artifacts_onset"
            data_dir.mkdir()
            artifact_dir.mkdir()

            schema = {
                "feature_columns": ["f0", "f1"],
                "target_column": "target_sepsis_onset_next_6h",
                "target_definition": "synthetic onset within next six rows",
                "horizon_hours": 6,
                "source_dataset": "synthetic-test-only",
            }
            (data_dir / "schema.json").write_text(json.dumps(schema), encoding="utf-8")
            self._write_split(data_dir / "train.csv", seed=7, rows=500, positive_rate=0.15)
            self._write_split(data_dir / "validation.csv", seed=8, rows=180, positive_rate=0.15)
            # Intentionally do not create test.csv.

            y = pd.read_csv(data_dir / "validation.csv")[schema["target_column"]]
            baseline_metrics = evaluate_scores(y, np.linspace(0.0, 1.0, len(y)))
            prior = {
                "target_column": schema["target_column"],
                "features": schema["feature_columns"],
                "target_definition": schema["target_definition"],
                "horizon_hours": 6,
                "models": {
                    "logistic_full_train": {"validation_metrics": baseline_metrics},
                    "hist_gradient_boosting": {"validation_metrics": baseline_metrics},
                },
                "test_split_used": False,
            }
            prior_path = artifact_dir / "sepsis_onset_model_comparison_validation.json"
            prior_path.write_text(json.dumps(prior), encoding="utf-8")

            result = compare_xgboost(
                data_dir=data_dir,
                artifact_dir=artifact_dir,
                random_state=3,
                n_estimators=12,
                early_stopping_rounds=3,
                n_jobs=1,
            )

            self.assertIn("xgboost_hist_weighted", result["models"])
            self.assertIn("hist_gradient_boosting", result["models"])
            self.assertIn("logistic_full_train", result["models"])
            self.assertFalse((data_dir / "test.csv").exists())
            self.assertTrue((artifact_dir / "sepsis_onset_next_6h_xgboost_weighted.joblib").exists())
            self.assertTrue((artifact_dir / "sepsis_onset_xgboost_model_comparison_validation.json").exists())
            # The original report must remain unchanged.
            prior_after = json.loads(prior_path.read_text(encoding="utf-8"))
            self.assertNotIn("xgboost_hist_weighted", prior_after["models"])

    def test_schema_rejects_source_label_feature(self) -> None:
        from bedallocation_ml.compare_models_xgboost import _validate_schema
        with self.assertRaises(ValueError):
            _validate_schema({
                "feature_columns": ["f0", "SepsisLabel"],
                "target_column": "target_sepsis_onset_next_6h",
            })


if __name__ == "__main__":
    unittest.main()
