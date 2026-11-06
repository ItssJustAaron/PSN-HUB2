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
        if getattr(self, 'auto_seconds', None):
            env['HUB_TEST_AUTO_SECONDS'] = str(self.auto_seconds)
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
        self.assertTrue(status['capabilities']['unified'])
        self.assertEqual(status['capabilities']['destinations'], ['etahen','onionhen'])
        code, body = self.request('/')
        self.assertEqual(code, 200)
        self.assertIn(b'PSN-HUB MANAGER', body)
        self.assertIn(b'/data/psn-hub/payloads', body)

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

    def save_fixture(self, platform='ps5'):
        folder = 'savedata_prospero' if platform == 'ps5' else 'savedata'
        title = 'PPSA00001' if platform == 'ps5' else 'CUSA00001'
        path = self.root / 'home' / '00000001' / folder / title
        path.mkdir(parents=True)
        (path / 'sdimg_slot').write_bytes(b'raw encrypted image' * 100)
        (path / 'slot.bin').write_bytes(b'companion key')
        return path, urlencode({'user':'00000001','platform':platform,'title':title})

    def test_raw_saves_and_verified_snapshots(self):
        for platform in ['ps5', 'ps4']:
            path, query = self.save_fixture(platform)
            self.assertTrue(self.api('/api/status')['capabilities']['saveRead'])
            listing = self.api('/api/saves')['items']
            self.assertTrue(any(item['platform'] == platform for item in listing))
            files = self.api('/api/saves/files?'+query)['items']
            self.assertEqual({item['name'] for item in files}, {'sdimg_slot','slot.bin'})
            original = {p.name:p.read_bytes() for p in path.iterdir()}
            result = self.api('/api/saves/backup?'+query, 'POST')
            snapshot_query = urlencode({'id':result['id']})
            self.assertEqual(len(self.api('/api/saves/files?'+snapshot_query)['items']), 2)
            for name, data in original.items():
                self.assertEqual(self.request('/api/saves/download?'+snapshot_query+'&'+urlencode({'name':name})), (200,data))
            (path / 'sdimg_slot').write_bytes(b'new live data')
            self.assertEqual(self.request('/api/saves/download?'+snapshot_query+'&name=sdimg_slot'), (200, original['sdimg_slot']))
            self.assertTrue(any(item['id']==result['id'] for item in self.api('/api/saves/backups')['items']))

    def test_save_paths_symlinks_and_incomplete_backups(self):
        path, query = self.save_fixture()
        outside = self.root / 'private'; outside.write_bytes(b'private')
        for name in ['../private','/etc/passwd','a/b','..','bad"name']:
            self.assertEqual(self.request('/api/saves/download?'+query+'&'+urlencode({'name':name}))[0],400)
        (path / 'escape').symlink_to(outside)
        self.assertEqual(self.request('/api/saves/download?'+query+'&name=escape')[0],400)
        self.assertEqual(self.request('/api/saves/backup?'+query,'POST')[0],500)
        self.assertEqual(self.api('/api/saves/backups')['items'],[])
        self.assertEqual(outside.read_bytes(),b'private')
        (path / 'escape').unlink()
        (path / 'nested').mkdir()
        self.assertEqual(self.request('/api/saves/backup?'+query,'POST')[0],500)
        self.assertEqual(self.api('/api/saves/backups')['items'],[])
        self.assertEqual(self.request('/api/saves/restore?'+query,'POST')[0],404)
        self.assertEqual(self.request('/api/saves/backup?'+urlencode({'id':'save-any'}),'POST')[0],400)
        self.assertEqual(self.request('/api/saves/files?'+urlencode({'user':'../bad','platform':'ps5','title':'PPSA00001'}))[0],400)
        self.assertEqual(self.request('/api/saves/backup?'+query,'POST',headers={'X-PSNHUB-Request':'0'})[0],403)

    def test_unified_status_and_embedded_engine(self):
        status=self.api('/api/status');self.assertEqual(status['layout'],'PSNHUB_UNIFIED_V1')
        for name in ['saveRead','saveUSB','artwork','saveEngine','unified']:
            self.assertTrue(status['capabilities'][name])
        received=[]
        with socket.socket() as listener:
            listener.bind(('127.0.0.1',self.loader_port));listener.listen();listener.settimeout(5)
            def receive():
                with listener.accept()[0] as client:
                    data=bytearray()
                    while True:
                        chunk=client.recv(65536)
                        if not chunk:break
                        data.extend(chunk)
                    received.append(hashlib.sha256(data).hexdigest())
            worker=threading.Thread(target=receive);worker.start()
            self.assertTrue(self.api('/api/save-engine/start','POST')['embedded']);worker.join(timeout=5)
        self.assertEqual(received,['4fe4bada2e11075a3dcece3230d0184e5d81865c38668898254c5ae6d0a3fdeb'])
        self.api('/api/upload?name=PSN-HUB-Save-Service.elf','PUT',b'old helper')
        self.assertFalse(any(x['name']=='PSN-HUB-Save-Service.elf' for x in self.api('/api/list')['items']))
        self.assertFalse(self.api('/api/artwork?action=background-apply','POST')['success'])
        self.assertFalse(self.api('/api/artwork?action=store-restore','POST')['success'])
        self.assertEqual(self.request('/api/artwork?action=anything','POST')[0],400)
        self.assertEqual(self.request('/api/artwork?action=icons','POST',headers={'X-PSNHUB-Request':'0'})[0],403)

    def test_legacy_categories_settings_and_snapshots_are_preserved(self):
        legacy=self.root/'autoload-categories.txt';text='Daily Use|250|first.elf,second.elf\n';legacy.write_text(text)
        old=self.root/'legacy-save-service';old.mkdir();(old/'save-usb.conf').write_text('0 usb2 60\n')
        snapshot=old/'save-backups'/'save-old-test';snapshot.mkdir(parents=True);(snapshot/'slot.bin').write_bytes(b'old snapshot')
        self.stop();self.start()
        category=self.api('/api/categories')['categories'][0];self.assertEqual(category,{'name':'Daily Use','delayMs':250,'payloads':['first.elf','second.elf']})
        self.assertEqual(legacy.read_text(),text)
        self.assertEqual(self.api('/api/saves/usb')['minutes'],60)
        self.assertEqual(self.request('/api/saves/download?id=save-old-test&name=slot.bin'),(200,b'old snapshot'))
        self.assertTrue(any(x['id']=='save-old-test' for x in self.api('/api/saves/backups')['items']))
        self.api('/api/category/save?'+urlencode({'category':'Daily Use','delay':0,'payloads':'mine.elf'}),'POST')
        self.api('/api/saves/usb/config?enabled=0&usb=usb1&minutes=30','POST')
        self.stop();self.start()
        self.assertEqual(self.api('/api/categories')['categories'][0]['payloads'],['mine.elf'])
        self.assertEqual(self.api('/api/saves/usb')['usb'],'usb1')

    def test_usb_export_all_and_unchanged_detection(self):
        path, query = self.save_fixture()
        usb = self.root / 'usb' / 'usb0'; usb.mkdir()
        self.assertEqual(self.api('/api/saves/usb')['volumes'], ['usb0'])
        result = self.api('/api/saves/usb/export?usb=usb0&'+query, 'POST')
        saved = usb / result['path'].split('/mnt/usb0/')[1]
        self.assertEqual((saved/'sdimg_slot').read_bytes(), (path/'sdimg_slot').read_bytes())
        self.assertEqual(self.api('/api/saves/usb/all?usb=usb0','POST')['unchanged'], 1)
        (path/'sdimg_slot').write_bytes(b'changed save')
        self.assertEqual(self.api('/api/saves/usb/all?usb=usb0','POST')['exported'], 1)
        self.assertEqual(len(list(saved.parent.glob('save-*'))), 2)
        self.assertEqual(self.request('/api/saves/usb/export?usb=../bad&'+query,'POST')[0],500)
        self.assertEqual(self.request('/api/saves/usb/export?usb=usb1&'+query,'POST')[0],500)
        self.assertFalse((self.root/'usb'/'usb1').exists())

    def test_usb_symlink_and_incomplete_snapshot_rejected(self):
        path, query = self.save_fixture()
        outside=self.root/'outside';outside.mkdir()
        (self.root/'usb'/'usb0').symlink_to(outside)
        self.assertEqual(self.request('/api/saves/usb/export?usb=usb0&'+query,'POST')[0],500)
        (self.root/'usb'/'usb0').unlink();(self.root/'usb'/'usb0').mkdir()
        (path/'nested').mkdir()
        self.assertEqual(self.request('/api/saves/usb/export?usb=usb0&'+query,'POST')[0],500)
        self.assertEqual(list((self.root/'usb').rglob('save-*')), [])
        self.assertEqual(list(outside.iterdir()), [])

    def test_usb_auto_settings_persist_and_timer_runs(self):
        path, query = self.save_fixture();usb=self.root/'usb'/'usb0';usb.mkdir()
        self.assertFalse(self.api('/api/saves/usb')['enabled'])
        self.assertEqual(self.request('/api/saves/usb/config?enabled=1&usb=usb0&minutes=1','POST')[0],400)
        self.api('/api/saves/usb/config?enabled=1&usb=usb0&minutes=15','POST')
        self.process.terminate();self.process.wait(timeout=5);self.auto_seconds=1;self.start()
        self.assertTrue(self.api('/api/saves/usb')['enabled'])
        for _ in range(80):
            if list(usb.rglob('save-*')):break
            time.sleep(.05)
        copies=list(usb.rglob('save-*'));self.assertEqual(len(copies),1)
        self.assertEqual((copies[0]/'sdimg_slot').read_bytes(),(path/'sdimg_slot').read_bytes())
        self.api('/api/saves/usb/config?enabled=0&usb=usb0&minutes=15','POST')
        self.assertFalse(self.api('/api/saves/usb')['enabled'])

if __name__ == '__main__':
    unittest.main(verbosity=2)
