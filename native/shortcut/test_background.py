"""Exercise the real artwork updater on disposable synthetic databases only."""
from pathlib import Path
import hashlib,json,sqlite3,subprocess,sys,tempfile,unittest
BINARY=str(Path(sys.argv.pop(1)).resolve())
ROOT=Path(__file__).resolve().parents[2]
TITLE='NPXS40047';CONCEPT='cid:local:'+TITLE
SITE='https://itssjustaaron.github.io/PSN-HUB2/'
ASSET=(ROOT/'Manager/assets/jailbreak-background.png').read_bytes()
HASH=hashlib.sha256(ASSET).hexdigest()
FILE='psn-hub-background-'+HASH[:12]+'.png'
URI='/user/appmeta/NPXS40047/'+FILE+'?psnhub-bg='+HASH[:12]
class BackgroundTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='psnhub-bg-');self.root=Path(self.temp.name);(self.root/'appmeta').mkdir()
  with sqlite3.connect(self.root/'app.db') as db:
   db.executescript('CREATE TABLE tbl_contentinfo(titleId TEXT,titleName TEXT,pprDeeplinkUri TEXT,icon0Info TEXT,pic0Info TEXT,pic1Info TEXT,AppInfoJson TEXT,categoryType INT);CREATE TABLE tbl_conceptmetadata(localConceptId TEXT,conceptName TEXT,pic0Info TEXT);CREATE TABLE tbl_concepticoninfo_1234(primaryTitleId TEXT,pic0Info TEXT,dispLocation INT);CREATE TABLE tbl_concepticoninfo_wrong(primaryTitleId TEXT,pic0Info TEXT);')
   doc=json.dumps({'TITLE':'PSN-HUB JAILBREAK','DEEPLINK_URI':SITE,'icon0Info':'mascot-icon','pic0Info':'old-bg.png','pic1Info':None,'_path_pic0_info':-12345,'last_access':'before'})
   db.execute('INSERT INTO tbl_contentinfo VALUES(?,?,?,?,?,?,?,?)',(TITLE,'PSN-HUB JAILBREAK',SITE,'mascot-icon','old-bg.png',None,doc,67108864))
   db.execute('INSERT INTO tbl_contentinfo VALUES(?,?,?,?,?,?,?,?)',('PPSA00001','Game','original','game-icon','game-bg',None,'{}',0))
   db.execute('INSERT INTO tbl_conceptmetadata VALUES(?,?,?)',(CONCEPT,'PSN-HUB JAILBREAK','old-bg.png'))
   db.execute('INSERT INTO tbl_concepticoninfo_1234 VALUES(?,?,?)',(TITLE,'old-bg.png',2194));db.execute('INSERT INTO tbl_concepticoninfo_wrong VALUES(?,?)',(TITLE,'untouched'))
  with sqlite3.connect(self.root/'appinfo.db') as db:
   db.execute('CREATE TABLE tbl_appinfo(titleId TEXT,key TEXT,val)');db.execute('INSERT INTO tbl_appinfo VALUES(?,?,?)',(TITLE,'_path_pic0_info',-12345))
  self.before=self.snapshot()
 def tearDown(self):self.temp.cleanup()
 def snapshot(self):
  result={}
  for file in ['app.db','appinfo.db']:
   with sqlite3.connect(self.root/file) as db:result[file]={name:db.execute('SELECT * FROM "'+name+'" ORDER BY rowid').fetchall() for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")}
  return result
 def run_engine(self,mode='apply',success=True):
  process=subprocess.run([BINARY,str(self.root),mode],capture_output=True,text=True)
  self.assertNotIn('AddressSanitizer',process.stderr);self.assertNotIn('runtime error:',process.stderr)
  data=json.loads((self.root/'result.json').read_text());self.assertEqual(data['success'],success,process.stdout+process.stderr);return data
 def test_apply_backups_and_exact_restore(self):
  result=self.run_engine();self.assertEqual(result['sha256'],HASH);self.assertEqual(result['background'],URI)
  self.assertEqual((self.root/'appmeta'/FILE).read_bytes(),ASSET)
  after=self.snapshot();row=after['app.db']['tbl_contentinfo'][0];self.assertEqual(row[:4],self.before['app.db']['tbl_contentinfo'][0][:4]);self.assertEqual(row[4:6],(URI,URI));self.assertEqual(row[-1],67108864)
  self.assertEqual(after['app.db']['tbl_contentinfo'][1],self.before['app.db']['tbl_contentinfo'][1]);self.assertEqual(after['appinfo.db'],self.before['appinfo.db']);self.assertEqual(after['app.db']['tbl_concepticoninfo_wrong'],self.before['app.db']['tbl_concepticoninfo_wrong'])
  with sqlite3.connect(self.root/('background-'+HASH[:12]+'.db')) as ledger:backup=Path(ledger.execute("SELECT val FROM meta WHERE key='backupDirectory'").fetchone()[0])
  for file in ['app.db','appinfo.db']:
   with sqlite3.connect(backup/file) as db:
    self.assertEqual(db.execute('PRAGMA quick_check').fetchone()[0],'ok')
    for table,rows in self.before[file].items():self.assertEqual(db.execute('SELECT * FROM "'+table+'" ORDER BY rowid').fetchall(),rows)
  self.run_engine('restore');self.assertEqual(self.snapshot(),self.before)
 def test_apply_is_idempotent(self):
  self.run_engine();before=self.snapshot();self.run_engine();self.assertEqual(self.snapshot(),before);self.assertEqual(len(list(self.root.glob('backup-*'))),1)
 def test_restore_preserves_unrelated_shell_json_updates(self):
  self.run_engine()
  with sqlite3.connect(self.root/'app.db') as db:
   doc=json.loads(db.execute('SELECT AppInfoJson FROM tbl_contentinfo WHERE titleId=?',(TITLE,)).fetchone()[0]);doc['last_access']='after';db.execute('UPDATE tbl_contentinfo SET AppInfoJson=? WHERE titleId=?',(json.dumps(doc),TITLE))
  self.run_engine('restore');doc=json.loads(self.snapshot()['app.db']['tbl_contentinfo'][0][6]);self.assertEqual(doc['last_access'],'after');self.assertEqual(doc['pic0Info'],'old-bg.png');self.assertIsNone(doc['pic1Info'])
 def test_restore_refuses_drift_and_rolls_back(self):
  self.run_engine()
  with sqlite3.connect(self.root/'app.db') as db:db.execute('UPDATE tbl_conceptmetadata SET pic0Info=? WHERE localConceptId=?',('another-background',CONCEPT))
  before=self.snapshot();self.run_engine('restore',False);self.assertEqual(self.snapshot(),before)
 def test_ledger_scope_tampering_is_rejected(self):
  self.run_engine()
  with sqlite3.connect(self.root/('background-'+HASH[:12]+'.db')) as db:db.execute("UPDATE changes SET key_value='PPSA00001' WHERE n=(SELECT min(n) FROM changes)")
  before=self.snapshot();self.run_engine('restore',False);self.assertEqual(self.snapshot(),before)
 def test_requires_the_installed_psnhub_shortcut(self):
  with sqlite3.connect(self.root/'app.db') as db:db.execute('UPDATE tbl_contentinfo SET pprDeeplinkUri=? WHERE titleId=?',('https://store.example',TITLE))
  before=self.snapshot();self.run_engine(success=False);self.assertEqual(self.snapshot(),before);self.assertFalse((self.root/'appmeta'/FILE).exists())
 def test_corrupt_existing_asset_is_not_overwritten(self):
  (self.root/'appmeta'/FILE).write_bytes(b'wrong');self.run_engine(success=False);self.assertEqual(self.snapshot(),self.before);self.assertEqual((self.root/'appmeta'/FILE).read_bytes(),b'wrong')
 def test_unsupported_later_field_rolls_back_earlier_updates(self):
  with sqlite3.connect(self.root/'app.db') as db:db.execute('UPDATE tbl_conceptmetadata SET pic0Info=?',(sqlite3.Binary(b'unsupported'),))
  before=self.snapshot();self.run_engine(success=False);self.assertEqual(self.snapshot(),before)
 def test_wal_is_refused(self):
  with sqlite3.connect(self.root/'appinfo.db') as db:db.execute('PRAGMA journal_mode=WAL')
  before=self.snapshot();self.run_engine(success=False);self.assertEqual(self.snapshot(),before)
if __name__=='__main__':unittest.main(verbosity=2)
