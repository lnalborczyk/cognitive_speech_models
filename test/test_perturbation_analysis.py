import csv
import importlib.util
import math
import tempfile
import unittest
from pathlib import Path

SCRIPT=Path(__file__).parents[1]/'scripts'/'analyze_perturbation.py'
spec=importlib.util.spec_from_file_location('analyze_perturbation',SCRIPT)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class PerturbationAnalysisTests(unittest.TestCase):
    def test_compensation_metrics_count_unique_observer_samples(self):
        with tempfile.TemporaryDirectory() as tmp:
            f=Path(tmp)/'pair.csv'
            fields=['time_s','phone','observer_update','onset_s','shift_hz',
                    'baseline_F1_Hz','shifted_F1_Hz','target_F1_Hz',
                    'baseline_error_Hz','shifted_error_unperturbed_Hz',
                    'delta_produced_F1_Hz','compensation_Hz','motor_divergence_RMS',
                    'model','phrase','seed','feedback_gain','delay_ms']
            with f.open('w',newline='') as handle:
                writer=csv.DictWriter(handle,fieldnames=fields)
                writer.writeheader()
                for i in range(280):
                    t=i*.005
                    d=-30 if t>=.75 else 0
                    writer.writerow(dict(time_s=t, phone='a' if t<.48 or t>=.97 else 'i',
                        observer_update=int(i%8==0),onset_s=.55,shift_hz=150,
                        baseline_F1_Hz=350,shifted_F1_Hz=350+d,target_F1_Hz=350,
                        baseline_error_Hz=0,shifted_error_unperturbed_Hz=d,
                        delta_produced_F1_Hz=d,compensation_Hz=-d,
                        motor_divergence_RMS=0 if t<.70 else .1,
                        model='diva',phrase='aia',seed=17,feedback_gain=.2,delay_ms=40))
            row,_=module.analyze(f)
            self.assertAlmostEqual(row['late_delta_produced_f1_hz'],-30,places=10)
            self.assertAlmostEqual(row['late_compensation_fraction'],.2,places=10)
            self.assertEqual(row['pre_motor_divergence_rms'],0)
            self.assertGreaterEqual(row['n_late_observer_samples'],3)
            self.assertLess(row['n_late_observer_samples'],10)

if __name__=='__main__':unittest.main()
