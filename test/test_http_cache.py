"""Regression: prevent old UI/cache after replacing a downloaded ZIP."""
import http.client
from http.server import HTTPServer
from threading import Thread
import unittest
from server.app import Handler, APP_VERSION


class TestFrontendFreshness(unittest.TestCase):
    def test_static_files_ignore_old_browser_modified_since(self):
        server = HTTPServer(('127.0.0.1', 0), Handler)
        worker = Thread(target=server.serve_forever, daemon=True)
        worker.start()
        try:
            conn = http.client.HTTPConnection('127.0.0.1', server.server_port)
            try:
                # Future date would cause standard SimpleHTTPRequestHandler
                # to reply 304 and keep old v0.5 HTML in the browser.
                headers = {'If-Modified-Since': 'Thu, 31 Dec 2099 23:59:59 GMT'}
                for path in ('/', '/src/app.js'):
                    conn.request('GET', path, headers=headers)
                    result = conn.getresponse()
                    payload = result.read().decode('utf-8')
                    self.assertEqual(result.status, 200, path)
                    self.assertIn('no-store', result.getheader('Cache-Control'))
                    self.assertNotIn('src/body/preview', payload)
                    if path == '/':
                        self.assertIn(APP_VERSION, payload)
                        self.assertIn('src/app.js?release=' + APP_VERSION, payload)
            finally:
                conn.close()
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
