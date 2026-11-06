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
 def test_restore_preserves_unrelated_json_updates(self):
  self.run_engine()
  with sqlite3.connect(self.root/'app.db') as db:
   value=json.loads(db.execute('SELECT AppInfoJson FROM tbl_contentinfo WHERE titleId=?',(planner.TITLE,)).fetchone()[0]);value['#_last_access_time']='Changed after opening the tile';db.execute('UPDATE tbl_contentinfo SET AppInfoJson=? WHERE titleId=?',(json.dumps(value),planner.TITLE))
  self.run_engine('restore')
  with sqlite3.connect(self.root/'app.db') as db:
   value=json.loads(db.execute('SELECT AppInfoJson FROM tbl_contentinfo WHERE titleId=?',(planner.TITLE,)).fetchone()[0])
  self.assertEqual(value['TITLE'],'Jailbreak Store');self.assertEqual(value['#_last_access_time'],'Changed after opening the tile');self.assertEqual(value['CATEGORY_TYPE'],67108864)
 def test_restore_accepts_plan_from_previous_icon_build(self):
  self.run_engine()
  with sqlite3.connect(self.root/'plan.db') as db:db.execute("UPDATE meta SET val='previous-icon-build' WHERE key='iconSha256'")
  self.run_engine('restore');self.assertEqual(self.snapshot(),self.before)
 def legacy_install(self):
  (self.root/'plan.db').unlink();planner.build_plan(self.root/'app.db',self.root/'appinfo.db',self.root/'psn-hub-icon.png',self.root/'plan.db',name='PSN-HUB');self.approve();self.run_engine()
 def approve_rename(self):
  digest=hashlib.sha256((self.root/'plan.db').read_bytes()).hexdigest();(self.root/('rename-'+digest+'.txt')).write_text('RENAME NPXS40047\nPSN-HUB JAILBREAK\n',encoding='ascii',newline='')
 def test_rename_legacy_install_preserves_original_recovery(self):
  self.legacy_install()
  with sqlite3.connect(self.root/'plan.db') as db:
   original_backup=db.execute("SELECT val FROM meta WHERE key='backupDirectory'").fetchone()[0];db.execute("UPDATE meta SET val='previous-icon-build' WHERE key='iconSha256'")
  self.approve_rename();self.run_engine('rename')
  with sqlite3.connect(self.root/'app.db') as db:self.assertEqual(db.execute('SELECT titleName FROM tbl_contentinfo WHERE titleId=?',(planner.TITLE,)).fetchone()[0],'PSN-HUB JAILBREAK')
  with sqlite3.connect(self.root/'plan.db') as db:
   self.assertEqual(db.execute("SELECT val FROM meta WHERE key='backupDirectory'").fetchone()[0],original_backup);self.assertEqual(db.execute("SELECT val FROM meta WHERE key='name'").fetchone()[0],'PSN-HUB JAILBREAK');self.assertTrue(db.execute("SELECT val FROM meta WHERE key='renameBackupDirectory'").fetchone()[0])
  self.run_engine('restore');self.assertEqual(self.snapshot(),self.before)
 def test_rename_preserves_access_metadata(self):
  self.legacy_install()
  with sqlite3.connect(self.root/'app.db') as db:
   value=json.loads(db.execute('SELECT AppInfoJson FROM tbl_contentinfo WHERE titleId=?',(planner.TITLE,)).fetchone()[0]);value['#_last_access_time']='New access timestamp';db.execute('UPDATE tbl_contentinfo SET AppInfoJson=? WHERE titleId=?',(json.dumps(value),planner.TITLE))
  self.approve_rename();self.run_engine('rename')
  with sqlite3.connect(self.root/'app.db') as db:value=json.loads(db.execute('SELECT AppInfoJson FROM tbl_contentinfo WHERE titleId=?',(planner.TITLE,)).fetchone()[0])
  self.assertEqual(value['TITLE'],'PSN-HUB JAILBREAK');self.assertEqual(value['#_last_access_time'],'New access timestamp')
  self.run_engine('restore')
  with sqlite3.connect(self.root/'app.db') as db:value=json.loads(db.execute('SELECT AppInfoJson FROM tbl_contentinfo WHERE titleId=?',(planner.TITLE,)).fetchone()[0])
  self.assertEqual(value['TITLE'],'Jailbreak Store');self.assertEqual(value['#_last_access_time'],'New access timestamp')
 def test_rename_requires_its_own_approval(self):
  self.legacy_install();before=self.snapshot();self.run_engine('rename',success=False);self.assertEqual(self.snapshot(),before)
 def add_media(self):
  with sqlite3.connect(self.root/'app.db') as db:
   db.executescript('ALTER TABLE tbl_contentinfo ADD COLUMN dispLocation INTEGER; ALTER TABLE tbl_iconinfo_1234 ADD COLUMN dispLocation INTEGER DEFAULT 188; ALTER TABLE tbl_iconinfo_1234 ADD COLUMN visible INTEGER DEFAULT 1; ALTER TABLE tbl_iconinfo_1234 ADD COLUMN emsDeletedFlag INTEGER DEFAULT 0; ALTER TABLE tbl_iconinfo_1234 ADD COLUMN emsPushedFlag INTEGER DEFAULT 1; ALTER TABLE tbl_concepticoninfo_1234 ADD COLUMN validFlag INTEGER DEFAULT 1; CREATE TABLE tbl_info_1234(key TEXT PRIMARY KEY,value);')
   for title,label,url in [('PSNH00002','PSN-HUB Jailbreak',planner.URL),('PSNH00001','PSN-HUB Manager','http://127.0.0.1:8085/')]:
    cid='cid:local:'+title;doc=json.dumps({'TITLE':label,'DISPLAYLOCATION':188})
    db.execute('INSERT INTO tbl_contentinfo(titleId,titleName,pprDeeplinkUri,icon0Info,AppInfoJson,localConceptId,categoryType,dispLocation) VALUES(?,?,?,?,?,?,?,?)',(title,label,url,'media-icon',doc,cid,65536,188))
    concept=json.dumps({'field_list':[{'key':'display_location','data':188,'size':8,'type':0}]})
    db.execute('INSERT INTO tbl_conceptmetadata VALUES(?,?,?,?,?)',(cid,label,'media-icon',concept,188))
    db.execute('INSERT INTO tbl_iconinfo_1234(titleId,titleName,deeplinkUri,appDrmType) VALUES(?,?,?,?)',(title,label,url,0))
    db.execute('INSERT INTO tbl_concepticoninfo_1234(primaryTitleId,conceptName,primaryTitleName,deeplinkUri,icon0Info,dispLocation) VALUES(?,?,?,?,?,?)',(title,label,label,url,'media-icon',2236))
   db.execute('INSERT INTO tbl_info_1234 VALUES(?,?)',('manager-setting','unchanged'))
  with sqlite3.connect(self.root/'appinfo.db') as db:
   db.execute('INSERT INTO tbl_appinfo VALUES(?,?,?)',('PSNH00002','DISPLAYLOCATION',188));db.execute('INSERT INTO tbl_conceptinfo VALUES(?,?,?)',('cid:local:PSNH00002','display_location',188))
  self.before=self.snapshot()
 def test_store_choice_hides_only_media_jailbreak_and_restores_it(self):
  self.add_media();self.run_engine()
  with sqlite3.connect(self.root/'app.db') as db:
   self.assertEqual(db.execute("SELECT dispLocation FROM tbl_contentinfo WHERE titleId='PSNH00002'").fetchone()[0],0)
   self.assertEqual(db.execute("SELECT visible,emsDeletedFlag,emsPushedFlag FROM tbl_iconinfo_1234 WHERE titleId='PSNH00002'").fetchone(),(0,1,0))
   self.assertEqual(db.execute("SELECT visible FROM tbl_iconinfo_1234 WHERE titleId='PSNH00001'").fetchone()[0],1)
   self.assertEqual(db.execute("SELECT dispLocation FROM tbl_contentinfo WHERE titleId='PSNH00001'").fetchone()[0],188)
   self.assertEqual(json.loads(db.execute("SELECT value FROM tbl_info_1234 WHERE key='nsx_content_flag_PSNH00002'").fetchone()[0]),{'deleted':True,'pushed':False})
  self.run_engine('restore');self.assertEqual(self.snapshot(),self.before)
  with sqlite3.connect(self.root/'plan.db') as db:self.assertEqual(db.execute("SELECT val FROM meta WHERE key='mediaJailbreakHidden'").fetchone()[0],'0')
 def test_media_hide_failure_rolls_back_store_choice(self):
  self.add_media()
  with sqlite3.connect(self.root/'app.db') as db:db.execute("UPDATE tbl_contentinfo SET pprDeeplinkUri='https://different.example/' WHERE titleId='PSNH00002'")
  before=self.snapshot();self.run_engine(success=False);self.assertEqual(self.snapshot(),before)
 def test_failed_store_choice_does_not_hide_media(self):
  self.add_media()
  with sqlite3.connect(self.root/'app.db') as db:db.execute("UPDATE tbl_contentinfo SET titleName='Changed elsewhere' WHERE titleId=?",(planner.TITLE,))
  before=self.snapshot();self.run_engine(success=False);self.assertEqual(self.snapshot(),before)
 def test_media_restore_preserves_unrelated_json_and_integer_types(self):
  self.add_media();self.run_engine()
  with sqlite3.connect(self.root/'app.db') as db:
   value=json.loads(db.execute("SELECT AppInfoJson FROM tbl_contentinfo WHERE titleId='PSNH00002'").fetchone()[0]);value['access']='new';db.execute("UPDATE tbl_contentinfo SET AppInfoJson=? WHERE titleId='PSNH00002'",(json.dumps(value),))
  self.run_engine('restore')
  with sqlite3.connect(self.root/'app.db') as db:
   value=json.loads(db.execute("SELECT AppInfoJson FROM tbl_contentinfo WHERE titleId='PSNH00002'").fetchone()[0]);self.assertEqual(value['DISPLAYLOCATION'],188);self.assertEqual(value['access'],'new')
  with sqlite3.connect(self.root/'appinfo.db') as db:self.assertEqual(db.execute("SELECT val,typeof(val) FROM tbl_appinfo WHERE titleId='PSNH00002'").fetchone(),(188,'integer'))
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
