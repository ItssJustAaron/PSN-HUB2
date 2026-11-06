"""Read-only inspector integration tests using disposable SQLite fixtures."""
import hashlib
import http.client
import json
from pathlib import Path
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
BINARY=str(Path(sys.argv.pop(1)).resolve())
class InspectorTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='psnhub-inspect-')
        self.root=Path(self.temp.name)
        with sqlite3.connect(self.root/'app.db') as db:
            db.executescript('CREATE TABLE tbl_contentinfo(titleId TEXT,titleName TEXT,localConceptId TEXT,AppInfoJson TEXT); CREATE TABLE tbl_iconinfo_1234(titleId TEXT,titleName TEXT,deeplinkUri TEXT);')
            db.execute('INSERT INTO tbl_contentinfo VALUES(?,?,?,?)',('NPXS49999','PlayStation Store','cid:store',json.dumps({'TITLE':'Store','DEEPLINK_URI':'original'})))
            db.execute('INSERT INTO tbl_contentinfo VALUES(?,?,?,?)',('PPSA00001','Unrelated game','cid:game','{}'))
            db.execute('INSERT INTO tbl_iconinfo_1234 VALUES(?,?,?)',('NPXS49999','Store','original'))
        with sqlite3.connect(self.root/'appinfo.db') as db:
            db.execute('CREATE TABLE tbl_appinfo(titleId TEXT,key TEXT,val TEXT)')
            db.execute('INSERT INTO tbl_appinfo VALUES(?,?,?)',('NPXS49999','TITLE','PlayStation Store'))
        self.before=self.hashes()
        with socket.socket() as s:s.bind(('127.0.0.1',0));self.port=s.getsockname()[1]
        self.log=(self.root/'log').open('wb')
        self.process=subprocess.Popen([BINARY,str(self.root),str(self.port)],stdout=self.log,stderr=self.log)
        for _ in range(100):
            if self.process.poll() is not None:self.fail((self.root/'log').read_text())
            try:
                if self.request('/')[0]==200:break
            except OSError:pass
            time.sleep(.03)
        else:self.fail('Inspector did not start')
    def hashes(self):return {name:hashlib.sha256((self.root/name).read_bytes()).hexdigest() for name in ['app.db','appinfo.db'] if (self.root/name).exists()}
    def request(self,path,method='GET'):
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=5)
        try:c.request(method,path);r=c.getresponse();return r.status,r.read()
        finally:c.close()
    def tearDown(self):
        self.process.terminate();self.process.wait(timeout=5);self.log.close()
        logs=(self.root/'log').read_text();self.assertNotIn('ERROR: AddressSanitizer',logs);self.assertNotIn('runtime error:',logs)
        self.temp.cleanup()
    def test_report_does_not_change_databases(self):
        status,body=self.request('/report');self.assertEqual(status,200);report=json.loads(body)
        self.assertTrue(report['readOnlyInspector']);self.assertFalse(report['databaseEditsPerformed'])
        self.assertTrue(all(d['readOnly'] for d in report['databases']))
        self.assertEqual(report['databases'][0]['storeCandidates'][0]['titleId'],'NPXS49999')
        icon=next(t for t in report['databases'][0]['tables'] if t['name']=='tbl_iconinfo_1234')
        self.assertEqual(icon['storeRows'][0][0]['deeplinkUri'],'original')
        self.assertEqual(report['databases'][1]['tables'][0]['storeRows'][0][0]['val'],'PlayStation Store')
        self.assertEqual(self.before,self.hashes())
    def test_writes_are_not_exposed(self):
        for method in ['POST','PUT','DELETE']:
            self.assertEqual(self.request('/apply',method)[0],405)
        self.assertEqual(self.before,self.hashes())
    def test_missing_database_is_not_created(self):
        (self.root/'appinfo.db').unlink()
        report=json.loads(self.request('/report')[1]);self.assertIn('error',report['databases'][1]);self.assertFalse((self.root/'appinfo.db').exists())
    def test_symlink_database_is_rejected(self):
        original=self.root/'original.db';(self.root/'appinfo.db').rename(original);(self.root/'appinfo.db').symlink_to(original)
        report=json.loads(self.request('/report')[1]);self.assertIn('error',report['databases'][1])
        self.assertEqual(hashlib.sha256(original.read_bytes()).hexdigest(),self.before['appinfo.db'])
if __name__=='__main__':unittest.main(verbosity=2)
