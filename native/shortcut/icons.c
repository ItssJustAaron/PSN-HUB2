/* SPDX-License-Identifier: GPL-3.0-or-later
 * File-only icon refresh. SQLite is opened read-only; no title registration.
 */
#define _DEFAULT_SOURCE
#include "hub.h"
#include "home_icon.h"
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
#include <unistd.h>

typedef struct {int dir;char name[64],backup[64],path[1200];unsigned char *old;size_t size;int changed;} Target;
static Target targets[5];static int count;
static int owned(sqlite3 *db,const char *id){
    sqlite3_stmt *s=NULL;int ok=0;
    if(sqlite3_prepare_v2(db,"SELECT titleName,pprDeeplinkUri FROM tbl_contentinfo WHERE titleId=?",-1,&s,NULL)!=SQLITE_OK)return 0;
    sqlite3_bind_text(s,1,id,-1,SQLITE_STATIC);
    if(sqlite3_step(s)==SQLITE_ROW){const char *name=(const char *)sqlite3_column_text(s,0),*url=(const char *)sqlite3_column_text(s,1);
        ok=name&&!strncmp(name,"PSN-HUB",7);if(!strcmp(id,"NPXS40047"))ok=ok&&url&&!strcmp(url,"https://itssjustaaron.github.io/PSN-HUB2/");}
    sqlite3_finalize(s);return ok;
}
static int collect(const char *directory,const char *name){
    /* Use the carry-aware *at wrapper for optional directories. The SDK's
     * realpath fallback does not reliably preserve ENOENT on this console. */
    struct stat parent;if(fstatat(AT_FDCWD,directory,&parent,0)<0)return errno==ENOENT?0:-1;
    if(!S_ISDIR(parent.st_mode))return -1;
    char resolved[PATH_MAX];if(!realpath(directory,resolved))return errno==ENOENT?0:-1;
    int dir=hub_open_path(resolved,0);if(dir<0)return -1;
    int fd=openat(dir,name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK);if(fd<0){close(dir);return errno==ENOENT?0:-1;}
    struct stat st;if(fstat(fd,&st)<0||!S_ISREG(st.st_mode)||st.st_size<8||st.st_size>2*1024*1024){close(fd);close(dir);return -1;}
    Target *t=&targets[count];t->old=malloc((size_t)st.st_size);t->size=(size_t)st.st_size;t->dir=dir;
    size_t at=0;while(t->old&&at<t->size){ssize_t n=read(fd,t->old+at,t->size-at);if(n<=0)break;at+=(size_t)n;}close(fd);
    if(at!=t->size||memcmp(t->old,"\x89PNG\r\n\x1a\n",8)){free(t->old);close(dir);return -1;}
    snprintf(t->path,sizeof(t->path),"%s/%s",directory,name);snprintf(t->name,sizeof(t->name),"%s",name);snprintf(t->backup,sizeof(t->backup),"original-%d.png",count);count++;return 0;
}
static int replace(Target *t,const unsigned char *data,size_t size){
    if(hub_atomic(t->dir,t->name,-1,size,data,size)<0)return -1;
    int fd=openat(t->dir,t->name,O_RDONLY|O_NOFOLLOW);if(fd<0)return -1;
    int result=fchmod(fd,0644);if(result==0)result=fsync(fd);close(fd);return result;
}
static int operate(const char *root,const char *dbpath,const char *prefix){
    int result=-1,backup=-1,lock=-1;sqlite3 *db=NULL;char path[1200];
    backup=hub_open_path(root,1);if(backup<0)goto done;
    lock=openat(backup,"lock",O_CREAT|O_RDWR|O_NOFOLLOW,0600);if(lock<0||flock(lock,LOCK_EX|LOCK_NB)<0)goto done;
    /* A unique backup folder prevents a repeat run from replacing originals. */
    char folder[80];snprintf(folder,sizeof(folder),"icons-%ld",(long)getpid());if(mkdirat(backup,folder,0700)<0)goto done;
    int session=hub_child(backup,folder,0);if(session<0)goto done;close(backup);backup=session;
    if(sqlite3_open_v2(dbpath,&db,SQLITE_OPEN_READONLY,NULL)!=SQLITE_OK)goto done;
    const char *ids[]={"PSNH00001","PSNH00002","NPXS40047"};
    for(int i=0;i<3;i++)if(owned(db,ids[i])){
        if(i<2){snprintf(path,sizeof(path),"%s/user/app/%s/sce_sys",prefix,ids[i]);if(collect(path,"icon0.png")<0)goto done;}
        snprintf(path,sizeof(path),"%s/user/appmeta/%s",prefix,ids[i]);
        if(collect(path,i==2?"psn-hub-icon.png":"icon0.png")<0)goto done;
    }
    if(!count)goto done;
    /* Finish every backup before changing any icon. */
    for(int i=0;i<count;i++)if(hub_atomic(backup,targets[i].backup,-1,targets[i].size,targets[i].old,targets[i].size)<0)goto done;
    Buffer manifest={0};for(int i=0;i<count;i++)buf_add(&manifest,"%s\t%s\n",targets[i].backup,targets[i].path);
    if(manifest.failed||hub_atomic(backup,"manifest.txt",-1,manifest.len,(unsigned char *)manifest.data,manifest.len)<0){buf_free(&manifest);goto done;}buf_free(&manifest);
    result=0;
    for(int i=0;i<count;i++){targets[i].changed=1;if(replace(&targets[i],home_icon,sizeof(home_icon))<0){result=-1;break;}}
    if(result<0)for(int i=0;i<count;i++)if(targets[i].changed&&replace(&targets[i],targets[i].old,targets[i].size)<0)result=-2;
done:
    if(db)sqlite3_close(db);if(lock>=0)close(lock);if(backup>=0)close(backup);
    for(int i=0;i<count;i++){free(targets[i].old);close(targets[i].dir);}return result;
}
int main(int argc,char **argv){
    signal(SIGPIPE,SIG_IGN);const char *root="/data/psn-hub-icon-update",*db="/system_data/priv/mms/app.db",*prefix="";
#ifdef HUB_HOST_TEST
    if(argc!=4)return 2;root=argv[1];db=argv[2];prefix=argv[3];
#else
    (void)argc;(void)argv;
#endif
    int result=operate(root,db,prefix);char body[500];int length=snprintf(body,sizeof(body),"{\"success\":%s,\"icons\":%d,\"sha256\":\"%s\",\"rollbackFailed\":%s,\"message\":\"%s\"}",result==0?"true":"false",count,HOME_ICON_SHA,result==-2?"true":"false",result==0?"HD icons installed. Refresh the home screen manually.":"Icon update failed; inspect private backups before retrying.");puts(body);
#ifndef HUB_HOST_TEST
    int server=socket(AF_INET,SOCK_STREAM,0),yes=1;if(server<0)return 1;setsockopt(server,SOL_SOCKET,SO_REUSEADDR,&yes,sizeof(yes));struct sockaddr_in a;memset(&a,0,sizeof(a));a.sin_family=AF_INET;a.sin_port=htons(8094);a.sin_addr.s_addr=htonl(INADDR_ANY);
    if(bind(server,(struct sockaddr *)&a,sizeof(a))==0&&listen(server,1)==0){fd_set set;FD_ZERO(&set);FD_SET(server,&set);struct timeval wait={60,0};if(select(server+1,&set,NULL,NULL,&wait)>0){int client=accept(server,NULL,NULL);if(client>=0){struct timeval timeout={3,0};setsockopt(client,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof(timeout));setsockopt(client,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof(timeout));char request[2048];read(client,request,sizeof(request));char header[250];int n=snprintf(header,sizeof(header),"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",length);hub_write(client,header,(size_t)n);hub_write(client,body,(size_t)length);close(client);}}}close(server);
#else
    (void)length;
#endif
    return result==0?0:1;
}
