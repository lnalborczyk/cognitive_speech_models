"""Regression tests for the GitHub Pages vowel-calibration smoke-test gate."""
import unittest
from scripts.check_browser_vtl import validate_vowel_calibration


def row(phone, formants, errors, status):
    return [phone, formants, errors, status]


GOOD_A = row('/a/', '682 / 1176 / 4493', '0.00 / 0.00 / 0.00', 'Repeatable')
PARTIAL_I = row('/i/', 'unresolved / 3173 / 4195', '— / 0.00 / 0.00', 'Incomplete (2/3)')
GOOD_U = row('/u/', '236 / 3277 / 4179', '0.00 / 0.00 / 0.00', 'Repeatable')


class TestVowelCalibrationGate(unittest.TestCase):
    def test_real_report_from_failed_action_now_passes_with_warning(self):
        self.assertEqual(validate_vowel_calibration([GOOD_A, PARTIAL_I, GOOD_U]),
                         ['/i/: Incomplete (2/3)'])

    def test_all_three_repeatable_passes(self):
        self.assertEqual(validate_vowel_calibration([
            GOOD_A, row('/i/', '280 / 2200 / 3200', '0.00 / 0.00 / 0.00', 'Repeatable'), GOOD_U]), [])

    def test_all_unresolved_fails(self):
        incomplete = lambda p: row(p, 'unresolved / unresolved / unresolved',
                                   '— / — / —', 'Incomplete (0/3)')
        with self.assertRaises(AssertionError):
            validate_vowel_calibration([incomplete('/a/'), incomplete('/i/'), incomplete('/u/')])

    def test_inconsistent_measurement_fails(self):
        with self.assertRaisesRegex(AssertionError, 'non-repeatable'):
            validate_vowel_calibration([GOOD_A, row('/i/', '300 / 3200 / 4100',
                                     '2.00 / 0.00 / 0.00', 'Inconsistent'), GOOD_U])

    def test_no_fully_repeatable_measurement_fails(self):
        partial_a = row('/a/', '680 / 1100 / unresolved', '0.00 / 0.00 / —', 'Incomplete (2/3)')
        partial_u = row('/u/', '240 / 800 / unresolved', '0.00 / 0.00 / —', 'Incomplete (2/3)')
        with self.assertRaisesRegex(AssertionError, 'No fully resolved'):
            validate_vowel_calibration([partial_a, PARTIAL_I, partial_u])

    def test_missing_vowel_fails(self):
        with self.assertRaisesRegex(AssertionError, 'Expected calibration rows'):
            validate_vowel_calibration([GOOD_A, GOOD_U])

    def test_misreported_repeatable_fails(self):
        with self.assertRaisesRegex(AssertionError, 'despite missing'):
            validate_vowel_calibration([GOOD_A, row('/i/', 'unresolved / 3173 / 4195',
                                               '— / 0.00 / 0.00', 'Repeatable'), GOOD_U])


if __name__ == '__main__':
    unittest.main()
