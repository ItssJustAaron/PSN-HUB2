"""Test the actual C patch/restore engine on synthetic Store records only."""
from pathlib import Path
import hashlib,importlib.util,json,os,shutil,sqlite3,subprocess,sys,tempfile,unittest
BINARY=str(Path(sys.argv.pop(1)).resolve());ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('planner',ROOT/'tools/prepare-store-plan.py');planner=importlib.util.module_from_spec(spec);spec.loader.exec_module(planner)
class PatchTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='psnhub-store-test-');self.root=Path(self.temp.name)
  shutil.copyfile(ROOT/'native/build/psn-hub-icon.png',self.root/'psn-hub-icon.png')
  with sqlite3.connect(self.root/'app.db') as db:
   db.executescript('CREATE TABLE tbl_contentinfo(titleId TEXT,titleName TEXT,pprDeeplinkUri TEXT,icon0Info TEXT,AppInfoJson TEXT,localConceptId TEXT,categoryType INT); CREATE TABLE tbl_conceptmetadata(localConceptId TEXT,conceptName TEXT,icon0Info TEXT,ConceptInfoJson TEXT,dispLocation INT); CREATE TABLE tbl_iconinfo_1234(titleId TEXT,titleName TEXT,deeplinkUri TEXT,appDrmType INT); CREATE TABLE tbl_concepticoninfo_1234(primaryTitleId TEXT,conceptName TEXT,primaryTitleName TEXT,deeplinkUri TEXT,icon0Info TEXT,dispLocation INT);')
   appjson=json.dumps({'TITLE':'Jailbreak Store','TITLE_01':'Jailbreak Store','TITLE_ID':planner.TITLE,'DEEPLINK_URI':'https://old.example/','icon0Info':'old-icon','CATEGORY_TYPE':67108864,'_install_version':657525567070928897})
   fields={'field_list':[{'key':'concept_name','data':'Old Store','size':9,'type':2},{'key':'deeplink_uri','data':'https://old.example/','size':20,'type':2},{'key':'display_location','data':146,'size':8,'type':0}]}
   db.execute('INSERT INTO tbl_contentinfo VALUES(?,?,?,?,?,?,?)',(planner.TITLE,'Jailbreak Store','https://old.example/','old-icon',appjson,planner.CONCEPT,67108864))
   db.execute('INSERT INTO tbl_contentinfo VALUES(?,?,?,?,?,?,?)',('PPSA00001','Unrelated game','original','original','{}','cid:other',0))
   db.execute('INSERT INTO tbl_conceptmetadata VALUES(?,?,?,?,?)',(planner.CONCEPT,'Jailbreak Store','old-icon',json.dumps(fields),146))
   db.execute('INSERT INTO tbl_iconinfo_1234 VALUES(?,?,?,?)',(planner.TITLE,'Jailbreak Store','http://127.0.0.1:1022/app/index.html',5))
   db.execute('INSERT INTO tbl_concepticoninfo_1234 VALUES(?,?,?,?,?,?)',(planner.TITLE,'Jailbreak Store','Jailbreak Store','http://127.0.0.1:1022/app/index.html','old-icon',2194))
  with sqlite3.connect(self.root/'appinfo.db') as db:
   db.executescript('CREATE TABLE tbl_appinfo(titleId TEXT,key TEXT,val); CREATE TABLE tbl_conceptinfo(local_concept_id TEXT,key TEXT,val);')
   db.executemany('INSERT INTO tbl_appinfo VALUES(?,?,?)',[(planner.TITLE,'TITLE','Jailbreak Store'),(planner.TITLE,'DEEPLINK_URI','https://old.example/'),(planner.TITLE,'CATEGORY_TYPE',67108864)])
   db.executemany('INSERT INTO tbl_conceptinfo VALUES(?,?,?)',[(planner.CONCEPT,'concept_name','Jailbreak Store'),(planner.CONCEPT,'deeplink_uri','https://old.example/'),(planner.CONCEPT,'display_location',146)])
  planner.build_plan(self.root/'app.db',self.root/'appinfo.db',self.root/'psn-hub-icon.png',self.root/'plan.db');self.approve();self.before=self.snapshot()
 def tearDown(self):self.temp.cleanup()
 def approve(self):
  digest=hashlib.sha256((self.root/'plan.db').read_bytes()).hexdigest();(self.root/('approve-'+digest+'.txt')).write_text('APPLY NPXS40047\n'+planner.URL+'\n',encoding='ascii',newline='')
 def snapshot(self):
  result={}
  for name in ['app.db','appinfo.db']:
   with sqlite3.connect(self.root/name) as db:
    result[name]={table:list(db.execute('SELECT * FROM "'+table+'" ORDER BY rowid')) for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")}
  return result
 def run_engine(self,mode='apply',success=True):
  p=subprocess.run([BINARY,str(self.root),mode],capture_output=True,text=True)
  self.assertNotIn('ERROR: AddressSanitizer',p.stderr);self.assertNotIn('runtime error:',p.stderr)
  result=json.loads((self.root/'result.json').read_text());self.assertEqual(result['success'],success,p.stdout+p.stderr);return result
 def test_apply_backup_and_exact_restore(self):
  self.run_engine();after=self.snapshot()
  self.assertEqual(after['app.db']['tbl_contentinfo'][1],self.before['app.db']['tbl_contentinfo'][1])
  self.assertEqual(after['app.db']['tbl_contentinfo'][0][-1],67108864)
  self.assertEqual(after['app.db']['tbl_iconinfo_1234'][0][-1],5)
  self.assertEqual(after['app.db']['tbl_concepticoninfo_1234'][0][-1],2194)
  with sqlite3.connect(self.root/'plan.db') as plan:backup=Path(plan.execute("SELECT val FROM meta WHERE key='backupDirectory'").fetchone()[0])
  for file in ['app.db','appinfo.db']:
   with sqlite3.connect(backup/file) as db:self.assertEqual(db.execute('PRAGMA quick_check').fetchone()[0],'ok')
  self.run_engine('restore');self.assertEqual(self.snapshot(),self.before)
 def test_missing_approval(self):
  for p in self.root.glob('approve-*'):p.unlink()
  self.run_engine(success=False);self.assertEqual(self.snapshot(),self.before)
 def test_stale_data_does_not_get_overwritten(self):
  with sqlite3.connect(self.root/'app.db') as db:db.execute("UPDATE tbl_contentinfo SET titleName='Changed elsewhere' WHERE titleId=?",(planner.TITLE,))
  before=self.snapshot();self.run_engine(success=False);self.assertEqual(self.snapshot(),before)
 def test_cross_database_rollback_on_sql_error(self):
  with sqlite3.connect(self.root/'appinfo.db') as db:db.execute("CREATE TRIGGER block_test BEFORE UPDATE OF val ON tbl_appinfo BEGIN SELECT RAISE(ABORT,'test refusal'); END;")
  self.run_engine(success=False);self.assertEqual(self.snapshot(),self.before)
 def test_restore_refuses_drift(self):
  self.run_engine()
  with sqlite3.connect(self.root/'appinfo.db') as db:db.execute("UPDATE tbl_appinfo SET val='Changed elsewhere' WHERE key='TITLE'")
  before=self.snapshot();self.run_engine('restore',success=False);self.assertEqual(self.snapshot(),before)
 def test_unapproved_field_rejected(self):
  with sqlite3.connect(self.root/'plan.db') as db:db.execute("UPDATE changes SET column_name='categoryType' WHERE n=1")
  self.approve();self.run_engine(success=False);self.assertEqual(self.snapshot(),self.before)
 def test_json_entitlement_change_rejected(self):
  with sqlite3.connect(self.root/'plan.db') as db:
   n,value=db.execute("SELECT n,new_value FROM changes WHERE column_name='AppInfoJson'").fetchone();value=json.loads(value);value['CATEGORY_TYPE']=0;db.execute('UPDATE changes SET new_value=? WHERE n=?',(json.dumps(value),n))
  self.approve();self.run_engine(success=False);self.assertEqual(self.snapshot(),self.before)
 def test_wal_mode_rejected(self):
  with sqlite3.connect(self.root/'appinfo.db') as db:db.execute('PRAGMA journal_mode=WAL')
  self.run_engine(success=False);self.assertEqual(self.snapshot(),self.before)
 def test_wrong_icon_refused(self):
  (self.root/'psn-hub-icon.png').write_bytes(b'wrong icon');self.run_engine(success=False);self.assertEqual(self.snapshot(),self.before)
if __name__=='__main__':unittest.main(verbosity=2)
