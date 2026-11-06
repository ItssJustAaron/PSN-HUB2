/* SPDX-License-Identifier: GPL-3.0-or-later
 * Reversible artwork-only update for the already configured PSN-HUB Store tile.
 */
#define _DEFAULT_SOURCE
#include "hub.h"
#include "shortcut_background.h"
#include <sqlite3.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <sys/select.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <fcntl.h>
#include <errno.h>
#include <limits.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <unistd.h>
#define TITLE "NPXS40047"
#define CONCEPT "cid:local:NPXS40047"
#define SITE "https://itssjustaaron.github.io/PSN-HUB2/"
static char problem[400]="Background update failed";
static int changed;
static int fail(const char *why){snprintf(problem,sizeof(problem),"%s",why);return -1;}
static int fail_io(const char *why){int saved=errno;snprintf(problem,sizeof(problem),"%s (errno %d: %s)",why,saved,strerror(saved));return -1;}
static int sql(sqlite3 *db,const char *text){return sqlite3_exec(db,text,NULL,NULL,NULL)==SQLITE_OK?0:fail(sqlite3_errmsg(db));}
static int equals(sqlite3 *db,const char *text,const char *value){sqlite3_stmt *s=NULL;int ok=sqlite3_prepare_v2(db,text,-1,&s,NULL)==SQLITE_OK&&sqlite3_step(s)==SQLITE_ROW;const char *got=ok?(const char *)sqlite3_column_text(s,0):NULL;ok=got&&!strcmp(got,value);sqlite3_finalize(s);return ok;}
static int attach(sqlite3 *db,const char *path,const char *statement){sqlite3_stmt *s=NULL;int code=sqlite3_prepare_v2(db,statement,-1,&s,NULL);if(code==SQLITE_OK){char *uri=sqlite3_mprintf("file:%s?mode=rw",path);if(!uri){sqlite3_finalize(s);return -1;}sqlite3_bind_text(s,1,uri,-1,SQLITE_TRANSIENT);sqlite3_free(uri);code=sqlite3_step(s);}sqlite3_finalize(s);return code==SQLITE_DONE?0:fail("Cannot attach existing database");}
static int suffix(const char *s,const char *prefix){size_t n=strlen(prefix);if(strncmp(s,prefix,n)||!s[n])return 0;for(s+=n;*s;s++)if(*s<'0'||*s>'9')return 0;return 1;}
static int permitted(const char *table,const char *key,const char *value,const char *column){
    if(!strcmp(table,"tbl_contentinfo"))return !strcmp(key,"titleId")&&!strcmp(value,TITLE)&&(!strcmp(column,"pic0Info")||!strcmp(column,"pic1Info")||!strcmp(column,"AppInfoJson"));
    if(!strcmp(table,"tbl_conceptmetadata"))return !strcmp(key,"localConceptId")&&!strcmp(value,CONCEPT)&&!strcmp(column,"pic0Info");
    return suffix(table,"tbl_concepticoninfo_")&&!strcmp(key,"primaryTitleId")&&!strcmp(value,TITLE)&&!strcmp(column,"pic0Info");
}
static int column_exists(sqlite3 *db,const char *table,const char *column){char *text=sqlite3_mprintf("PRAGMA main.table_info(\"%w\");",table);sqlite3_stmt *s=NULL;int found=0;if(text&&sqlite3_prepare_v2(db,text,-1,&s,NULL)==SQLITE_OK)while(sqlite3_step(s)==SQLITE_ROW){const char *c=(const char *)sqlite3_column_text(s,1);if(c&&!strcmp(c,column))found=1;}sqlite3_free(text);sqlite3_finalize(s);return found;}
static char *json_art(sqlite3 *db,const char *current,const char *baseline,int restore){
    if(!current||!baseline)return NULL;sqlite3_stmt *valid=NULL;
    if(sqlite3_prepare_v2(db,"SELECT json_valid(?) AND json_type(?)='object' AND json_valid(?) AND json_type(?)='object';",-1,&valid,NULL)!=SQLITE_OK)return NULL;
    sqlite3_bind_text(valid,1,current,-1,SQLITE_TRANSIENT);sqlite3_bind_text(valid,2,current,-1,SQLITE_TRANSIENT);sqlite3_bind_text(valid,3,baseline,-1,SQLITE_TRANSIENT);sqlite3_bind_text(valid,4,baseline,-1,SQLITE_TRANSIENT);
    int ok=sqlite3_step(valid)==SQLITE_ROW&&sqlite3_column_int(valid,0);sqlite3_finalize(valid);if(!ok)return NULL;char *out=strdup(current);
    const char *paths[]={"$.pic0Info","$.pic1Info"};
    for(int i=0;i<2&&out;i++){sqlite3_stmt *read=NULL,*patch=NULL;
      if(sqlite3_prepare_v2(db,"SELECT json_type(?,?),json_extract(?,?),json_extract(?,?);",-1,&read,NULL)!=SQLITE_OK){free(out);return NULL;}
      sqlite3_bind_text(read,1,baseline,-1,SQLITE_TRANSIENT);sqlite3_bind_text(read,2,paths[i],-1,SQLITE_STATIC);sqlite3_bind_text(read,3,baseline,-1,SQLITE_TRANSIENT);sqlite3_bind_text(read,4,paths[i],-1,SQLITE_STATIC);sqlite3_bind_text(read,5,current,-1,SQLITE_TRANSIENT);sqlite3_bind_text(read,6,paths[i],-1,SQLITE_STATIC);
      if(sqlite3_step(read)!=SQLITE_ROW){sqlite3_finalize(read);free(out);return NULL;}
      const char *type=(const char *)sqlite3_column_text(read,0);if(!type){sqlite3_finalize(read);continue;}
      if((strcmp(type,"text")&&strcmp(type,"null"))||(restore&&(!sqlite3_column_text(read,2)||strcmp((const char *)sqlite3_column_text(read,2),BACKGROUND_URI)))){sqlite3_finalize(read);free(out);return NULL;}
      if(sqlite3_prepare_v2(db,"SELECT json_set(?,?,?);",-1,&patch,NULL)!=SQLITE_OK){sqlite3_finalize(read);free(out);return NULL;}
      sqlite3_bind_text(patch,1,out,-1,SQLITE_TRANSIENT);sqlite3_bind_text(patch,2,paths[i],-1,SQLITE_STATIC);if(restore)sqlite3_bind_value(patch,3,sqlite3_column_value(read,1));else sqlite3_bind_text(patch,3,BACKGROUND_URI,-1,SQLITE_STATIC);
      char *next=sqlite3_step(patch)==SQLITE_ROW?strdup((const char *)sqlite3_column_text(patch,0)):NULL;sqlite3_finalize(patch);sqlite3_finalize(read);free(out);out=next;
    }return out;
}
static int write_cell(sqlite3 *db,const char *table,const char *key,const char *value,sqlite3_int64 row,const char *column,const char *old,const char *next){
    if(!permitted(table,key,value,column))return fail("Artwork cell is outside the Store scope");
    char *text=sqlite3_mprintf("UPDATE main.\"%w\" SET \"%w\"=? WHERE rowid=? AND \"%w\"=? AND \"%w\" IS ?;",table,column,key,column);sqlite3_stmt *s=NULL;
    int code=text?sqlite3_prepare_v2(db,text,-1,&s,NULL):SQLITE_NOMEM;sqlite3_free(text);
    if(code==SQLITE_OK){if(next)sqlite3_bind_text(s,1,next,-1,SQLITE_TRANSIENT);else sqlite3_bind_null(s,1);sqlite3_bind_int64(s,2,row);sqlite3_bind_text(s,3,value,-1,SQLITE_TRANSIENT);if(old)sqlite3_bind_text(s,4,old,-1,SQLITE_TRANSIENT);else sqlite3_bind_null(s,4);code=sqlite3_step(s);}
    int ok=code==SQLITE_DONE&&sqlite3_changes(db)==1;sqlite3_finalize(s);return ok?0:fail("Store artwork changed or guarded update failed");
}
static int record_table(sqlite3 *db,const char *table,const char *key,const char *value,const char *column){
    if(!column_exists(db,table,column))return 0;if(!permitted(table,key,value,column))return -1;
    char *text=sqlite3_mprintf("SELECT rowid,\"%w\" FROM main.\"%w\" WHERE \"%w\"=?;",column,table,key);sqlite3_stmt *read=NULL;int result=-1;
    if(!text||sqlite3_prepare_v2(db,text,-1,&read,NULL)!=SQLITE_OK){sqlite3_free(text);return fail("Cannot read Store artwork");}sqlite3_free(text);sqlite3_bind_text(read,1,value,-1,SQLITE_STATIC);int code,count=0;
    while((code=sqlite3_step(read))==SQLITE_ROW){if(++count>1||sqlite3_column_bytes(read,1)>65536||(sqlite3_column_type(read,1)!=SQLITE_TEXT&&sqlite3_column_type(read,1)!=SQLITE_NULL))goto done;
      sqlite3_int64 row=sqlite3_column_int64(read,0);const char *old=(const char *)sqlite3_column_text(read,1);char *next=!strcmp(column,"AppInfoJson")?json_art(db,old,old,0):strdup(BACKGROUND_URI);if(!next)goto done;
      if(old&&!strcmp(old,next)){free(next);continue;}sqlite3_stmt *insert=NULL;
      if(sqlite3_prepare_v2(db,"INSERT INTO plan.changes(table_name,key_name,key_value,row_id,column_name,old_value,new_value) VALUES(?,?,?,?,?,?,?);",-1,&insert,NULL)!=SQLITE_OK){free(next);goto done;}
      sqlite3_bind_text(insert,1,table,-1,SQLITE_STATIC);sqlite3_bind_text(insert,2,key,-1,SQLITE_STATIC);sqlite3_bind_text(insert,3,value,-1,SQLITE_STATIC);sqlite3_bind_int64(insert,4,row);sqlite3_bind_text(insert,5,column,-1,SQLITE_STATIC);if(old)sqlite3_bind_text(insert,6,old,-1,SQLITE_TRANSIENT);else sqlite3_bind_null(insert,6);sqlite3_bind_text(insert,7,next,-1,SQLITE_TRANSIENT);
      int saved=sqlite3_step(insert)==SQLITE_DONE;sqlite3_finalize(insert);if(!saved||write_cell(db,table,key,value,row,column,old,next)<0){free(next);goto done;}free(next);changed++;
    }result=code==SQLITE_DONE?0:-1;
done:sqlite3_finalize(read);return result==0?0:fail("Unsupported or changed Store artwork record");
}
static int replay(sqlite3 *db,int restore){
    sqlite3_stmt *s=NULL;if(sqlite3_prepare_v2(db,"SELECT table_name,key_name,key_value,row_id,column_name,old_value,new_value FROM plan.changes ORDER BY n;",-1,&s,NULL)!=SQLITE_OK)return -1;int code,result=-1,count=0;
    while((code=sqlite3_step(s))==SQLITE_ROW){if(++count>64)goto done;const char *table=(const char *)sqlite3_column_text(s,0),*key=(const char *)sqlite3_column_text(s,1),*value=(const char *)sqlite3_column_text(s,2),*column=(const char *)sqlite3_column_text(s,4),*old=(const char *)sqlite3_column_text(s,5),*next=(const char *)sqlite3_column_text(s,6);sqlite3_int64 row=sqlite3_column_int64(s,3);
      if(!table||!key||!value||!column||!next||!permitted(table,key,value,column)||sqlite3_column_bytes(s,5)>65536||sqlite3_column_bytes(s,6)>65536||(sqlite3_column_type(s,5)!=SQLITE_TEXT&&sqlite3_column_type(s,5)!=SQLITE_NULL)||sqlite3_column_type(s,6)!=SQLITE_TEXT)goto done;
      if(strcmp(column,"AppInfoJson")&&strcmp(next,BACKGROUND_URI))goto done;
      char *text=sqlite3_mprintf("SELECT \"%w\" FROM main.\"%w\" WHERE rowid=? AND \"%w\"=?;",column,table,key);sqlite3_stmt *read=NULL;char *current=NULL,*replacement=NULL;int is_null=0;
      if(!text||sqlite3_prepare_v2(db,text,-1,&read,NULL)!=SQLITE_OK){sqlite3_free(text);goto done;}sqlite3_free(text);sqlite3_bind_int64(read,1,row);sqlite3_bind_text(read,2,value,-1,SQLITE_TRANSIENT);
      if(sqlite3_step(read)!=SQLITE_ROW){sqlite3_finalize(read);goto done;}is_null=sqlite3_column_type(read,0)==SQLITE_NULL;if(!is_null)current=strdup((const char *)sqlite3_column_text(read,0));sqlite3_finalize(read);if(!is_null&&!current)goto done;
      if(!strcmp(column,"AppInfoJson")){char *expected=json_art(db,old,old,0);int valid=expected&&!strcmp(expected,next);free(expected);if(!valid){free(current);goto done;}replacement=restore&&current&&!strcmp(current,next)?strdup(old):json_art(db,current,old,restore);if(!replacement){free(current);goto done;}if(!restore){free(replacement);replacement=NULL;char *check=json_art(db,current,old,1);if(!check){free(current);goto done;}free(check);}}
      else if(!current||strcmp(current,next)){free(current);goto done;}
      if(restore&&write_cell(db,table,key,value,row,column,current,!strcmp(column,"AppInfoJson")?replacement:old)<0){free(current);free(replacement);goto done;}
      free(current);free(replacement);changed++;
    }result=code==SQLITE_DONE&&count>0?0:-1;
done:sqlite3_finalize(s);return result==0?0:fail("Artwork recovery refused: recorded cells drifted or ledger scope is invalid");
}
static int backup(const char *source,const char *destination){
    sqlite3 *from=NULL,*to=NULL;sqlite3_backup *copy=NULL;int ok=0;
    if(sqlite3_open_v2(source,&from,SQLITE_OPEN_READONLY|SQLITE_OPEN_NOFOLLOW,NULL)!=SQLITE_OK||sqlite3_open_v2(destination,&to,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE|SQLITE_OPEN_NOFOLLOW,NULL)!=SQLITE_OK)goto done;
    copy=sqlite3_backup_init(to,"main",from,"main");if(!copy)goto done;int code=sqlite3_backup_step(copy,-1),finish=sqlite3_backup_finish(copy);copy=NULL;ok=code==SQLITE_DONE&&finish==SQLITE_OK&&equals(to,"PRAGMA quick_check;","ok");
done:if(copy)sqlite3_backup_finish(copy);if(from)sqlite3_close(from);if(to&&sqlite3_close(to)!=SQLITE_OK)ok=0;if(!ok)return fail("Cannot create consistent database backup");int fd=open(destination,O_RDONLY|O_NOFOLLOW);if(fd<0)return -1;int result=fsync(fd);close(fd);return result;
}
static int art_directory(const char *path){
    char resolved[PATH_MAX];
    if(!realpath(path,resolved)){
      if(errno!=ENOENT)return fail_io("Cannot resolve the Store artwork directory");
      char parent[PATH_MAX];if(strlen(path)>=sizeof(parent))return fail("Artwork path is too long");strcpy(parent,path);char *slash=strrchr(parent,'/');if(!slash||!slash[1])return -1;char leaf[128];if(strlen(slash+1)>=sizeof(leaf))return -1;strcpy(leaf,slash+1);*slash=0;
      if(!realpath(parent,resolved))return fail_io("Cannot resolve the artwork parent");
#ifndef HUB_HOST_TEST
      if(strcmp(resolved,"/user/appmeta")&&strcmp(resolved,"/system_data/priv/appmeta")&&strcmp(resolved,"/system_data/priv/mms/appmeta")){snprintf(problem,sizeof(problem),"Unsupported artwork parent mapping: %.260s",resolved);return -1;}
#endif
      int parent_fd=hub_open_path(resolved,0);if(parent_fd<0)return fail_io("Cannot open the resolved artwork parent");
      if(mkdirat(parent_fd,leaf,0755)<0&&errno!=EEXIST){close(parent_fd);return fail_io("Cannot create the Store artwork directory");}
      int folder=hub_child(parent_fd,leaf,0);close(parent_fd);return folder<0?fail_io("Cannot open the Store artwork directory"):folder;
    }
#ifndef HUB_HOST_TEST
    if(strcmp(resolved,"/user/appmeta/NPXS40047")&&strcmp(resolved,"/system_data/priv/appmeta/NPXS40047")&&strcmp(resolved,"/system_data/priv/mms/appmeta/NPXS40047")){snprintf(problem,sizeof(problem),"Unsupported Store artwork mapping: %.260s",resolved);return -1;}
#endif
    int folder=hub_open_path(resolved,0);return folder<0?fail_io("Cannot open the resolved Store artwork directory"):folder;
}
static int asset(int folder){
    int file=openat(folder,BACKGROUND_FILE,O_RDONLY|O_NOFOLLOW|O_NONBLOCK);char hash[65];struct stat st;
    if(file>=0){
      if(fstat(file,&st)<0){close(file);return fail_io("Cannot stat the staged background");}
      if(!S_ISREG(st.st_mode)){close(file);return fail("Staged background is not a regular file");}
      if(hub_hash(file,hash)<0){close(file);return fail_io("Cannot hash the staged background");}
      if(strcmp(hash,BACKGROUND_SHA256)){close(file);snprintf(problem,sizeof(problem),"Staged background checksum differs: %.64s, size %lld",hash,(long long)st.st_size);return -1;}
      if(fchmod(file,0644)<0){int saved=errno;close(file);errno=saved;return fail_io("Cannot set staged background read permissions");}
      close(file);return 0;
    }
    if(errno!=ENOENT)return fail_io("Cannot read the background destination");
    if(hub_atomic(folder,BACKGROUND_FILE,-1,sizeof(background_png),background_png,sizeof(background_png))<0)return fail_io("Cannot write and sync the background PNG");
    file=openat(folder,BACKGROUND_FILE,O_RDONLY|O_NOFOLLOW);int ok=file>=0&&hub_hash(file,hash)==0&&!strcmp(hash,BACKGROUND_SHA256);if(ok&&(fchmod(file,0644)<0||fsync(file)<0))ok=0;if(file>=0)close(file);return ok?0:fail_io("Cannot verify readable background PNG");
}
static int operate(const char *root_path,const char *app,const char *info,const char *art_path,int restore){
    int root=hub_open_path(root_path,1),art=-1,lock=-1,in_tx=0,result=-1;sqlite3 *db=NULL,*ledger=NULL;char plan[1200];struct stat st;
    if(root<0)return fail("Cannot open private recovery directory");lock=openat(root,"lock",O_CREAT|O_RDWR|O_NOFOLLOW,0600);if(lock<0||flock(lock,LOCK_EX|LOCK_NB)<0){fail("Artwork updater is already running");goto done;}
    snprintf(plan,sizeof(plan),"%s/background-%.12s.db",root_path,BACKGROUND_SHA256);
    if(restore&&lstat(plan,&st)<0){fail("No background recovery record exists for this artwork");goto done;}
    if(sqlite3_open_v2(plan,&ledger,SQLITE_OPEN_READWRITE|SQLITE_OPEN_CREATE|SQLITE_OPEN_NOFOLLOW,NULL)!=SQLITE_OK){fail("Cannot open artwork recovery ledger");goto done;}
    if(sql(ledger,"CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,val TEXT);CREATE TABLE IF NOT EXISTS changes(n INTEGER PRIMARY KEY,table_name TEXT,key_name TEXT,key_value TEXT,row_id INTEGER,column_name TEXT,old_value,new_value);")<0)goto done;sqlite3_close(ledger);ledger=NULL;
    if(lstat(app,&st)<0||!S_ISREG(st.st_mode)||lstat(info,&st)<0||!S_ISREG(st.st_mode)){fail("Console database is missing or not regular");goto done;}
    if(sqlite3_open_v2(app,&db,SQLITE_OPEN_READWRITE|SQLITE_OPEN_NOFOLLOW|SQLITE_OPEN_URI,NULL)!=SQLITE_OK||attach(db,info,"ATTACH DATABASE ? AS info;")<0||attach(db,plan,"ATTACH DATABASE ? AS plan;")<0)goto done;
    sqlite3_busy_timeout(db,5000);if(!equals(db,"PRAGMA main.journal_mode;","delete")||!equals(db,"PRAGMA info.journal_mode;","delete")||!equals(db,"PRAGMA plan.journal_mode;","delete")){fail("Artwork update requires DELETE journaling");goto done;}
    if(sql(db,"PRAGMA main.synchronous=FULL;PRAGMA info.synchronous=FULL;PRAGMA plan.synchronous=FULL;BEGIN IMMEDIATE;")<0)goto done;in_tx=1;
    if(restore){if(!equals(db,"SELECT val FROM plan.meta WHERE key='state';","applied")||!equals(db,"SELECT val FROM plan.meta WHERE key='sha256';",BACKGROUND_SHA256)||replay(db,1)<0)goto done;}
    else{
      if(!equals(db,"SELECT pprDeeplinkUri FROM main.tbl_contentinfo WHERE titleId='NPXS40047';",SITE)){fail("Store tile does not point to PSN-HUB; install its shortcut first");goto done;}
      art=art_directory(art_path);if(art<0||asset(art)<0)goto done;
      if(equals(db,"SELECT val FROM plan.meta WHERE key='state';","applied")){if(!equals(db,"SELECT val FROM plan.meta WHERE key='sha256';",BACKGROUND_SHA256)||replay(db,0)<0)goto done;if(sql(db,"COMMIT;")<0)goto done;in_tx=0;result=0;goto done;}
      struct timespec now;if(clock_gettime(CLOCK_REALTIME,&now)<0)goto done;char name[80],directory[1400],a[1500],b[1500];snprintf(name,sizeof(name),"backup-%lld-%09ld",(long long)now.tv_sec,now.tv_nsec);if(mkdirat(root,name,0700)<0)goto done;snprintf(directory,sizeof(directory),"%s/%s",root_path,name);snprintf(a,sizeof(a),"%s/app.db",directory);snprintf(b,sizeof(b),"%s/appinfo.db",directory);
      if(backup(app,a)<0||backup(info,b)<0)goto done;int folder=hub_child(root,name,0);if(folder<0||fsync(folder)<0||fsync(root)<0){if(folder>=0)close(folder);goto done;}close(folder);
      if(sql(db,"DELETE FROM plan.changes;")<0)goto done;
      sqlite3_stmt *meta=NULL;if(sqlite3_prepare_v2(db,"INSERT OR REPLACE INTO plan.meta VALUES('backupDirectory',?);",-1,&meta,NULL)!=SQLITE_OK)goto done;sqlite3_bind_text(meta,1,directory,-1,SQLITE_TRANSIENT);int code=sqlite3_step(meta);sqlite3_finalize(meta);if(code!=SQLITE_DONE)goto done;
      if(record_table(db,"tbl_contentinfo","titleId",TITLE,"pic0Info")<0||record_table(db,"tbl_contentinfo","titleId",TITLE,"pic1Info")<0||record_table(db,"tbl_contentinfo","titleId",TITLE,"AppInfoJson")<0||record_table(db,"tbl_conceptmetadata","localConceptId",CONCEPT,"pic0Info")<0)goto done;
      sqlite3_stmt *tables=NULL;if(sqlite3_prepare_v2(db,"SELECT name FROM main.sqlite_master WHERE type='table' AND name GLOB 'tbl_concepticoninfo_*';",-1,&tables,NULL)!=SQLITE_OK)goto done;int code2;
      while((code2=sqlite3_step(tables))==SQLITE_ROW){const char *table=(const char *)sqlite3_column_text(tables,0);if(suffix(table,"tbl_concepticoninfo_")&&record_table(db,table,"primaryTitleId",TITLE,"pic0Info")<0){sqlite3_finalize(tables);goto done;}}sqlite3_finalize(tables);if(code2!=SQLITE_DONE||!changed){fail("No supported Store background references were found");goto done;}
      sqlite3_stmt *sha=NULL;if(sqlite3_prepare_v2(db,"INSERT OR REPLACE INTO plan.meta VALUES('sha256',?);",-1,&sha,NULL)!=SQLITE_OK)goto done;sqlite3_bind_text(sha,1,BACKGROUND_SHA256,-1,SQLITE_STATIC);code=sqlite3_step(sha);sqlite3_finalize(sha);if(code!=SQLITE_DONE)goto done;
    }
    if(!equals(db,"PRAGMA main.quick_check;","ok")||!equals(db,"PRAGMA info.quick_check;","ok")){fail("Database integrity check failed");goto done;}
    if(sql(db,restore?"INSERT OR REPLACE INTO plan.meta VALUES('state','restored');":"INSERT OR REPLACE INTO plan.meta VALUES('state','applied');")<0||sql(db,"COMMIT;")<0)goto done;in_tx=0;result=0;
done:if(in_tx&&db)sqlite3_exec(db,"ROLLBACK;",NULL,NULL,NULL);if(db)sqlite3_close(db);if(ledger)sqlite3_close(ledger);if(art>=0)close(art);if(lock>=0)close(lock);close(root);return result;
}
static void quote(Buffer *b,const char *s){buf_add(b,"\"");for(const unsigned char *p=(const unsigned char *)s;*p;p++){if(*p=='"'||*p=='\\')buf_add(b,"\\%c",*p);else if(*p<32)buf_add(b,"\\u%04x",*p);else buf_add(b,"%c",*p);}buf_add(b,"\"");}
#ifndef HUB_HOST_TEST
static void serve_result(Buffer *b){
    int server=socket(AF_INET,SOCK_STREAM,0);if(server<0)return;int yes=1;setsockopt(server,SOL_SOCKET,SO_REUSEADDR,&yes,sizeof(yes));struct sockaddr_in a;memset(&a,0,sizeof(a));a.sin_family=AF_INET;a.sin_port=htons(8093);a.sin_addr.s_addr=htonl(INADDR_ANY);
    if(bind(server,(struct sockaddr *)&a,sizeof(a))<0||listen(server,1)<0){close(server);return;}fd_set set;FD_ZERO(&set);FD_SET(server,&set);struct timeval wait={60,0};
    if(select(server+1,&set,NULL,NULL,&wait)>0){int client=accept(server,NULL,NULL);if(client>=0){struct timeval timeout={3,0};setsockopt(client,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof(timeout));setsockopt(client,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof(timeout));char request[2048];ssize_t n=read(client,request,sizeof(request)-1);if(n>0){request[n]=0;if(!strncmp(request,"GET / HTTP/1.",13)||!strncmp(request,"GET /api/status HTTP/1.",23)){char header[400];int size=snprintf(header,sizeof(header),"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %zu\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",b->len);if(size>0&&(size_t)size<sizeof(header)&&hub_write(client,header,(size_t)size)==0)hub_write(client,b->data,b->len);}}close(client);}}close(server);
}
#endif
int main(int argc,char **argv){
    signal(SIGPIPE,SIG_IGN);
    const char *root="/data/psn-hub-store-background",*app="/system_data/priv/mms/app.db",*info="/system_data/priv/mms/appinfo.db",*art="/user/appmeta/NPXS40047";int restore=0;
#ifdef HUB_HOST_TEST
    if(argc<3)return 2;root=argv[1];restore=!strcmp(argv[2],"restore");char a[1200],b[1200],c[1200];snprintf(a,sizeof(a),"%s/app.db",root);snprintf(b,sizeof(b),"%s/appinfo.db",root);snprintf(c,sizeof(c),"%s/appmeta",root);app=a;info=b;art=c;
#else
    (void)argc;(void)argv;
#ifdef HUB_BACKGROUND_RESTORE
    restore=1;
#endif
#endif
    int result=operate(root,app,info,art,restore);Buffer report={0};buf_add(&report,"{\"success\":%s,\"operation\":\"%s\",\"titleId\":\"%s\",\"sha256\":\"%s\",\"cells\":%d,\"background\":\"%s\",\"message\":",result==0?"true":"false",restore?"restore-background":"apply-background",TITLE,BACKGROUND_SHA256,changed,BACKGROUND_URI);quote(&report,result==0?(restore?"Previous Store artwork references restored. Refresh the PS5 home screen manually.":"Jailbreak background applied. Original databases are backed up. Refresh the PS5 home screen manually."):problem);buf_add(&report,"}");
    int folder=hub_open_path(root,0);if(folder>=0){hub_atomic(folder,"result.json",-1,report.len,(unsigned char *)report.data,report.len);close(folder);}if(report.data)printf("%s\n",report.data);
#ifndef HUB_HOST_TEST
    serve_result(&report);
#endif
    buf_free(&report);return result==0?0:1;
}
