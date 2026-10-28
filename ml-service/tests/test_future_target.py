from __future__ import annotations
import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from bedallocation_ml.data import (
    patient_target_presence,
    read_patient_dataset,
    sepsis_onset_target,
)


class SepsisOnsetTargetTests(unittest.TestCase):
    def test_target_covers_six_rows_before_inferred_onset_only(self):
        # First source-positive row is index 2; source label is shifted 6 hours,
        # so inferred onset is index 8. Rows 2..7 forecast onset within 6 rows.
        labels = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1]
        target, n_keep = sepsis_onset_target(labels, horizon=6)
        self.assertEqual(n_keep, 8)
        np.testing.assert_array_equal(target, [0, 0, 1, 1, 1, 1, 1, 1])

    def test_post_onset_rows_are_not_used_as_negative_training_rows(self):
        labels = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        target, n_keep = sepsis_onset_target(labels, horizon=6)
        self.assertEqual(n_keep, 8)
        self.assertEqual(len(target), 8)

    def test_horizon_controls_pre_onset_positive_window(self):
        labels = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1]
        target, n_keep = sepsis_onset_target(labels, horizon=3)
        self.assertEqual(n_keep, 8)
        np.testing.assert_array_equal(target, [0, 0, 0, 0, 0, 1, 1, 1])

    def test_nonsepsis_patient_drops_incomplete_final_horizon(self):
        target, n_keep = sepsis_onset_target([0] * 8, horizon=3)
        self.assertEqual(n_keep, 5)
        np.testing.assert_array_equal(target, [0, 0, 0, 0, 0])

    def test_short_nonsepsis_patient_has_no_usable_rows(self):
        target, n_keep = sepsis_onset_target([0, 0, 0], horizon=3)
        self.assertEqual(n_keep, 0)
        self.assertEqual(target.size, 0)

    def test_source_labels_must_be_monotonic(self):
        with self.assertRaisesRegex(ValueError, "not a monotonic"):
            sepsis_onset_target([0, 1, 0, 1], horizon=2)

    def test_invalid_labels_fail_closed(self):
        with self.assertRaises(ValueError):
            sepsis_onset_target([0, 2, 1], horizon=1)
        with self.assertRaises(ValueError):
            sepsis_onset_target([0, np.nan, 1], horizon=1)

    def test_invalid_horizon_fails(self):
        with self.assertRaises(ValueError):
            sepsis_onset_target([0, 1], horizon=0)

    def test_patient_dataset_excludes_source_label_and_post_onset_rows(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / "raw"
            root.mkdir()
            patient_file = root / "p001.psv"
            pd.DataFrame({
                "HR": list(range(10)),
                "O2Sat": [98] * 10,
                "SepsisLabel": [0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
            }).to_csv(patient_file, sep="|", index=False)
            self.assertEqual(patient_target_presence(patient_file, horizon=6), 1)
            result = read_patient_dataset(patient_file, root, ["HR", "O2Sat"], horizon=6)
            self.assertNotIn("SepsisLabel", result.columns)
            self.assertEqual(len(result), 8)
            self.assertEqual(result["target_sepsis_onset_next_6h"].tolist(), [0, 0, 1, 1, 1, 1, 1, 1])
            self.assertEqual(result["HR"].tolist(), list(range(8)))


if __name__ == "__main__":
    unittest.main()
