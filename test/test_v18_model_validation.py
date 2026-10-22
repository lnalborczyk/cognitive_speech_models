"""Regression checks for v1.8 automated browser validation contracts."""
import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from validate_v18_models import check_static_references, check_washout

class TestModelValidation(unittest.TestCase):
    def test_static_references_require_all_stops(self):
        good=[dict(phone=p,status='measured',referenceAchievesClosure=True,
          referenceArea_cm2=.01,vowelArea_cm2=.6,initialGradientNorm_cm2=1.0) for p in 'ptk']
        self.assertEqual(len(check_static_references(good)),3)
        with self.assertRaises(AssertionError):check_static_references(good[:2])
    def test_scientific_failure_does_not_fail_software_gate(self):
        bad_physics=[dict(phone=p,status='measured',referenceAchievesClosure=False,
          referenceArea_cm2=.1,vowelArea_cm2=.2,initialGradientNorm_cm2=0) for p in 'ptk']
        self.assertEqual(len(check_static_references(bad_physics)),3)
    def test_washout_requires_explicit_error_rule_and_no_forgetting(self):
        rows=[dict(phase='baseline',learningStatus='baseline')]+[
          dict(phase='exposure',learningStatus='updated'),
          dict(phase='washout',learningStatus='unresolved_F1')]
        data=dict(records=rows,learningMechanism='acoustic error to matched unperturbed baseline',
          washoutRetention=1)
        self.assertEqual(len(check_washout(data,1,1)),3)
        with self.assertRaises(AssertionError):check_washout({**data,'washoutRetention':.9},1,1)
        with self.assertRaises(AssertionError):check_washout({**data,'learningMechanism':'old'},1,1)
if __name__=='__main__':unittest.main()
