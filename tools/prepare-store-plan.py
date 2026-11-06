"""Prepare a private, reversible cell plan from inspection copies of the PS5 DBs."""
from pathlib import Path
import argparse,hashlib,json,re,sqlite3,time
TITLE='NPXS40047';CONCEPT='cid:local:'+TITLE;NAME='PSN-HUB JAILBREAK'
URL='https://itssjustaaron.github.io/PSN-HUB2/'
ICON='/user/appmeta/NPXS40047/psn-hub-icon.png?psnhub=1'
def ident(name):return '"'+name.replace('"','""')+'"'
def updated_json(value,name=NAME):
 data=json.loads(value)
 if not isinstance(data,dict):raise ValueError('Unsupported JSON shape')
 if 'field_list' in data:
  for field in data['field_list']:
   key=field.get('key','')
   if key=='concept_name' or re.fullmatch(r'concept_name_\d\d',key):field['data']=name;field['size']=len(name.encode())
   elif key=='deeplink_uri':field['data']=URL;field['size']=len(URL.encode())
 else:
  for key in list(data):
   if key=='TITLE' or re.fullmatch(r'TITLE_\d\d',key):data[key]=name
   elif key=='DEEPLINK_URI':data[key]=URL
   elif key=='icon0Info':data[key]=ICON
 return json.dumps(data,ensure_ascii=False,separators=(',',':'))
def build_plan(app,info,icon,output,name=NAME):
 if name not in ['PSN-HUB',NAME]:raise ValueError('Unsupported shortcut name')
 patch_json=lambda value:updated_json(value,name)
 if output.exists():raise ValueError('Refusing to overwrite a previous plan')
 changes=[]
 for schema,path in [('main',app),('info',info)]:
  with sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True) as db:
   db.row_factory=sqlite3.Row
   if db.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise ValueError('Database integrity check failed')
   if db.execute('PRAGMA journal_mode').fetchone()[0]!='delete':raise ValueError('Only DELETE-journal databases are supported for this first test')
   tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
   for table in tables:
    key=None;columns={}
    if schema=='main':
     if table=='tbl_contentinfo':key='titleId';columns={'titleName':name,'pprDeeplinkUri':URL,'icon0Info':ICON,'AppInfoJson':patch_json}
     elif table=='tbl_conceptmetadata':key='localConceptId';columns={'conceptName':name,'icon0Info':ICON,'ConceptInfoJson':patch_json}
     elif re.fullmatch(r'tbl_iconinfo_\d+',table):key='titleId';columns={'titleName':name,'deeplinkUri':URL}
     elif re.fullmatch(r'tbl_concepticoninfo_\d+',table):key='primaryTitleId';columns={'conceptName':name,'primaryTitleName':name,'deeplinkUri':URL,'icon0Info':ICON}
    elif table=='tbl_appinfo':key='titleId'
    elif table=='tbl_conceptinfo':key='local_concept_id'
    if not key:continue
    target=CONCEPT if key in ['localConceptId','local_concept_id'] else TITLE
    rows=db.execute('SELECT rowid AS __hub_rowid,* FROM '+ident(table)+' WHERE '+ident(key)+'=?',(target,))
    for row in rows:
     if schema=='info':
      field=row['key'];new=None
      if field in ['TITLE','concept_name'] or re.fullmatch(r'(?:TITLE|concept_name)_\d\d',field):new=name
      elif field in ['DEEPLINK_URI','deeplink_uri']:new=URL
      if new is not None and row['val']!=new:changes.append((schema,table,key,target,row['__hub_rowid'],'val',row['val'],new))
     else:
      for column,replacement in columns.items():
       if column not in row.keys() or row[column] is None:continue
       old=row[column]
       if not isinstance(old,str):raise ValueError('Unexpected non-text metadata: '+table+'.'+column)
       new=replacement(old) if callable(replacement) else replacement
       if old!=new:changes.append((schema,table,key,target,row['__hub_rowid'],column,old,new))
 if not any(c[1]=='tbl_contentinfo' for c in changes) or not any(c[0]=='info' for c in changes):raise ValueError('Expected Store metadata was not found in both databases')
 with sqlite3.connect(output) as plan:
  plan.executescript('CREATE TABLE meta(key TEXT PRIMARY KEY,val TEXT NOT NULL); CREATE TABLE changes(n INTEGER PRIMARY KEY,schema_name TEXT NOT NULL,table_name TEXT NOT NULL,key_column TEXT NOT NULL,key_value TEXT NOT NULL,row_id INTEGER NOT NULL,column_name TEXT NOT NULL,old_value TEXT,new_value TEXT NOT NULL);')
  meta={'format':'1','name':name,'state':'prepared','titleId':TITLE,'url':URL,'icon':ICON,'iconSha256':hashlib.sha256(icon.read_bytes()).hexdigest(),'created':str(int(time.time()))}
  plan.executemany('INSERT INTO meta VALUES(?,?)',meta.items())
  plan.executemany('INSERT INTO changes(schema_name,table_name,key_column,key_value,row_id,column_name,old_value,new_value) VALUES(?,?,?,?,?,?,?,?)',changes)
 return changes
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--databases',type=Path,required=True);p.add_argument('--icon',type=Path,required=True);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
 changes=build_plan(a.databases/'app.db',a.databases/'appinfo.db',a.icon,a.output)
 digest=hashlib.sha256(a.output.read_bytes()).hexdigest()
 print(json.dumps({'titleId':TITLE,'name':NAME,'url':URL,'icon':ICON,'cells':len(changes),'tables':len(set((c[0],c[1]) for c in changes)),'planSha256':digest,'scope':'name, deeplink and icon metadata only'},indent=2))
