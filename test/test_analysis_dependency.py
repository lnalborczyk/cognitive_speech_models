"""Regression tests for the live-feedback validator's CSV analysis dependency.

The GitHub Pages workflow imports validate_live_feedback.py during Python test
collection. The analysis module must therefore be committed to the repository.
"""
from __future__ import annotations

import csv
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from analyze_perturbation import analyze, finite
from validate_live_feedback import validate_pair_rows


class TestAnalysisDependency(unittest.TestCase):
    def test_validator_cli_imports_in_subprocess(self):
        """Catch missing script dependencies before launching a VTL browser."""
        proc = subprocess.run(
            [sys.executable, str(SCRIPTS / "validate_live_feedback.py"), "--help"],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("--artifacts", proc.stdout)

    def test_analyzer_cli_imports_in_subprocess(self):
        proc = subprocess.run(
            [sys.executable, str(SCRIPTS / "analyze_perturbation.py"), "--help"],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn("--output", proc.stdout)

    def test_analyze_pair_on_synthetic_csv(self):
        with tempfile.TemporaryDirectory() as dirname:
            path = Path(dirname) / "paired.csv"
            fields = ["time_s", "observer_update", "shift_hz", "onset_s",
                      "delta_produced_F1_Hz", "motor_divergence_RMS", "phrase",
                      "phone", "feedback_gain", "delay_ms", "seed", "model",
                      "baseline_error_Hz"]
            with path.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                for t in (0.2, 0.4, 0.56, 0.76, 0.80, 0.84):
                    delta = -30 if t >= 0.76 else 0
                    writer.writerow({
                        "time_s": t, "observer_update": 1,
                        "shift_hz": 150, "onset_s": 0.55,
                        "delta_produced_F1_Hz": delta,
                        "motor_divergence_RMS": 0 if t < 0.55 else 0.01,
                        "phrase": "aia", "phone": "i",
                        "feedback_gain": 0.2, "delay_ms": 40,
                        "seed": 17, "model": "diva", "baseline_error_Hz": 0,
                    })
            summary, rows = analyze(path)
            self.assertEqual(summary["n_late_observer_samples"], 3)
            self.assertAlmostEqual(summary["late_delta_produced_f1_hz"], -30)
            self.assertAlmostEqual(summary["late_compensation_fraction"], 0.2)
            self.assertEqual(summary["interpretation"], "opposite-direction response")
            controls = validate_pair_rows(rows, gain=0.2, onset=0.55)
            self.assertAlmostEqual(controls["pre_onset_max_motor_divergence"], 0)
            self.assertIsNone(finite("unresolved"))


if __name__ == "__main__":
    unittest.main()
