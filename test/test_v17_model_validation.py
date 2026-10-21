import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from validate_v17_models import check_version, check_map_results, check_washout, summarize_closure

class Tests(unittest.TestCase):
    def test_version_gate(self):
        check_version('COGNITIVE SPEECH 1.7.0')
        with self.assertRaises(RuntimeError):
            check_version('COGNITIVE SPEECH 1.6.0')
    def test_heldout_formant_missing_is_allowed(self):
        rows=[{'phone':x,'attempted':24,'valid':0,
               'meanAbsErrorBeforeHz':None,'meanAbsErrorAfterHz':None,
               'improvedFraction':None} for x in 'aiu']
        self.assertEqual(check_map_results(rows),rows)
    def test_bad_heldout_rows_fail(self):
        with self.assertRaises(AssertionError):
            check_map_results([{'phone':'a','attempted':24,'valid':2}])
    def test_washout_phases(self):
        rows=[{'phase':'baseline','memoryRms':0}]+[{'phase':'exposure','memoryRms':1}]*2+[
            {'phase':'washout','memoryRms':.5}]*3
        self.assertEqual(len(check_washout(rows,2,3)),6)
    def test_bad_washout_count(self):
        with self.assertRaises(AssertionError):check_washout([{'phase':'baseline','memoryRms':0}],2,3)
    def test_vtl_reference_is_required_for_closure(self):
        example={'phrase':'apa','overlap':.65,'stopOmega':18,'stopPriority':8,
          'metrics':{'normalizedTrackingRMS':.1,'effortMean':5},'geometrySamples':40,
          'closures':[{'phone':'p','sitePosition':12,'referenceArea_cm2':.02,'status':'no_closure'}]}
        self.assertEqual(summarize_closure([example])[0]['status'],'no_closure')

if __name__=='__main__':unittest.main()
