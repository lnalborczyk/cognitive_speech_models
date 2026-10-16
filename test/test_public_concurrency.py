"""Public VTL handler single-flight contract."""
from pathlib import Path
import unittest
from server.app import Handler
class TestPublicConcurrency(unittest.TestCase):
    def test_single_flight_synthesis_lock(self):
        self.assertTrue(Handler.synth_lock.acquire(blocking=False))
        try:self.assertFalse(Handler.synth_lock.acquire(blocking=False))
        finally:Handler.synth_lock.release()
        self.assertTrue(Handler.synth_lock.acquire(blocking=False))
        Handler.synth_lock.release()
