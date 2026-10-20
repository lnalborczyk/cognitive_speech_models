import csv
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from analyze_perturbation import analyze

class HeldVowelAnalysisTest(unittest.TestCase):
    def test_timeline_reports_missing_f1_and_command_onset(self):
        fields=['time_s','phone','observer_update','shift_hz','onset_s',
                'delta_produced_F1_Hz','motor_divergence_RMS','phrase',
                'feedback_valid_F1','feedback_applied_shift_Hz','feedback_command_RMS',
                'feedback_status','delta_auditory_command_RMS']
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/'held.csv'
            with path.open('w',newline='') as f:
                w=csv.DictWriter(f,fieldnames=fields);w.writeheader()
                for i in range(41):
                    t=round(i*.04,3)
                    w.writerow({'time_s':t,'phone':'a','observer_update':1,
                       'shift_hz':150,'onset_s':.45,'phrase':'ahold',
                       'delta_produced_F1_Hz':-20 if t>=.72 else '',
                       'motor_divergence_RMS':.01 if t>=.68 else 0,
                       'feedback_valid_F1':'true' if t>=.6 else 'false',
                       'feedback_applied_shift_Hz':150 if t>=.52 else 0,
                       'feedback_command_RMS':2 if t>=.68 else 0,
                       'feedback_status':'available' if t>=.6 else 'f1_unresolved',
                       'delta_auditory_command_RMS':1 if t>=.68 else 0})
            summary,rows=analyze(path)
            self.assertEqual(len(rows),41)
            self.assertGreater(summary['n_late_observer_samples'],3)
            self.assertGreater(summary['late_compensation_hz'],0)
            self.assertGreater(summary['fraction_feedback_f1_valid'],0)
            self.assertAlmostEqual(summary['first_shift_at_feedback_s'],.52)
            self.assertAlmostEqual(summary['first_nonzero_auditory_command_s'],.68)
            self.assertAlmostEqual(summary['first_perturbation_changed_command_s'],.68)

if __name__=='__main__':unittest.main()
