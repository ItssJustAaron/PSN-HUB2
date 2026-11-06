"""Exercise the real portable native server against disposable directories only."""
import hashlib
import http.client
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from urllib.parse import urlencode

BINARY = str(Path(sys.argv.pop(1)).resolve())

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

class ServerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='psnhub-test-')
        self.root = Path(self.temp.name)
        self.port = free_port()
        self.loader_port = free_port()
        self.log = (self.root / 'server.log').open('ab')
        self.start()

    def start(self, crash=False):
        env = os.environ.copy()
        if crash:
            env['HUB_TEST_CRASH_AFTER_RENAME'] = '1'
        self.process = subprocess.Popen([BINARY, str(self.root), str(self.port), str(self.loader_port)], env=env, stdout=self.log, stderr=self.log)
        for _ in range(100):
            if self.process.poll() is not None:
                self.fail((self.root / 'server.log').read_text())
            try:
                if self.request('/api/status')[0] == 200:
                    return
            except (OSError, http.client.HTTPException):
                pass
            time.sleep(.03)
        self.fail('Server did not start')

    def stop(self):
        if self.process.poll() is None:
            self.process.terminate()
        self.process.wait(timeout=5)

    def tearDown(self):
        self.stop()
        self.log.close()
        logs = (self.root / 'server.log').read_text()
        self.assertNotIn('ERROR: AddressSanitizer', logs)
        self.assertNotIn('runtime error:', logs)
        self.temp.cleanup()

    def request(self, path, method='GET', body=None, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        request_headers = {'X-PSNHUB-Request':'1'} if method != 'GET' else {}
        if headers:
            request_headers.update(headers)
        try:
            connection.request(method, path, body=body, headers=request_headers)
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def api(self, path, method='GET', body=None):
        status, data = self.request(path, method, body)
        self.assertEqual(status, 200, data)
        return json.loads(data)

    def upload(self, data, destination='etahen', target='json/CUSA00001_01.00.json'):
        return self.api('/api/cheat-upload?'+urlencode({'destination':destination,'path':target}), 'POST', data)

    def test_status_and_dashboard(self):
        status = self.api('/api/status')
        self.assertTrue(status['experimental'])
        self.assertEqual(status['capabilities']['destinations'], ['etahen','onionhen'])
        code, body = self.request('/')
        self.assertEqual(code, 200)
        self.assertIn(b'PSN-HUB MANAGER', body)

    def test_sha256_vectors_and_destinations(self):
        for index, data in enumerate([b'', b'abc', b'a'*55, b'a'*56, b'a'*64, bytes(range(256))*4096]):
            directory = self.root/'etaHEN'/'cheats'/'json'
            directory.mkdir(exist_ok=True)
            (directory/f'vector{index}.json').write_bytes(data)
        items = self.api('/api/cheats?destination=etahen')['items']
        for item in items:
            data = (self.root/'etaHEN'/'cheats'/item['path']).read_bytes()
            self.assertEqual(item['sha256'], hashlib.sha256(data).hexdigest())
            self.assertEqual(item['size'], len(data))
        self.upload(b'onion\x00binary', 'onionhen')
        self.assertEqual(len(self.api('/api/cheats?destination=onionhen')['items']), 1)
        self.assertEqual(len(self.api('/api/cheats?destination=etahen')['items']), 6)

    def test_reject_paths_and_unknown_destinations(self):
        for target in ['../outside.json','json/../../outside.json','json/.hidden.json','json/nested/file.json','json/file.shn','json/file.json%00','json/quote".json']:
            code, _ = self.request('/api/cheat-upload?'+urlencode({'path':target}),'POST',b'test')
            self.assertEqual(code, 400, target)
        for query in ['destination=unknown','destination=etahen&destination=onionhen','destination=%ZZ']:
            self.assertEqual(self.request('/api/cheats?'+query)[0],400)
        self.assertFalse((self.root/'outside.json').exists())

    def test_mutation_headers_and_origins(self):
        target = '/api/cheat-upload?path=json/test.json'
        self.assertEqual(self.request(target,'POST',b'bad',{'X-PSNHUB-Request':'0'})[0],403)
        self.assertEqual(self.request(target,'POST',b'bad',{'Origin':'https://attacker.example'})[0],403)
        self.assertEqual(self.request(target,'POST',b'bad',{'Sec-Fetch-Site':'cross-site'})[0],403)
        self.assertEqual(self.request(target,'POST',b'ok',{'Origin':f'http://127.0.0.1:{self.port}'})[0],200)

    def test_interrupted_upload_keeps_original(self):
        self.upload(b'original')
        with socket.create_connection(('127.0.0.1',self.port),timeout=5) as sock:
            sock.sendall(b'POST /api/cheat-upload?path=json/CUSA00001_01.00.json HTTP/1.1\r\nHost: local\r\nX-PSNHUB-Request: 1\r\nContent-Length: 100000\r\n\r\npartial')
            sock.shutdown(socket.SHUT_WR)
            self.assertIn(b'500', sock.recv(2048))
        self.assertEqual((self.root/'etaHEN/cheats/json/CUSA00001_01.00.json').read_bytes(),b'original')
        self.assertFalse(list((self.root/'etaHEN/cheats/json').glob('.upload-*')))

    def test_crashed_upload_cleanup(self):
        self.upload(b'original')
        with socket.create_connection(('127.0.0.1',self.port),timeout=5) as sock:
            sock.sendall(b'POST /api/cheat-upload?path=json/CUSA00001_01.00.json HTTP/1.1\r\nHost: local\r\nX-PSNHUB-Request: 1\r\nContent-Length: 100000\r\n\r\npartial')
            directory=self.root/'etaHEN/cheats/json'
            for _ in range(100):
                if list(directory.glob('.upload-*')): break
                time.sleep(.01)
            self.assertTrue(list(directory.glob('.upload-*')))
            self.stop()
        self.start()
        self.assertFalse(list(directory.glob('.upload-*')))
        self.assertEqual((directory/'CUSA00001_01.00.json').read_bytes(),b'original')
        self.api('/api/cheats/backup?destination=etahen','POST')

    def test_symlinks_do_not_escape(self):
        outside = self.root/'outside'
        outside.mkdir()
        victim = outside/'victim.json'
        victim.write_bytes(b'private')
        directory = self.root/'etaHEN/cheats/json'
        directory.symlink_to(outside, target_is_directory=True)
        self.assertEqual(self.request('/api/cheat-upload?path=json/victim.json','POST',b'bad')[0],500)
        self.assertEqual(victim.read_bytes(),b'private')
        directory.unlink()
        directory.mkdir()
        (directory/'link.json').symlink_to(victim)
        self.assertEqual(self.request('/api/cheats?destination=etahen')[0],500)
        self.assertEqual(self.request('/api/cheats/backup?destination=etahen','POST')[0],500)
        self.assertEqual(victim.read_bytes(),b'private')

    def test_backup_durable_restore_and_isolation(self):
        self.upload(b'original')
        self.upload(b'other','onionhen')
        (self.root/'etaHEN/cheats/notes.txt').write_bytes(b'personal notes')
        backup = self.api('/api/cheats/backup?destination=etahen','POST')
        self.upload(b'changed')
        self.upload(b'new', target='shn/new.shn')
        self.stop()
        self.start()
        ids = self.api('/api/cheats/backups?destination=etahen')['backups']
        self.assertIn(backup['id'], [item['id'] for item in ids])
        self.assertEqual(self.request('/api/cheats/restore?'+urlencode({'destination':'onionhen','id':backup['id']}),'POST')[0],500)
        self.api('/api/cheats/restore?'+urlencode(backup),'POST')
        self.assertEqual((self.root/'etaHEN/cheats/json/CUSA00001_01.00.json').read_bytes(),b'original')
        self.assertFalse((self.root/'etaHEN/cheats/shn/new.shn').exists())
        self.assertEqual((self.root/'etaHEN/cheats/notes.txt').read_bytes(),b'personal notes')
        self.assertEqual((self.root/'OnionHEN/cheats/json/CUSA00001_01.00.json').read_bytes(),b'other')

    def test_restore_crash_recovery(self):
        self.upload(b'snapshot')
        backup = self.api('/api/cheats/backup?destination=etahen','POST')
        self.upload(b'newer')
        self.stop()
        self.start(crash=True)
        with self.assertRaises((http.client.HTTPException,OSError)):
            self.request('/api/cheats/restore?'+urlencode(backup),'POST')
        self.process.wait(timeout=5)
        self.assertEqual(self.process.returncode,90)
        self.start()
        self.assertEqual((self.root/'etaHEN/cheats/json/CUSA00001_01.00.json').read_bytes(),b'snapshot')
        self.assertFalse((self.root/'etaHEN/.psnhub-old').exists())
        self.assertFalse((self.root/'etaHEN/.psnhub-new').exists())

    def test_invalid_restore_keeps_current_files(self):
        self.upload(b'original')
        backup = self.api('/api/cheats/backup?destination=etahen','POST')
        snapshot = self.root/'backups/etahen'/backup['id']
        (snapshot/'bad-link').symlink_to(self.root/'payloads')
        self.upload(b'current')
        self.assertEqual(self.request('/api/cheats/restore?'+urlencode(backup),'POST')[0],500)
        self.assertEqual((self.root/'etaHEN/cheats/json/CUSA00001_01.00.json').read_bytes(),b'current')

    def test_payloads_and_categories(self):
        data = b'\x7fELF\x00test payload'
        self.api('/api/upload?name=test.elf','PUT',data)
        self.assertEqual(self.api('/api/list')['items'],[{'name':'test.elf','size':len(data)}])
        params = urlencode({'category':'Test sequence','delay':'0','payloads':'test.elf'})
        self.api('/api/category/save?'+params,'POST')
        self.assertEqual(self.api('/api/categories')['categories'][0]['payloads'],['test.elf'])
        received=[]
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',self.loader_port))
            listener.listen()
            listener.settimeout(5)
            def receive():
                with listener.accept()[0] as connection:
                    chunks=[]
                    while True:
                        part=connection.recv(32768)
                        if not part: break
                        chunks.append(part)
                    received.append(b''.join(chunks))
            worker=threading.Thread(target=receive)
            worker.start()
            self.api('/api/category/run?category=Test+sequence','POST')
            worker.join(timeout=5)
        self.assertEqual(received,[data])
        self.api('/api/category/delete?category=Test+sequence','POST')
        self.api('/api/delete?name=test.elf','POST')
        self.assertEqual(self.api('/api/list')['items'],[])

    def test_http_ambiguity_rejected(self):
        for headers, expected in [
            (b'Content-Length: 1\r\nContent-Length: 2\r\n',400),
            (b'Content-Length: 1\r\nTransfer-Encoding: chunked\r\n',400),
            (b'Content-Length: 999999999\r\n',413),
            (b'Content-Length: -1\r\n',400),
        ]:
            with socket.create_connection(('127.0.0.1',self.port),timeout=5) as sock:
                sock.sendall(b'POST /api/upload?name=test.elf HTTP/1.1\r\nHost: local\r\nX-PSNHUB-Request: 1\r\n'+headers+b'\r\nx')
                sock.shutdown(socket.SHUT_WR)
                self.assertIn(str(expected).encode(),sock.recv(2048))

if __name__ == '__main__':
    unittest.main(verbosity=2)
