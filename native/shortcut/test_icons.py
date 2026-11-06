"""Host integration checks for file-only icons, ownership and backups."""
from pathlib import Path
import json, sqlite3, subprocess, sys, tempfile, unittest
BINARY=sys.argv.pop(1)
ASSET=(Path(__file__).resolve().parents[2]/'Manager/assets/home-icon.png').read_bytes()
class Icons(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.db=self.root/'app.db';self.backup=self.root/'backups'
  with sqlite3.connect(self.db) as db:
   db.execute('CREATE TABLE tbl_contentinfo(titleId,titleName,pprDeeplinkUri)')
   for title in ['PSNH00001','PSNH00002','NPXS40047']:
    db.execute('INSERT INTO tbl_contentinfo VALUES(?,?,?)',(title,'PSN-HUB','https://itssjustaaron.github.io/PSN-HUB2/'))
  self.paths=[]
  for title in ['PSNH00001','PSNH00002']:
   self.paths.extend([self.root/f'user/app/{title}/sce_sys/icon0.png',self.root/f'user/appmeta/{title}/icon0.png'])
  self.paths.append(self.root/'user/appmeta/NPXS40047/psn-hub-icon.png')
  for path in self.paths:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(ASSET+b'old')
 def tearDown(self):self.temp.cleanup()
 def run_engine(self,ok=True):
  before=self.db.read_bytes();p=subprocess.run([BINARY,str(self.backup),str(self.db),str(self.root)],capture_output=True,text=True)
  self.assertNotIn('AddressSanitizer',p.stderr);self.assertNotIn('runtime error:',p.stderr)
  result=json.loads(p.stdout);self.assertEqual(result['success'],ok,p.stdout+p.stderr);self.assertEqual(before,self.db.read_bytes());return result
 def test_updates_five_icons_and_keeps_originals(self):
  self.assertEqual(self.run_engine()['icons'],5)
  for path in self.paths:self.assertEqual(path.read_bytes(),ASSET)
  originals=list(self.backup.glob('icons-*/original-*.png'));self.assertEqual(len(originals),5)
  for path in originals:self.assertEqual(path.read_bytes(),ASSET+b'old')
 def test_store_not_replaced_is_untouched(self):
  with sqlite3.connect(self.db) as db:db.execute("UPDATE tbl_contentinfo SET pprDeeplinkUri='store' WHERE titleId='NPXS40047'")
  self.assertEqual(self.run_engine()['icons'],4);self.assertEqual(self.paths[-1].read_bytes(),ASSET+b'old')
 def test_unowned_titles_are_untouched(self):
  with sqlite3.connect(self.db) as db:db.execute("UPDATE tbl_contentinfo SET titleName='Other app'")
  self.run_engine(False)
  for path in self.paths:self.assertEqual(path.read_bytes(),ASSET+b'old')
 def test_invalid_icon_prevents_all_writes(self):
  self.paths[-1].write_bytes(b'invalid icon');self.run_engine(False)
  for path in self.paths[:-1]:self.assertEqual(path.read_bytes(),ASSET+b'old')
 def test_symlink_file_is_rejected(self):
  self.paths[-1].unlink();self.paths[-1].symlink_to(self.paths[0]);self.run_engine(False)
  for path in self.paths[:-1]:self.assertEqual(path.read_bytes(),ASSET+b'old')
if __name__=='__main__':unittest.main()
