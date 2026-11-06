/* SPDX-License-Identifier: GPL-3.0-or-later
 * PSNH title registration follows the official SDK install_app sample.
 * Existing registrations are preserved; no automatic Store database edits.
 */
#define _DEFAULT_SOURCE
#include "integrated.h"
#include "home_icon.h"
#include <sqlite3.h>
#include <dlfcn.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
static int manager_code,jailbreak_code,manager_ready,jailbreak_ready;
#ifndef HUB_HOST_TEST
static void trace_shortcut(const char *text){int fd=open("/data/psn-hub-shortcut-startup.log",O_WRONLY|O_CREAT|O_APPEND,0600);if(fd>=0){hub_write(fd,text,strlen(text));hub_write(fd,"\n",1);close(fd);}}
#ifndef HUB_UNIFIED_PREVIEW
static int (*app_initialize)(void);
static int (*app_install)(const char *,const char *,void *);
static int load_installer(void){
 void *user=dlopen("libSceUserService.sprx",RTLD_LAZY);if(user){int (*initialize)(void *)=dlsym(user,"sceUserServiceInitialize");if(initialize)initialize(NULL);}
 void *app=dlopen("libSceAppInstUtil.sprx",RTLD_LAZY);if(!app)return -1;
 app_initialize=dlsym(app,"sceAppInstUtilInitialize");app_install=dlsym(app,"sceAppInstUtilAppInstallTitleDir");return app_initialize&&app_install?0:-1;
}
#endif
static int exists(sqlite3 *db,const char *title){
 sqlite3_stmt *s=NULL;int found=0;if(sqlite3_prepare_v2(db,"SELECT 1 FROM tbl_contentinfo WHERE titleId=?",-1,&s,NULL)==SQLITE_OK){sqlite3_bind_text(s,1,title,-1,SQLITE_STATIC);found=sqlite3_step(s)==SQLITE_ROW;}sqlite3_finalize(s);return found;
}
static int replaced(sqlite3 *db){
 sqlite3_stmt *s=NULL;int found=0;if(sqlite3_prepare_v2(db,"SELECT pprDeeplinkUri FROM tbl_contentinfo WHERE titleId='NPXS40047'",-1,&s,NULL)==SQLITE_OK&&sqlite3_step(s)==SQLITE_ROW){const char *url=(const char *)sqlite3_column_text(s,0);found=url&&!strcmp(url,"https://itssjustaaron.github.io/PSN-HUB2/");}sqlite3_finalize(s);return found;
}
#ifndef HUB_UNIFIED_PREVIEW
static int install(const char *id,const char *name,const char *url){
 int parent=hub_open_path("/user/app",0);if(parent<0)return -1;int title=hub_child(parent,id,1);close(parent);if(title<0)return -1;if(fchmod(title,0755)<0){close(title);return -1;}int sys=hub_child(title,"sce_sys",1);close(title);if(sys<0)return -1;if(fchmod(sys,0755)<0){close(sys);return -1;}
 char json[600];int n=snprintf(json,sizeof(json),"{\"titleId\":\"%s\",\"applicationCategoryType\":65536,\"deeplinkUri\":\"%s\",\"localizedParameters\":{\"defaultLanguage\":\"en-US\",\"en-US\":{\"titleName\":\"%s\"}}}",id,url,name);
 int result=n>0&&(size_t)n<sizeof(json)?hub_atomic(sys,"param.json",-1,(size_t)n,(unsigned char *)json,(size_t)n):-1;
 if(result==0)result=hub_atomic(sys,"icon0.png",-1,sizeof(home_icon),home_icon,sizeof(home_icon));
 if(result==0){const char *files[]={"param.json","icon0.png"};for(int i=0;i<2;i++){int fd=openat(sys,files[i],O_RDONLY|O_NOFOLLOW);if(fd<0){result=-1;break;}if(fchmod(fd,0644)<0)result=-1;close(fd);}}
 close(sys);return result<0?result:app_install(id,"/user/app/",NULL);
}
#endif
#endif
void hub_shortcuts_init(void){
#ifndef HUB_HOST_TEST
 trace_shortcut("opening read-only shortcut database");
 sqlite3 *db=NULL;if(sqlite3_open_v2("/system_data/priv/mms/app.db",&db,SQLITE_OPEN_READONLY,NULL)!=SQLITE_OK){if(db)sqlite3_close(db);manager_code=jailbreak_code=-1;return;}
 trace_shortcut("shortcut database opened");
 manager_ready=exists(db,"PSNH00001");jailbreak_ready=exists(db,"PSNH00002")||replaced(db);sqlite3_close(db);
 trace_shortcut(manager_ready&&jailbreak_ready?"existing shortcuts found":"shortcut registration is required");
#ifndef HUB_UNIFIED_PREVIEW
 if(manager_ready&&jailbreak_ready)return;int code=load_installer();if(code==0)code=app_initialize();if(code){manager_code=jailbreak_code=code;return;}
 if(!manager_ready){manager_code=install("PSNH00001","PSN-HUB Manager","http://127.0.0.1:8085/");manager_ready=manager_code==0;}
 if(!jailbreak_ready){jailbreak_code=install("PSNH00002","PSN-HUB JAILBREAK","https://itssjustaaron.github.io/PSN-HUB2/");jailbreak_ready=jailbreak_code==0;}
#endif
#endif
}
void hub_shortcuts_status(Buffer *b){
 buf_add(b,",\"manager\":{\"status\":\"%s\",\"stage\":\"%s\",\"code\":%d},\"jailbreak\":{\"status\":\"%s\",\"stage\":\"%s\",\"code\":%d},\"notification\":\"not sent\",\"notificationCode\":0,\"userServiceCode\":0",manager_ready?"success":"failed",manager_ready?"installed":"not registered",manager_code,jailbreak_ready?"success":"failed",jailbreak_ready?"installed or Store replacement present":"not registered",jailbreak_code);
}
