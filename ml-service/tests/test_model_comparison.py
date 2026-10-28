from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from bedallocation_ml.compare_models import compare_models, evaluate_scores


class ModelComparisonTests(unittest.TestCase):
    def test_metrics_include_pr_auc_and_confusion_matrix(self):
        y = pd.Series([0, 0, 1, 1])
        scores = np.array([0.1, 0.4, 0.6, 0.9])
        metrics = evaluate_scores(y, scores, threshold=0.5)
        self.assertIn("average_precision_pr_auc", metrics)
        self.assertEqual(metrics["confusion_matrix_labels_0_then_1"], [[2, 0], [0, 2]])
        self.assertEqual(metrics["recall_at_threshold"], 1.0)

    def test_compare_uses_validation_and_does_not_require_test_csv(self):
        rng = np.random.default_rng(17)
        feature_columns = ["HR", "O2Sat", "Temp", "Resp"]
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            data_dir = root / "processed"
            artifact_dir = root / "artifacts"
            data_dir.mkdir()

            schema = {
                "feature_columns": feature_columns,
                "target_column": "target_sepsis_onset_next_6h",
                "target_definition": "synthetic test-only definition",
                "horizon_hours": 6,
                "source_dataset": "synthetic test fixture",
            }
            (data_dir / "schema.json").write_text(json.dumps(schema), encoding="utf-8")

            def make_frame(n: int, prefix: str) -> pd.DataFrame:
                values = rng.normal(size=(n, len(feature_columns))).astype("float32")
                logits = 1.2 * values[:, 0] - 0.8 * values[:, 1]
                probability = 1 / (1 + np.exp(-logits))
                y = rng.binomial(1, probability).astype("int8")
                # Ensure both classes exist for stable unit tests.
                y[:2] = [0, 1]
                frame = pd.DataFrame(values, columns=feature_columns)
                frame["patient_id"] = [f"{prefix}-{i // 3}" for i in range(n)]
                frame[schema["target_column"]] = y
                return frame

            make_frame(180, "train").to_csv(data_dir / "train.csv", index=False)
            make_frame(90, "validation").to_csv(data_dir / "validation.csv", index=False)
            # Intentionally no test.csv; comparison should never load it.

            result = compare_models(
                data_dir=data_dir,
                artifact_dir=artifact_dir,
                random_state=17,
                hgb_max_iter=8,
            )

            self.assertFalse((data_dir / "test.csv").exists())
            self.assertFalse(result["test_split_used"])
            self.assertEqual(set(result["models"]), {
                "logistic_full_train", "hist_gradient_boosting"
            })
            self.assertTrue((artifact_dir / "sepsis_onset_model_comparison_validation.json").exists())
            self.assertTrue((artifact_dir / "sepsis_onset_next_6h_logistic_full_train.joblib").exists())
            self.assertTrue((artifact_dir / "sepsis_onset_next_6h_hist_gradient_boosting.joblib").exists())
            for model_data in result["models"].values():
                self.assertGreaterEqual(
                    model_data["validation_metrics"]["average_precision_pr_auc"], 0.0
                )

    def test_model_features_reject_target_leakage(self):
        rng = np.random.default_rng(4)
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            data_dir = root / "processed"
            data_dir.mkdir()
            schema = {
                "feature_columns": ["HR", "target_sepsis_onset_next_6h"],
                "target_column": "target_sepsis_onset_next_6h",
                "target_definition": "test",
                "horizon_hours": 6,
            }
            (data_dir / "schema.json").write_text(json.dumps(schema), encoding="utf-8")
            # The check must reject this schema before attempting to read train.csv.
            with self.assertRaisesRegex(ValueError, "must not be model features"):
                compare_models(data_dir, root / "artifacts", hgb_max_iter=1)


if __name__ == "__main__":
    unittest.main()
