from __future__ import annotations

import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from bedallocation_ml.prepare_dataset import _split_patients


class PatientSplitTests(unittest.TestCase):
    def test_patient_ids_do_not_overlap_splits(self):
        frame = pd.DataFrame({
            "patient_id": [f"p{i:03}" for i in range(100)],
            "has_positive_target": [int(i % 10 == 0) for i in range(100)],
        })
        splits = _split_patients(frame, random_state=42)
        self.assertFalse(splits["train"] & splits["validation"])
        self.assertFalse(splits["train"] & splits["test"])
        self.assertFalse(splits["validation"] & splits["test"])
        self.assertEqual(len(set.union(*splits.values())), len(frame))


if __name__ == "__main__":
    unittest.main()
