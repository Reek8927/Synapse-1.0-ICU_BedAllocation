from __future__ import annotations
import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from bedallocation_ml.evaluate_test import evaluate_test


class EvaluateTestSafetyTests(unittest.TestCase):
    def test_existing_report_prevents_repeat_test_evaluation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            data_dir = root / "processed"
            artifact_dir = root / "artifacts"
            data_dir.mkdir()
            artifact_dir.mkdir()
            schema = {
                "feature_columns": ["HR"],
                "target_column": "target_sepsis_onset_next_6h",
                "target_definition": "synthetic fixture",
                "source_label_shift_hours": 6,
            }
            (data_dir / "schema.json").write_text(json.dumps(schema), encoding="utf-8")
            model_name = "sepsis_onset_next_6h_hist_gradient_boosting.joblib"
            (artifact_dir / model_name).write_bytes(b"placeholder")
            report_path = artifact_dir / "sepsis_onset_next_6h_hist_gradient_boosting_test_evaluation.json"
            report_path.write_text("{}", encoding="utf-8")
            with self.assertRaisesRegex(FileExistsError, "Refusing to overwrite or repeat"):
                evaluate_test(data_dir, artifact_dir, "hist_gradient_boosting")


if __name__ == "__main__":
    unittest.main()
