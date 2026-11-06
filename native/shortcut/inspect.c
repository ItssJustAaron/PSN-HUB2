/* SPDX-License-Identifier: GPL-3.0-or-later
 * Read-only PS Store database inspector. This binary contains no SQL write route.
 */
#define _DEFAULT_SOURCE
#include "hub.h"
#include <sqlite3.h>
#include <arpa/inet.h>
#include <netinet/in.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <unistd.h>
static char app_path[1024]="/system_data/priv/mms/app.db";
static char info_path[1024]="/system_data/priv/mms/appinfo.db";
static char store_ids[8][32],store_concepts[8][128];
static int store_count;
static void quoted(Buffer *out,const char *value) {
    if(!value){buf_add(out,"null");return;}buf_add(out,"\"");
    for(const unsigned char *p=(const unsigned char *)value;*p;p++){
        if(*p=='"'||*p=='\\')buf_add(out,"\\%c",*p);
        else if(*p<32)buf_add(out,"\\u%04x",*p);
        else buf_add(out,"%c",*p);
    }buf_add(out,"\"");
}
static void rows(sqlite3 *db,Buffer *out,const char *sql,const char *id) {
    sqlite3_stmt *statement=NULL;int code=sqlite3_prepare_v2(db,sql,-1,&statement,NULL);
    if(code!=SQLITE_OK){buf_add(out,"{\"error\":");quoted(out,sqlite3_errmsg(db));buf_add(out,"}");return;}
    if(id)sqlite3_bind_text(statement,1,id,-1,SQLITE_TRANSIENT);
    int count=0;buf_add(out,"[");
    while((code=sqlite3_step(statement))==SQLITE_ROW&&count<128){
        buf_add(out,"%s{",count++?",":"");int columns=sqlite3_column_count(statement);
        for(int i=0;i<columns;i++){
            if(i)buf_add(out,",");quoted(out,sqlite3_column_name(statement,i));buf_add(out,":");
            int type=sqlite3_column_type(statement,i);
            if(type==SQLITE_INTEGER)buf_add(out,"%lld",(long long)sqlite3_column_int64(statement,i));
            else if(type==SQLITE_NULL)buf_add(out,"null");
            else if(type==SQLITE_BLOB)quoted(out,"<binary value>");
            else if(sqlite3_column_bytes(statement,i)>32768)quoted(out,"<value exceeds inspection limit>");
            else quoted(out,(const char *)sqlite3_column_text(statement,i));
        }buf_add(out,"}");if(out->failed)break;
    }buf_add(out,"]");sqlite3_finalize(statement);
}
static void describe_database(Buffer *out,const char *path,const char *title) {
    buf_add(out,"{\"name\":");quoted(out,title);buf_add(out,",\"path\":");quoted(out,path);
    struct stat st;sqlite3 *db=NULL;
    if(lstat(path,&st)<0||!S_ISREG(st.st_mode)){buf_add(out,",\"error\":\"Database missing, inaccessible or not a regular file\"}");return;}
    int code=sqlite3_open_v2(path,&db,SQLITE_OPEN_READONLY|SQLITE_OPEN_NOFOLLOW,NULL);
    if(code!=SQLITE_OK){buf_add(out,",\"error\":");quoted(out,db?sqlite3_errmsg(db):"SQLite open failed");buf_add(out,"}");if(db)sqlite3_close(db);return;}
    sqlite3_busy_timeout(db,3000);
    sqlite3_exec(db,"PRAGMA query_only=ON; PRAGMA temp_store=MEMORY;",NULL,NULL,NULL);
    buf_add(out,",\"readOnly\":%s,\"journal\":",sqlite3_db_readonly(db,"main")==1?"true":"false");
    rows(db,out,"PRAGMA journal_mode;",NULL);
    buf_add(out,",\"integrity\":");rows(db,out,"PRAGMA quick_check(1);",NULL);
    buf_add(out,",\"tables\":[");
    sqlite3_stmt *tables=NULL;int count=0;
    if(sqlite3_prepare_v2(db,"SELECT name FROM sqlite_master WHERE type='table' AND name GLOB 'tbl_*' ORDER BY name LIMIT 128;",-1,&tables,NULL)==SQLITE_OK){
        while(sqlite3_step(tables)==SQLITE_ROW){
            const char *name=(const char *)sqlite3_column_text(tables,0);
            buf_add(out,"%s{\"name\":",count++?",":"");quoted(out,name);buf_add(out,",\"columns\":");
            char *sql=sqlite3_mprintf("PRAGMA table_info(\"%w\");",name);rows(db,out,sql,NULL);sqlite3_free(sql);
            const char *key=NULL;
            if(!strncmp(name,"tbl_iconinfo_",strlen("tbl_iconinfo_")))key="titleId";
            else if(!strncmp(name,"tbl_concepticoninfo_",strlen("tbl_concepticoninfo_")))key="primaryTitleId";
            else if(!strcmp(name,"tbl_conceptmetadata"))key="localConceptId";
            else if(!strcmp(name,"tbl_appinfo"))key="titleId";
            else if(!strcmp(name,"tbl_conceptinfo"))key="local_concept_id";
            if(key){buf_add(out,",\"storeRows\":[");for(int i=0;i<store_count;i++){if(i)buf_add(out,",");sql=sqlite3_mprintf("SELECT * FROM \"%w\" WHERE \"%w\"=? LIMIT 128;",name,key);rows(db,out,sql,strstr(key,"concept")||strstr(key,"Concept")?store_concepts[i]:store_ids[i]);sqlite3_free(sql);}buf_add(out,"]");}
            buf_add(out,"}");
        }sqlite3_finalize(tables);
    }buf_add(out,"]");
    if(!strcmp(title,"app.db")){
        buf_add(out,",\"systemTitles\":");rows(db,out,"SELECT titleId,titleName,localConceptId FROM tbl_contentinfo WHERE titleId GLOB 'NPXS*' ORDER BY titleId LIMIT 128;",NULL);
        buf_add(out,",\"storeCandidates\":");rows(db,out,"SELECT * FROM tbl_contentinfo WHERE titleId GLOB 'NPXS*' AND (titleName LIKE '%Store%' OR titleName IN('PSN-HUB','PSN-HUB JAILBREAK')) ORDER BY titleId LIMIT 8;",NULL);
    }
    buf_add(out,"}");sqlite3_close(db);
}
static Buffer report(void){
    store_count=0;sqlite3 *source=NULL;sqlite3_stmt *find=NULL;
    if(sqlite3_open_v2(app_path,&source,SQLITE_OPEN_READONLY|SQLITE_OPEN_NOFOLLOW,NULL)==SQLITE_OK&&sqlite3_prepare_v2(source,"SELECT titleId,localConceptId FROM tbl_contentinfo WHERE titleId GLOB 'NPXS*' AND (titleName LIKE '%Store%' OR titleName IN('PSN-HUB','PSN-HUB JAILBREAK')) ORDER BY titleId LIMIT 8;",-1,&find,NULL)==SQLITE_OK){
        while(sqlite3_step(find)==SQLITE_ROW&&store_count<8){const char *id=(const char *)sqlite3_column_text(find,0),*concept=(const char *)sqlite3_column_text(find,1);snprintf(store_ids[store_count],32,"%s",id?id:"");snprintf(store_concepts[store_count],128,"%s",concept?concept:"");store_count++;}
    }
    if(find)sqlite3_finalize(find);if(source)sqlite3_close(source);
    Buffer out={0};buf_add(&out,"{\"readOnlyInspector\":true,\"version\":\"0.1.0\",\"plannedName\":\"PSN-HUB JAILBREAK\",\"plannedURL\":\"https://itssjustaaron.github.io/PSN-HUB2/\",\"databaseEditsPerformed\":false,\"databases\":[");describe_database(&out,app_path,"app.db");buf_add(&out,",");describe_database(&out,info_path,"appinfo.db");buf_add(&out,"]}");return out;}
static void response(int fd,int code,const char *type,const char *body,size_t length){char header[512];int n=snprintf(header,sizeof(header),"HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",code,code==200?"OK":"Error",type,length);if(n>0&&(size_t)n<sizeof(header)&&hub_write(fd,header,(size_t)n)==0)hub_write(fd,body,length);}
static const char page[]="<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>PSN-HUB Store Inspector</title><style>body{background:#160622;color:white;font:16px/1.5 Arial;margin:24px}h1{color:#39ff14}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0d0216;padding:18px;border-radius:12px}a{color:#39ff14}</style><h1>PSN-HUB Store Inspector</h1><p>Read-only inspection. This ELF cannot edit either system database or restart the PS5 interface.</p><p>Planned shortcut: <b>PSN-HUB</b> &rarr; https://itssjustaaron.github.io/PSN-HUB2/</p><p><a href=/report>View database report</a></p><pre id=report>Reading database schema...</pre><script>fetch('/report').then(r=>r.json()).then(d=>document.getElementById('report').textContent=JSON.stringify(d,null,2)).catch(e=>document.getElementById('report').textContent=e.message)</script>";
int main(int argc,char **argv){
    int port=8089;
#ifdef HUB_HOST_TEST
    if(argc<3)return 2;int a=snprintf(app_path,sizeof(app_path),"%s/app.db",argv[1]),b=snprintf(info_path,sizeof(info_path),"%s/appinfo.db",argv[1]);if(a<0||b<0||(size_t)a>=sizeof(app_path)||(size_t)b>=sizeof(info_path))return 2;port=atoi(argv[2]);
#else
    (void)argc;(void)argv;
#endif
    signal(SIGPIPE,SIG_IGN);int server=socket(AF_INET,SOCK_STREAM,0);if(server<0)return 1;int yes=1;setsockopt(server,SOL_SOCKET,SO_REUSEADDR,&yes,sizeof(yes));
    struct sockaddr_in address;memset(&address,0,sizeof(address));address.sin_family=AF_INET;address.sin_port=htons((unsigned short)port);
#ifdef HUB_HOST_TEST
    address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
#else
    address.sin_addr.s_addr=htonl(INADDR_ANY);
#endif
    if(bind(server,(struct sockaddr *)&address,sizeof(address))<0||listen(server,8)<0)return 1;printf("Read-only Store inspector on %d\n",port);fflush(stdout);
    for(;;){int client=accept(server,NULL,NULL);if(client<0)break;struct timeval timeout={5,0};setsockopt(client,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof(timeout));setsockopt(client,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof(timeout));char request[2048];ssize_t n=read(client,request,sizeof(request)-1);
        if(n>0){request[n]=0;if(!strncmp(request,"GET /report HTTP/1.",19)){Buffer out=report();if(out.failed)response(client,500,"text/plain","Report exceeds limit",20);else response(client,200,"application/json",out.data,out.len);buf_free(&out);}else if(!strncmp(request,"GET / HTTP/1.",13))response(client,200,"text/html; charset=utf-8",page,sizeof(page)-1);else response(client,405,"text/plain","Read-only inspector",19);}close(client);
    }close(server);return 0;
}
