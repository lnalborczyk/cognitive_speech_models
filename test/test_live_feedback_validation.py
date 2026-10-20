import csv
import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from validate_live_feedback import parse_seeds,validate_sweep,validate_pair_rows

class TestLiveValidation(unittest.TestCase):
    def test_valid_seeds(self):
        self.assertEqual(parse_seeds('17, 23,41'),[17,23,41])
    def test_invalid_seeds(self):
        for value in ('', '0', '100', '17,garbage'):
            with self.assertRaises(ValueError):parse_seeds(value)
    def test_zero_gain_delay_control(self):
        rows=[{'feedback':str(g),'delay':str(d),
               'trackingRms':str(.186 + (0 if g==0 else g*.001)+(0 if g==0 else d*.0000001)),
               'effort':str(77+(0 if g==0 else g*10))}
              for d in (40,100) for g in (0,.1,.2,.4)]
        self.assertEqual(validate_sweep(rows),{'trackingRms':0.0,'effort':0.0})
        rows[-4]['trackingRms']='0.187'
        with self.assertRaises(AssertionError):validate_sweep(rows)
    def test_preonset_negative_control(self):
        rows=[{'time_s':str(t),'shift_hz':'150',
               'delta_produced_F1_Hz':'0',
               'motor_divergence_RMS':'0' if t<.55 else '.005'}
              for t in (.1,.3,.54,.56,.8)]
        validate_pair_rows(rows,gain=.2,onset=.55)
        with self.assertRaises(AssertionError):validate_pair_rows(rows,gain=0,onset=.55)
        rows[0]['motor_divergence_RMS']='.001'
        with self.assertRaises(AssertionError):validate_pair_rows(rows,gain=.2,onset=.55)

if __name__=='__main__':unittest.main()
