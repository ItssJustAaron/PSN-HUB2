/* SPDX-License-Identifier: GPL-3.0-or-later
 * One-shot, reversible NPXS40047 metadata test. Never replaces complete live DBs.
 */
#define _DEFAULT_SOURCE
#include "hub.h"
#include "shortcut_icon.h"
#include <sqlite3.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
int hub_media_hide(sqlite3 *);
int hub_media_restore(sqlite3 *);
#define TITLE "NPXS40047"
#define CONCEPT "cid:local:NPXS40047"
#define FULL_NAME "PSN-HUB JAILBREAK"
static char target_name[64]=FULL_NAME;
#define SITE "https://itssjustaaron.github.io/PSN-HUB2/"
#define ICON_URI "/user/appmeta/NPXS40047/psn-hub-icon.png?psnhub=1"
#define APPROVAL "APPLY NPXS40047\nhttps://itssjustaaron.github.io/PSN-HUB2/\n"
typedef struct {char schema[8],table[80],key[32],value[64],column[32];sqlite3_int64 row,n;char *old,*new;} Change;
static char problem[512]="Operation failed";
static int fail(const char *why){snprintf(problem,sizeof(problem),"%s",why);return -1;}
static int run(sqlite3 *db,const char *sql){if(sqlite3_exec(db,sql,NULL,NULL,NULL)!=SQLITE_OK)return fail(sqlite3_errmsg(db));return 0;}
static int regular(const char *path){struct stat st;return lstat(path,&st)==0&&S_ISREG(st.st_mode);}
static int attach(sqlite3 *db,const char *path,const char *sql){sqlite3_stmt *s=NULL;int code=sqlite3_prepare_v2(db,sql,-1,&s,NULL);if(code==SQLITE_OK){char *uri=sqlite3_mprintf("file:%s?mode=rw",path);if(!uri){sqlite3_finalize(s);return fail("Out of memory");}sqlite3_bind_text(s,1,uri,-1,SQLITE_TRANSIENT);sqlite3_free(uri);code=sqlite3_step(s);}sqlite3_finalize(s);return code==SQLITE_DONE?0:fail(sqlite3_errmsg(db));}
static int text_equals(sqlite3 *db,const char *sql,const char *expected){sqlite3_stmt *s=NULL;int result=-1;if(sqlite3_prepare_v2(db,sql,-1,&s,NULL)==SQLITE_OK&&sqlite3_step(s)==SQLITE_ROW){const char *v=(const char *)sqlite3_column_text(s,0);if(v&&!strcmp(v,expected))result=0;}sqlite3_finalize(s);return result;}
static int digits_suffix(const char *name,const char *prefix){size_t n=strlen(prefix);if(strncmp(name,prefix,n)||!name[n])return 0;for(const char *p=name+n;*p;p++)if(*p<'0'||*p>'9')return 0;return 1;}
static int title_key(const char *key,const char *prefix){size_t n=strlen(prefix);return !strcmp(key,prefix)||(strlen(key)==n+3&&!strncmp(key,prefix,n)&&key[n]=='_'&&key[n+1]>='0'&&key[n+1]<='9'&&key[n+2]>='0'&&key[n+2]<='9');}
static int allowed(Change *c){
    if(!strcmp(c->schema,"main")){
        if(!strcmp(c->table,"tbl_contentinfo"))return !strcmp(c->key,"titleId")&&!strcmp(c->value,TITLE)&&(!strcmp(c->column,"titleName")||!strcmp(c->column,"pprDeeplinkUri")||!strcmp(c->column,"icon0Info")||!strcmp(c->column,"AppInfoJson"));
        if(!strcmp(c->table,"tbl_conceptmetadata"))return !strcmp(c->key,"localConceptId")&&!strcmp(c->value,CONCEPT)&&(!strcmp(c->column,"conceptName")||!strcmp(c->column,"icon0Info")||!strcmp(c->column,"ConceptInfoJson"));
        if(digits_suffix(c->table,"tbl_iconinfo_"))return !strcmp(c->key,"titleId")&&!strcmp(c->value,TITLE)&&(!strcmp(c->column,"titleName")||!strcmp(c->column,"deeplinkUri"));
        if(digits_suffix(c->table,"tbl_concepticoninfo_"))return !strcmp(c->key,"primaryTitleId")&&!strcmp(c->value,TITLE)&&(!strcmp(c->column,"conceptName")||!strcmp(c->column,"primaryTitleName")||!strcmp(c->column,"deeplinkUri")||!strcmp(c->column,"icon0Info"));
    }else if(!strcmp(c->schema,"info")&&!strcmp(c->column,"val")){
        return (!strcmp(c->table,"tbl_appinfo")&&!strcmp(c->key,"titleId")&&!strcmp(c->value,TITLE))||(!strcmp(c->table,"tbl_conceptinfo")&&!strcmp(c->key,"local_concept_id")&&!strcmp(c->value,CONCEPT));
    }return 0;
}
static int strings_same(const unsigned char *a,const unsigned char *b){return (!a&&!b)||(a&&b&&!strcmp((const char *)a,(const char *)b));}
static const char *json_nodes_sql="WITH t AS(SELECT * FROM json_tree(?)) SELECT n.fullkey,n.type,n.atom,CASE WHEN n.parent=0 AND (n.key='TITLE' OR n.key GLOB 'TITLE_[0-9][0-9]') THEN 'name' WHEN n.parent=0 AND n.key='DEEPLINK_URI' THEN 'url' WHEN n.parent=0 AND n.key='icon0Info' THEN 'icon' WHEN n.key IN('data','size') AND p.type='object' AND g.type='array' AND g.key='field_list' AND (json_extract(p.value,'$.key')='concept_name' OR json_extract(p.value,'$.key') GLOB 'concept_name_[0-9][0-9]') THEN CASE WHEN n.key='size' THEN 'size_name' ELSE 'name' END WHEN n.key IN('data','size') AND p.type='object' AND g.type='array' AND g.key='field_list' AND json_extract(p.value,'$.key')='deeplink_uri' THEN CASE WHEN n.key='size' THEN 'size_url' ELSE 'url' END ELSE '' END FROM t n LEFT JOIN t p ON p.id=n.parent LEFT JOIN t g ON g.id=p.parent ORDER BY n.fullkey;";
static int json_scope(sqlite3 *db,const char *before,const char *after){
    const char *sql=json_nodes_sql;
    sqlite3_stmt *a=NULL,*b=NULL;int result=-1;
    if(!before||!after||sqlite3_prepare_v2(db,sql,-1,&a,NULL)!=SQLITE_OK||sqlite3_prepare_v2(db,sql,-1,&b,NULL)!=SQLITE_OK)goto done;
    sqlite3_bind_text(a,1,before,-1,SQLITE_TRANSIENT);sqlite3_bind_text(b,1,after,-1,SQLITE_TRANSIENT);
    for(;;){int ca=sqlite3_step(a),cb=sqlite3_step(b);if(ca==SQLITE_DONE&&cb==SQLITE_DONE){result=0;break;}if(ca!=SQLITE_ROW||cb!=SQLITE_ROW)break;
        if(!strings_same(sqlite3_column_text(a,0),sqlite3_column_text(b,0))||!strings_same(sqlite3_column_text(a,1),sqlite3_column_text(b,1))||!strings_same(sqlite3_column_text(a,3),sqlite3_column_text(b,3)))break;
        const char *role=(const char *)sqlite3_column_text(b,3);const char *expected=!strcmp(role,"name")?target_name:!strcmp(role,"url")?SITE:!strcmp(role,"icon")?ICON_URI:NULL;
        if(expected){const unsigned char *value=sqlite3_column_text(b,2);if(!value||strcmp((const char *)value,expected))break;}
        else if(!strcmp(role,"size_name")){if(sqlite3_column_int64(b,2)!=(sqlite3_int64)strlen(target_name))break;}
        else if(!strcmp(role,"size_url")){if(sqlite3_column_int64(b,2)!=(sqlite3_int64)strlen(SITE))break;}
        else if(!strings_same(sqlite3_column_text(a,2),sqlite3_column_text(b,2)))break;
    }
done:sqlite3_finalize(a);sqlite3_finalize(b);return result==0?0:fail("JSON plan changes unsupported fields or values");
}
static void free_changes(Change *changes,int count){for(int i=0;i<count;i++){free(changes[i].old);free(changes[i].new);}}
static int load_changes(sqlite3 *db,Change *changes,int *count){
    sqlite3_stmt *s=NULL;const char *sql="SELECT schema_name,table_name,key_column,key_value,row_id,column_name,old_value,new_value,n FROM plan.changes ORDER BY n;";
    if(sqlite3_prepare_v2(db,sql,-1,&s,NULL)!=SQLITE_OK)return fail(sqlite3_errmsg(db));int code;
    while((code=sqlite3_step(s))==SQLITE_ROW){
        if(*count>=128){sqlite3_finalize(s);return fail("Plan exceeds cell limit");}Change *c=&changes[*count];
        char *fields[]={c->schema,c->table,c->key,c->value,c->column};size_t capacities[]={sizeof(c->schema),sizeof(c->table),sizeof(c->key),sizeof(c->value),sizeof(c->column)};int indices[]={0,1,2,3,5};
        for(int i=0;i<5;i++){const char *v=(const char *)sqlite3_column_text(s,indices[i]);if(!v||strlen(v)>=capacities[i]){sqlite3_finalize(s);return fail("Invalid plan identifier");}strcpy(fields[i],v);}
        c->row=sqlite3_column_int64(s,4);c->n=sqlite3_column_int64(s,8);
        if(!allowed(c)||sqlite3_column_type(s,7)!=SQLITE_TEXT||sqlite3_column_bytes(s,7)>65536||(sqlite3_column_type(s,6)!=SQLITE_TEXT&&sqlite3_column_type(s,6)!=SQLITE_NULL)||sqlite3_column_bytes(s,6)>65536){sqlite3_finalize(s);return fail("Plan cell is outside the permitted Store fields");}
        const char *old=(const char *)sqlite3_column_text(s,6);c->old=old?strdup(old):NULL;c->new=strdup((const char *)sqlite3_column_text(s,7));(*count)++;
        if((old&&!c->old)||!c->new){sqlite3_finalize(s);return fail("Out of memory");}
        if(strstr(c->column,"Json")){if(json_scope(db,c->old,c->new)<0){sqlite3_finalize(s);return -1;}}
        else if(strcmp(c->column,"val")){
            const char *expected=strstr(c->column,"Name")?target_name:strstr(c->column,"Deeplink")||!strcmp(c->column,"deeplinkUri")?SITE:ICON_URI;
            if(strcmp(c->new,expected)){sqlite3_finalize(s);return fail("Unexpected replacement value");}
        }
    }sqlite3_finalize(s);return code==SQLITE_DONE&&*count>0?0:fail("Plan is empty or unreadable");
}
static int cell(sqlite3 *db,Change *c,int restore,int write_value){
    char *sql=NULL;
    if(write_value)sql=sqlite3_mprintf("UPDATE %s.\"%w\" SET \"%w\"=? WHERE rowid=? AND \"%w\"=? AND \"%w\" IS ?;",c->schema,c->table,c->column,c->key,c->column);
    else sql=sqlite3_mprintf("SELECT \"%w\",%s FROM %s.\"%w\" WHERE rowid=? AND \"%w\"=?;",c->column,!strcmp(c->schema,"info")?"key":"NULL",c->schema,c->table,c->key);
    if(!sql)return fail("Out of memory");sqlite3_stmt *s=NULL;int code=sqlite3_prepare_v2(db,sql,-1,&s,NULL);sqlite3_free(sql);if(code!=SQLITE_OK)return fail(sqlite3_errmsg(db));
    const char *expected=restore?c->new:c->old,*replacement=restore?c->old:c->new;int index=1;
    if(write_value){if(replacement)sqlite3_bind_text(s,index,replacement,-1,SQLITE_TRANSIENT);else sqlite3_bind_null(s,index);index++;}
    sqlite3_bind_int64(s,index++,c->row);sqlite3_bind_text(s,index++,c->value,-1,SQLITE_TRANSIENT);
    if(write_value){if(expected)sqlite3_bind_text(s,index,expected,-1,SQLITE_TRANSIENT);else sqlite3_bind_null(s,index);}
    code=sqlite3_step(s);int result=-1;
    if(write_value){if(code==SQLITE_DONE&&sqlite3_changes(db)==1)result=0;}
    else if(code==SQLITE_ROW&&strings_same(sqlite3_column_text(s,0),(const unsigned char *)expected)){
        result=0;
        if(!strcmp(c->schema,"info")){const char *key=(const char *)sqlite3_column_text(s,1);const char *new_value=NULL;if(key&&(title_key(key,"TITLE")||title_key(key,"concept_name")))new_value=target_name;else if(key&&(!strcmp(key,"DEEPLINK_URI")||!strcmp(key,"deeplink_uri")))new_value=SITE;if(!new_value||strcmp(c->new,new_value))result=-1;}
        if(sqlite3_step(s)!=SQLITE_DONE)result=-1;
    }
    sqlite3_finalize(s);return result==0?0:fail("Store metadata changed, is missing, or failed a guarded update");
}
/* Undo only our JSON leaves; preserve access times and unrelated shell updates. */
static int merge_json_restore(sqlite3 *db,Change *c){
    char *sql=sqlite3_mprintf("SELECT \"%w\" FROM %s.\"%w\" WHERE rowid=? AND \"%w\"=?;",c->column,c->schema,c->table,c->key);
    sqlite3_stmt *read=NULL,*diff=NULL;char *current=NULL,*merged=NULL;int result=-1;
    if(!sql||sqlite3_prepare_v2(db,sql,-1,&read,NULL)!=SQLITE_OK){sqlite3_free(sql);return fail("Cannot read current JSON for restore");}sqlite3_free(sql);
    sqlite3_bind_int64(read,1,c->row);sqlite3_bind_text(read,2,c->value,-1,SQLITE_TRANSIENT);
    if(sqlite3_step(read)==SQLITE_ROW&&sqlite3_column_type(read,0)==SQLITE_TEXT)current=strdup((const char *)sqlite3_column_text(read,0));sqlite3_finalize(read);
    if(!current)return fail("Current JSON metadata is missing");
    if(!strcmp(current,c->new)){free(current);return 0;}
    merged=strdup(current);if(!merged)goto done;
    const char *difference="SELECT a.fullkey,a.atom,b.atom,b.type FROM json_tree(?) a JOIN json_tree(?) b ON b.fullkey=a.fullkey WHERE a.type NOT IN('array','object') AND NOT(a.atom IS b.atom);";
    if(sqlite3_prepare_v2(db,difference,-1,&diff,NULL)!=SQLITE_OK)goto done;
    sqlite3_bind_text(diff,1,c->old,-1,SQLITE_TRANSIENT);sqlite3_bind_text(diff,2,c->new,-1,SQLITE_TRANSIENT);
    int code;
    while((code=sqlite3_step(diff))==SQLITE_ROW){
        const char *path=(const char *)sqlite3_column_text(diff,0),*type=(const char *)sqlite3_column_text(diff,3);sqlite3_stmt *guard=NULL,*patch=NULL;
        if(sqlite3_prepare_v2(db,"SELECT json_extract(?,?) IS ? AND json_type(?,?)=?;",-1,&guard,NULL)!=SQLITE_OK)goto done;
        sqlite3_bind_text(guard,1,current,-1,SQLITE_TRANSIENT);sqlite3_bind_text(guard,2,path,-1,SQLITE_TRANSIENT);sqlite3_bind_value(guard,3,sqlite3_column_value(diff,2));sqlite3_bind_text(guard,4,current,-1,SQLITE_TRANSIENT);sqlite3_bind_text(guard,5,path,-1,SQLITE_TRANSIENT);sqlite3_bind_text(guard,6,type,-1,SQLITE_TRANSIENT);
        int matches=sqlite3_step(guard)==SQLITE_ROW&&sqlite3_column_int(guard,0)==1;sqlite3_finalize(guard);if(!matches)goto done;
        if(sqlite3_prepare_v2(db,"SELECT json_set(?,?,?);",-1,&patch,NULL)!=SQLITE_OK)goto done;
        sqlite3_bind_text(patch,1,merged,-1,SQLITE_TRANSIENT);sqlite3_bind_text(patch,2,path,-1,SQLITE_TRANSIENT);sqlite3_bind_value(patch,3,sqlite3_column_value(diff,1));
        char *next=NULL;if(sqlite3_step(patch)==SQLITE_ROW&&sqlite3_column_type(patch,0)==SQLITE_TEXT)next=strdup((const char *)sqlite3_column_text(patch,0));sqlite3_finalize(patch);if(!next)goto done;free(merged);merged=next;
    }
    if(code!=SQLITE_DONE)goto done;
    free(c->new);free(c->old);c->new=current;c->old=merged;current=NULL;merged=NULL;result=0;
done:sqlite3_finalize(diff);free(current);free(merged);return result==0?0:fail("Patched JSON fields drifted; restore refused without overwriting them");
}
static char *renamed_json(sqlite3 *db,const char *value,const char *reference){
    sqlite3_stmt *nodes=NULL;char *changed=strdup(value);if(!changed)return NULL;
    if(sqlite3_prepare_v2(db,json_nodes_sql,-1,&nodes,NULL)!=SQLITE_OK){free(changed);return NULL;}sqlite3_bind_text(nodes,1,reference,-1,SQLITE_TRANSIENT);
    int code;
    while((code=sqlite3_step(nodes))==SQLITE_ROW){
        const char *role=(const char *)sqlite3_column_text(nodes,3);if(strcmp(role,"name")&&strcmp(role,"size_name"))continue;
        const char *path=(const char *)sqlite3_column_text(nodes,0);sqlite3_stmt *patch=NULL;
        if(sqlite3_prepare_v2(db,"SELECT json_set(?,?,?);",-1,&patch,NULL)!=SQLITE_OK){free(changed);changed=NULL;break;}
        sqlite3_bind_text(patch,1,changed,-1,SQLITE_TRANSIENT);sqlite3_bind_text(patch,2,path,-1,SQLITE_TRANSIENT);
        if(!strcmp(role,"name"))sqlite3_bind_text(patch,3,FULL_NAME,-1,SQLITE_STATIC);else sqlite3_bind_int64(patch,3,(sqlite3_int64)strlen(FULL_NAME));
        char *next=NULL;if(sqlite3_step(patch)==SQLITE_ROW&&sqlite3_column_type(patch,0)==SQLITE_TEXT)next=strdup((const char *)sqlite3_column_text(patch,0));sqlite3_finalize(patch);
        free(changed);changed=next;if(!changed)break;
    }
    if(code!=SQLITE_DONE){free(changed);changed=NULL;}sqlite3_finalize(nodes);return changed;
}
static int rename_cells(sqlite3 *db,Change *changes,int count){
    for(int i=0;i<count;i++){
        Change *c=&changes[i];char *new_actual=NULL,*new_baseline=NULL;
        if(strstr(c->column,"Json")){
            sqlite3_stmt *read=NULL;char *baseline=NULL;
            if(sqlite3_prepare_v2(db,"SELECT new_value FROM plan.changes WHERE n=?;",-1,&read,NULL)!=SQLITE_OK)return fail("Cannot read rename baseline");sqlite3_bind_int64(read,1,c->n);
            if(sqlite3_step(read)==SQLITE_ROW&&sqlite3_column_type(read,0)==SQLITE_TEXT)baseline=strdup((const char *)sqlite3_column_text(read,0));sqlite3_finalize(read);
            if(!baseline)return fail("Missing JSON rename baseline");new_actual=renamed_json(db,c->new,baseline);new_baseline=renamed_json(db,baseline,baseline);free(baseline);
        }else if(!strcmp(c->new,target_name)){new_actual=strdup(FULL_NAME);new_baseline=strdup(FULL_NAME);}
        else continue;
        if(!new_actual||!new_baseline){free(new_actual);free(new_baseline);return fail("Cannot prepare renamed metadata");}
        Change delta=*c;delta.old=c->new;delta.new=new_actual;
        int result=cell(db,&delta,0,1);free(new_actual);if(result<0){free(new_baseline);return -1;}
        sqlite3_stmt *save=NULL;if(sqlite3_prepare_v2(db,"UPDATE plan.changes SET new_value=? WHERE n=?;",-1,&save,NULL)!=SQLITE_OK){free(new_baseline);return fail("Cannot update recovery baseline");}
        sqlite3_bind_text(save,1,new_baseline,-1,SQLITE_TRANSIENT);sqlite3_bind_int64(save,2,c->n);int code=sqlite3_step(save);sqlite3_finalize(save);free(new_baseline);if(code!=SQLITE_DONE||sqlite3_changes(db)!=1)return fail("Cannot commit recovery baseline for renamed tile");
    }
    return run(db,"INSERT OR REPLACE INTO plan.meta VALUES('name','PSN-HUB JAILBREAK');");
}
static int copy_database(sqlite3 *db,const char *schema,const char *path){
    int fd=open(path,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW,0600);if(fd<0)return fail("Cannot create fresh backup file");close(fd);
    sqlite3 *backup=NULL;if(sqlite3_open_v2(path,&backup,SQLITE_OPEN_READWRITE|SQLITE_OPEN_NOFOLLOW,NULL)!=SQLITE_OK){if(backup)sqlite3_close(backup);return fail("Cannot open backup file");}
    sqlite3_backup *job=sqlite3_backup_init(backup,"main",db,schema);int code=job?sqlite3_backup_step(job,-1):SQLITE_ERROR;int ended=job?sqlite3_backup_finish(job):SQLITE_ERROR;
    int result=code==SQLITE_DONE&&ended==SQLITE_OK&&text_equals(backup,"PRAGMA quick_check;","ok")==0?0:-1;
    sqlite3_close(backup);fd=open(path,O_RDONLY|O_NOFOLLOW);if(fd<0||fsync(fd)<0)result=-1;if(fd>=0)close(fd);return result==0?0:fail("SQLite backup or its integrity check failed");
}
static int approved(int root,const char *plan_path,int rename){int fd=open(plan_path,O_RDONLY|O_NOFOLLOW);char hash[65],name[96];if(fd<0)return fail("Cannot hash plan");int code=hub_hash(fd,hash);close(fd);if(code<0)return fail("Cannot hash plan");snprintf(name,sizeof(name),"%s-%s.txt",rename?"rename":"approve",hash);fd=openat(root,name,O_RDONLY|O_NOFOLLOW);if(fd<0)return fail("No approval marker matches this exact plan");char data[128];const char *expected=rename?"RENAME NPXS40047\nPSN-HUB JAILBREAK\n":APPROVAL;ssize_t count=read(fd,data,sizeof(data));close(fd);if(count!=(ssize_t)strlen(expected)||memcmp(data,expected,strlen(expected)))return fail("Approval marker is invalid");return 0;}
static int operate(const char *root_path,const char *app,const char *info,const char *icon,int restore,int rename){
    char plan_path[1200];if(snprintf(plan_path,sizeof(plan_path),"%s/plan.db",root_path)>=(int)sizeof(plan_path))return fail("Path too long");
    int root=hub_open_path(root_path,0);if(root<0)return fail("Test directory is missing or unsafe");
    if(!restore&&approved(root,plan_path,rename)<0){close(root);return -1;}
    sqlite3 *db=NULL;Change changes[128];memset(changes,0,sizeof(changes));int count=0,result=-1,in_transaction=0;
    if(!regular(app)||!regular(info)||!regular(plan_path)){fail("Database path missing or not a regular file");goto done;}
    if(sqlite3_open_v2(app,&db,SQLITE_OPEN_READWRITE|SQLITE_OPEN_NOFOLLOW|SQLITE_OPEN_URI,NULL)!=SQLITE_OK){fail("Cannot open app.db for transaction");goto done;}
    sqlite3_busy_timeout(db,5000);
    if(attach(db,info,"ATTACH DATABASE ? AS info;")<0||attach(db,plan_path,"ATTACH DATABASE ? AS plan;")<0)goto done;
    if(text_equals(db,"SELECT val FROM plan.meta WHERE key='format';","1")<0||text_equals(db,"SELECT val FROM plan.meta WHERE key='titleId';",TITLE)<0||text_equals(db,"SELECT val FROM plan.meta WHERE key='url';",SITE)<0||(!restore&&!rename&&text_equals(db,"SELECT val FROM plan.meta WHERE key='iconSha256';",SHORTCUT_ICON_SHA256)<0)||text_equals(db,"SELECT val FROM plan.meta WHERE key='state';",(restore||rename)?"applied":"prepared")<0){fail("Plan format, target, icon, URL or state is not the approved test");goto done;}
    sqlite3_stmt *name_stmt=NULL;
    if(sqlite3_prepare_v2(db,"SELECT val FROM plan.meta WHERE key='name';",-1,&name_stmt,NULL)!=SQLITE_OK){fail("Cannot read shortcut name");goto done;}
    int name_code=sqlite3_step(name_stmt);const char *plan_name=name_code==SQLITE_ROW?(const char *)sqlite3_column_text(name_stmt,0):name_code==SQLITE_DONE?"PSN-HUB":NULL;
    if(!plan_name||(strcmp(plan_name,"PSN-HUB")&&strcmp(plan_name,FULL_NAME))){sqlite3_finalize(name_stmt);fail("Unsupported shortcut name");goto done;}snprintf(target_name,sizeof(target_name),"%s",plan_name);sqlite3_finalize(name_stmt);
    for(int i=0;i<3;i++){const char *sql=i==0?"PRAGMA main.journal_mode;":i==1?"PRAGMA info.journal_mode;":"PRAGMA plan.journal_mode;";if(text_equals(db,sql,"delete")<0){fail("Atomic test requires DELETE journaling for every database");goto done;}}
    if(run(db,"PRAGMA main.synchronous=FULL; PRAGMA info.synchronous=FULL; PRAGMA plan.synchronous=FULL;")<0||load_changes(db,changes,&count)<0)goto done;
    if(!restore){
        if(!rename){int fd=open(icon,O_RDONLY|O_NOFOLLOW);char hash[65];if(fd<0||hub_hash(fd,hash)<0||strcmp(hash,SHORTCUT_ICON_SHA256)){if(fd>=0)close(fd);fail("Staged icon does not match the reviewed PNG");goto done;}close(fd);}
        char name[96],backup_dir[1400],a[1500],b[1500];struct timespec now;if(clock_gettime(CLOCK_REALTIME,&now)<0){fail("Cannot create backup timestamp");goto done;}snprintf(name,sizeof(name),"backup-%lld-%09ld",(long long)now.tv_sec,now.tv_nsec);
        if(mkdirat(root,name,0700)<0){fail("Cannot create a new backup directory");goto done;}snprintf(backup_dir,sizeof(backup_dir),"%s/%s",root_path,name);snprintf(a,sizeof(a),"%s/app.db",backup_dir);snprintf(b,sizeof(b),"%s/appinfo.db",backup_dir);
        if(run(db,"BEGIN; SELECT name FROM main.sqlite_master LIMIT 1; SELECT name FROM info.sqlite_master LIMIT 1;")<0)goto done;in_transaction=1;
        if(copy_database(db,"main",a)<0||copy_database(db,"info",b)<0)goto done;
        int backup_fd=hub_child(root,name,0);if(backup_fd<0||fsync(backup_fd)<0||fsync(root)<0){if(backup_fd>=0)close(backup_fd);fail("Backup directory sync failed");goto done;}close(backup_fd);
        if(run(db,"COMMIT;")<0)goto done;in_transaction=0;
        sqlite3_stmt *meta=NULL;if(sqlite3_prepare_v2(db,rename?"INSERT OR REPLACE INTO plan.meta VALUES('renameBackupDirectory',?);":"INSERT OR REPLACE INTO plan.meta VALUES('backupDirectory',?);",-1,&meta,NULL)!=SQLITE_OK){fail(sqlite3_errmsg(db));goto done;}sqlite3_bind_text(meta,1,backup_dir,-1,SQLITE_TRANSIENT);int rc=sqlite3_step(meta);sqlite3_finalize(meta);if(rc!=SQLITE_DONE){fail("Cannot record backup directory");goto done;}
    }
    if(run(db,"BEGIN IMMEDIATE;")<0)goto done;in_transaction=1;
    if(text_equals(db,"PRAGMA main.journal_mode;","delete")<0||text_equals(db,"PRAGMA info.journal_mode;","delete")<0||text_equals(db,"PRAGMA plan.journal_mode;","delete")<0){fail("Journal mode changed before transaction");goto done;}
    if(restore||rename)for(int i=0;i<count;i++)if(strstr(changes[i].column,"Json")&&merge_json_restore(db,&changes[i])<0)goto done;
    for(int i=0;i<count;i++)if(cell(db,&changes[i],restore||rename,0)<0)goto done;
    if(rename){if(rename_cells(db,changes,count)<0)goto done;}
    else for(int i=0;i<count;i++)if(cell(db,&changes[i],restore,1)<0)goto done;
    if((restore?hub_media_restore(db):hub_media_hide(db))<0){fail("Media jailbreak visibility update failed; transaction canceled");goto done;}
    if(text_equals(db,"PRAGMA main.quick_check;","ok")<0||text_equals(db,"PRAGMA info.quick_check;","ok")<0){fail("Database integrity check failed before commit");goto done;}
    if(run(db,restore?"UPDATE plan.meta SET val='restored' WHERE key='state';":"UPDATE plan.meta SET val='applied' WHERE key='state';")<0||run(db,"COMMIT;")<0)goto done;in_transaction=0;if(rename)snprintf(target_name,sizeof(target_name),"%s",FULL_NAME);result=0;
done:
    if(in_transaction&&db)sqlite3_exec(db,"ROLLBACK;",NULL,NULL,NULL);
    free_changes(changes,count);if(db)sqlite3_close(db);close(root);return result;
}
static void quoted(Buffer *out,const char *value){buf_add(out,"\"");for(const unsigned char *p=(const unsigned char *)value;*p;p++){if(*p=='"'||*p=='\\')buf_add(out,"\\%c",*p);else if(*p<32)buf_add(out,"\\u%04x",*p);else buf_add(out,"%c",*p);}buf_add(out,"\"");}
int hub_store_run(const char *test_root,int restore,int rename,Buffer *report){
 const char *root="/data/psn-hub-store-test",*app="/system_data/priv/mms/app.db",*info="/system_data/priv/mms/appinfo.db",*icon="/user/appmeta/NPXS40047/psn-hub-icon.png";
#ifdef HUB_HOST_TEST
 char a[1200],b[1200],c[1200];root=test_root;snprintf(a,sizeof(a),"%s/app.db",root);snprintf(b,sizeof(b),"%s/appinfo.db",root);snprintf(c,sizeof(c),"%s/psn-hub-icon.png",root);app=a;info=b;icon=c;
#else
 (void)test_root;
#endif
 snprintf(target_name,sizeof(target_name),"%s",FULL_NAME);snprintf(problem,sizeof(problem),"A matching reviewed Store recovery plan is required.");int result=operate(root,app,info,icon,restore,rename);
 buf_add(report,"{\"success\":%s,\"operation\":\"%s\",\"message\":",result==0?"true":"false",rename?"rename-store":restore?"restore-store":"apply-store");quoted(report,result==0?"Reviewed Store metadata operation completed. Refresh the home screen manually.":problem);buf_add(report,"}");return result;
}
#ifndef HUB_EMBEDDED
int main(int argc,char **argv){
    const char *root="/data/psn-hub-store-test",*app="/system_data/priv/mms/app.db",*info="/system_data/priv/mms/appinfo.db",*icon="/user/appmeta/NPXS40047/psn-hub-icon.png";int restore=0,rename=0;
#ifdef HUB_HOST_TEST
    if(argc<3)return 2;root=argv[1];restore=!strcmp(argv[2],"restore");rename=!strcmp(argv[2],"rename");char a[1200],b[1200],c[1200];snprintf(a,sizeof(a),"%s/app.db",root);snprintf(b,sizeof(b),"%s/appinfo.db",root);snprintf(c,sizeof(c),"%s/psn-hub-icon.png",root);app=a;info=b;icon=c;
#else
    (void)argc;(void)argv;
#ifdef HUB_SHORTCUT_RESTORE
    restore=1;
#endif
#ifdef HUB_SHORTCUT_RENAME
    rename=1;
#endif
#endif
    int result=operate(root,app,info,icon,restore,rename);Buffer message={0};buf_add(&message,"{\"success\":%s,\"operation\":\"%s\",\"titleId\":\"%s\",\"name\":\"%s\",\"url\":\"%s\",\"message\":",result==0?"true":"false",rename?"rename":restore?"restore":"apply",TITLE,target_name,SITE);quoted(&message,result==0?(restore?"Original Store metadata restored. Reboot manually to refresh the shell.":"Store metadata committed. Backups are recorded in plan.db. Reboot manually to test the tile."):problem);buf_add(&message,"}");
    int folder=hub_open_path(root,0);if(folder>=0){hub_atomic(folder,"result.json",-1,message.len,(const unsigned char *)message.data,message.len);close(folder);}if(message.data)printf("%s\n",message.data);buf_free(&message);return result==0?0:1;
}

#endif
