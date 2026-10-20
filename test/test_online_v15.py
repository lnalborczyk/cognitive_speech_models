"""Tests the machine-readable results of the online v1.5 model experiments."""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from validate_v15_online import validate_authority, validate_balance

class TestOnlineV15(unittest.TestCase):
    def test_local_f1_authority_handles_missing_i_without_invention(self):
        rows = [{'vowel':v, 'F1_Hz':'680' if v=='a' else '',
                 'parameter':p, 'slope_Hz_per_normalized_unit': '55' if v=='a' else ''}
                for v in ('a','i','u') for p in ('JA','TCX','TCY','LD')]
        result = validate_authority(rows)
        self.assertEqual(result['valid_slopes_per_vowel']['a'],4)
        self.assertEqual(result['valid_slopes_per_vowel']['i'],0)

    def test_balanced_grid_and_zero_gain_control(self):
        for shift in (150,-150):
            rows=[{'feedforwardScale':str(s),'feedback':str(g),'shiftHz':str(shift),
                   'compensationHz': '0' if g==0 else '2.5',
                   'validSamples':'30', 'trackingRms':'0.185', 'motorEffort':'70'}
                  for s in (0.5,0.75,1.0) for g in (0,0.2)]
            self.assertTrue(validate_balance(rows,shift)['negative_controls_passed'])
            rows[0]['compensationHz']='1'
            with self.assertRaisesRegex(AssertionError,'Zero-gain'):
                validate_balance(rows,shift)

    def test_unresolved_compensation_is_recorded_not_set_to_zero(self):
        rows=[{'feedforwardScale':str(s),'feedback':str(g),'shiftHz':'150',
               'compensationHz':'', 'validSamples':'0',
               'trackingRms':'0.185', 'motorEffort':'70'}
              for s in (0.5,0.75,1.0) for g in (0,0.2)]
        self.assertEqual(validate_balance(rows,150)['unresolved_conditions'],6)

if __name__ == '__main__': unittest.main()
