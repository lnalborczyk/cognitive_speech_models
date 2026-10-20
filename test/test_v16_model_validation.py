"""Non-acoustic regression checks for the v1.6 real-browser experiment runner."""
from __future__ import annotations
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('validate_v16_models',ROOT/'scripts'/'validate_v16_models.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class V16ExperimentTests(unittest.TestCase):
    def test_version_is_strict_and_fails_old_public_site(self):
        self.assertEqual(mod.validate_version('1.6.0 · cognitive_speech_models'),(1,6,0))
        self.assertEqual(mod.validate_version('1.6.1 · cognitive_speech_models'),(1,6,1))
        with self.assertRaisesRegex(RuntimeError,'Deploy the v1.6 update'):
            mod.validate_version('1.5.0 · browser-only VTL')

    def test_expected_stop_and_real_reference_site(self):
        x={'closures':[{'phone':'p','sitePosition':.9,'referenceArea_cm2':.03,
                         'minimumArea_cm2':.2,'verified':False}],
           'geometrySamples':120}
        r=mod.validate_closure(x,'apa')
        self.assertFalse(r['verified'])  # Scientific failure must be reported, not hidden.
        with self.assertRaises(AssertionError):
            mod.validate_closure(x,'ata')
        with self.assertRaises(AssertionError):
            mod.validate_closure({**x,'geometrySamples':1},'apa')

    def test_zero_auditory_gain_is_a_hard_invariant(self):
        mod.validate_dynamics_zero_gain([{'maxMotorDifference':0},{'maxMotorDifference':1e-9}])
        with self.assertRaises(AssertionError):
            mod.validate_dynamics_zero_gain([{'maxMotorDifference':.02}])
        with self.assertRaises(AssertionError):
            mod.validate_dynamics_zero_gain([{'maxMotorDifference':None}])

    def test_no_preonset_perturbation_articulatory_response(self):
        x={'onset_s':.45,'trackingRms':.1,'timeseries':[
            {'time_s':0,'motor_difference':0,'delta_F1_Hz':None,'observer_update':True},
            {'time_s':.2,'motor_difference':0,'delta_F1_Hz':0,'observer_update':True},
            {'time_s':.5,'motor_difference':.02,'delta_F1_Hz':-2,'observer_update':True},
        ]}
        self.assertEqual(mod.validate_pair(x)['valid_observer_samples'],2)
        with self.assertRaises(AssertionError):
            mod.validate_pair({**x,'timeseries':[{**x['timeseries'][0],
                                                'motor_difference':.001},*x['timeseries'][1:]]})

    def test_python_experiment_script_uses_real_worker_interfaces(self):
        text=(ROOT/'scripts'/'validate_v16_models.py').read_text()
        for needle in ('client.simulate(\'td\'', 'client.simulateOnly(\'diva\'',
                       '__csmResearchClient.trainDiva(', 'client.practiceDiva(', 'validate_version(',
                       'diagnosticGeometry'):
            self.assertIn(needle,text)
        source=(ROOT/'src'/'app.js').read_text()
        self.assertIn('export function getResearchEngineForValidation()',source)


if __name__=='__main__':
    unittest.main()
