/* SPDX-License-Identifier: GPL-3.0-or-later */
#define _DEFAULT_SOURCE
#include "hub.h"
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

void buf_add(Buffer *b,const char *fmt,...) {
    if(b->failed)return;
    va_list ap;va_start(ap,fmt);int n=vsnprintf(NULL,0,fmt,ap);va_end(ap);
    if(n<0||(size_t)n>HUB_JSON_LIMIT-b->len){b->failed=1;return;}
    size_t needed=b->len+(size_t)n+1;
    if(needed>b->cap){size_t cap=b->cap?b->cap:1024;while(cap<needed)cap*=2;char *p=realloc(b->data,cap);if(!p){b->failed=1;return;}b->data=p;b->cap=cap;}
    va_start(ap,fmt);vsnprintf(b->data+b->len,b->cap-b->len,fmt,ap);va_end(ap);b->len+=(size_t)n;
}
void buf_free(Buffer *b){free(b->data);memset(b,0,sizeof(*b));}
int hub_name(const char *s) {
    size_t n=strlen(s);if(!n||n>127||s[0]=='.')return 0;
    for(size_t i=0;i<n;i++){unsigned char c=(unsigned char)s[i];if(!((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='_'||c=='-'||c=='.'||c==' '))return 0;}
    return 1;
}
int hub_cheat_path(const char *s) {
    const char *slash=strchr(s,'/');if(!slash||strchr(slash+1,'/')||!hub_name(slash+1))return 0;
    size_t n=(size_t)(slash-s);const char *ext=strrchr(slash+1,'.');if(!ext)return 0;
    if(n==4&&!strncmp(s,"json",n))return !strcmp(ext,".json");
    if(n==3&&!strncmp(s,"mc4",n))return !strcmp(ext,".mc4");
    if(n==3&&!strncmp(s,"shn",n))return !strcmp(ext,".shn");
    return 0;
}
int hub_child(int parent,const char *name,int create) {
    if(!hub_name(name)){errno=EINVAL;return -1;}
    if(create&&mkdirat(parent,name,0700)<0&&errno!=EEXIST)return -1;
    return openat(parent,name,O_RDONLY|O_DIRECTORY|O_NOFOLLOW);
}
/* Walk every component from /; a symlink in any ancestor is rejected. */
int hub_open_path(const char *path,int create) {
    if(path[0]!='/'||strlen(path)>=1024){errno=EINVAL;return -1;}
    int fd=open("/",O_RDONLY|O_DIRECTORY);if(fd<0)return -1;
    char copy[1024];strcpy(copy,path+1);char *save=NULL;
    for(char *part=strtok_r(copy,"/",&save);part;part=strtok_r(NULL,"/",&save)){int next=hub_child(fd,part,create);close(fd);if(next<0)return -1;fd=next;}
    return fd;
}
int hub_write(int fd,const void *data,size_t len) {
    const unsigned char *p=data;while(len){ssize_t n=write(fd,p,len);if(n<0&&errno==EINTR)continue;if(n<=0)return -1;p+=n;len-=(size_t)n;}return 0;
}
int hub_atomic(int dir,const char *name,int input,size_t size,const unsigned char *first,size_t count) {
    if(!hub_name(name)||size>HUB_LIMIT||count>size){errno=EINVAL;return -1;}
    static unsigned seq;char tmp[64];snprintf(tmp,sizeof(tmp),".upload-%ld-%u",(long)getpid(),++seq);
    int fd=openat(dir,tmp,O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW,0600);if(fd<0)return -1;
    int ok=hub_write(fd,first,count);size-=count;unsigned char buffer[32768];
    while(ok==0&&size){size_t want=size<sizeof(buffer)?size:sizeof(buffer);ssize_t n=read(input,buffer,want);if(n<0&&errno==EINTR)continue;if(n<=0){ok=-1;break;}ok=hub_write(fd,buffer,(size_t)n);size-=(size_t)n;}
    if(ok==0)ok=fsync(fd);if(close(fd)<0)ok=-1;
    if(ok==0)ok=renameat(dir,tmp,dir,name);
    if(ok==0)ok=fsync(dir);
    if(ok<0)unlinkat(dir,tmp,0);
    return ok;
}
int hub_inventory(int dir,Buffer *b,const char *prefix,int *count) {
    int scan=openat(dir,".",O_RDONLY|O_DIRECTORY);if(scan<0)return -1;DIR *d=fdopendir(scan);if(!d){close(scan);return -1;}
    struct dirent *entry;int result=0;
    while((entry=readdir(d))){
      if(entry->d_name[0]=='.')continue;
      char path[300];int len=snprintf(path,sizeof(path),"%s%s",prefix,entry->d_name);
      if(len<0||(size_t)len>=sizeof(path)||!hub_cheat_path(path))continue;
      int fd=openat(dir,entry->d_name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK);if(fd<0){result=-1;break;}
      struct stat st;char hash[65];if(fstat(fd,&st)<0||!S_ISREG(st.st_mode)||hub_hash(fd,hash)<0){close(fd);result=-1;break;}close(fd);
      if(*count>=20000){result=-1;break;}
      buf_add(b,"%s{\"path\":\"%s\",\"size\":%lld,\"sha256\":\"%s\"}",(*count)++?",":"",path,(long long)st.st_size,hash);
      if(b->failed){result=-1;break;}
    }
    closedir(d);return result;
}
int hub_copy_tree(int src,int dst,int depth,size_t *total) {
    if(depth>8){errno=ELOOP;return -1;}
    int scan=openat(src,".",O_RDONLY|O_DIRECTORY);if(scan<0)return -1;DIR *d=fdopendir(scan);if(!d){close(scan);return -1;}
    int result=0;struct dirent *entry;
    while((entry=readdir(d))){
      if(!strcmp(entry->d_name,".")||!strcmp(entry->d_name,".."))continue;
      if(!hub_name(entry->d_name)){result=-1;break;}
      struct stat st;if(fstatat(src,entry->d_name,&st,AT_SYMLINK_NOFOLLOW)<0){result=-1;break;}
      if(S_ISDIR(st.st_mode)){
        int from=hub_child(src,entry->d_name,0),to=hub_child(dst,entry->d_name,1);
        if(from<0||to<0)result=-1;else result=hub_copy_tree(from,to,depth+1,total);
        if(from>=0)close(from);if(to>=0)close(to);if(result<0)break;
      }else if(S_ISREG(st.st_mode)){
        if(st.st_size<0||(uint64_t)st.st_size>HUB_LIMIT||*total>(size_t)2*1024*1024*1024-(size_t)st.st_size){result=-1;break;}
        *total+=(size_t)st.st_size;
        int from=openat(src,entry->d_name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK);struct stat actual;
        if(from<0||fstat(from,&actual)<0||!S_ISREG(actual.st_mode)||actual.st_dev!=st.st_dev||actual.st_ino!=st.st_ino){if(from>=0)close(from);result=-1;break;}
        result=hub_atomic(dst,entry->d_name,from,(size_t)st.st_size,NULL,0);close(from);if(result<0)break;
      }else{result=-1;break;}
    }
    closedir(d);if(result==0)result=fsync(dst);return result;
}
/* Only used on private staging directories; never follows directory symlinks. */
int hub_remove_tree(int parent,const char *name) {
    int fd=openat(parent,name,O_RDONLY|O_DIRECTORY|O_NOFOLLOW);if(fd<0)return errno==ENOENT?0:-1;
    int scan=openat(fd,".",O_RDONLY|O_DIRECTORY);if(scan<0){close(fd);return -1;}DIR *d=fdopendir(scan);if(!d){close(scan);close(fd);return -1;}
    struct dirent *entry;int result=0;
    while((entry=readdir(d))){if(!strcmp(entry->d_name,".")||!strcmp(entry->d_name,".."))continue;struct stat st;
      if(fstatat(fd,entry->d_name,&st,AT_SYMLINK_NOFOLLOW)<0){result=-1;break;}
      if(S_ISDIR(st.st_mode)){if(hub_remove_tree(fd,entry->d_name)<0){result=-1;break;}}
      else if(unlinkat(fd,entry->d_name,0)<0){result=-1;break;}}
    closedir(d);close(fd);if(result==0)result=unlinkat(parent,name,AT_REMOVEDIR);return result;
}
int hub_clean_uploads(int dir) {
    int scan=openat(dir,".",O_RDONLY|O_DIRECTORY);if(scan<0)return -1;
    DIR *d=fdopendir(scan);if(!d){close(scan);return -1;}
    struct dirent *entry;int result=0;
    while((entry=readdir(d))){
      if(strncmp(entry->d_name,".upload-",8))continue;
      struct stat st;
      if(fstatat(dir,entry->d_name,&st,AT_SYMLINK_NOFOLLOW)<0||!S_ISREG(st.st_mode)||unlinkat(dir,entry->d_name,0)<0){result=-1;break;}
    }
    closedir(d);return result<0?-1:fsync(dir);
}
static int directory_exists(int parent,const char *name){struct stat st;if(fstatat(parent,name,&st,AT_SYMLINK_NOFOLLOW)<0)return errno==ENOENT?0:-1;return S_ISDIR(st.st_mode)?1:-1;}
int hub_recover(int parent,const char *name) {
    int active=directory_exists(parent,name),old=directory_exists(parent,".psnhub-old"),next=directory_exists(parent,".psnhub-new");
    if(active<0||old<0||next<0)return -1;
    if(old&&!active){if(renameat(parent,next?".psnhub-new":".psnhub-old",parent,name)<0||fsync(parent)<0)return -1;}
    if(hub_remove_tree(parent,".psnhub-new")<0||hub_remove_tree(parent,".psnhub-old")<0)return -1;
    return fsync(parent);
}
int hub_restore(int parent,const char *name,int snapshot) {
    if(hub_recover(parent,name)<0)return -1;
    if(mkdirat(parent,".psnhub-new",0700)<0)return -1;
    int staged=openat(parent,".psnhub-new",O_RDONLY|O_DIRECTORY|O_NOFOLLOW);if(staged<0)return -1;
    size_t total=0;int result=hub_copy_tree(snapshot,staged,0,&total);close(staged);
    if(result<0){hub_remove_tree(parent,".psnhub-new");return -1;}
    if(fsync(parent)<0)return -1;
    int active=directory_exists(parent,name);if(active<0)return -1;
    if(active&&renameat(parent,name,parent,".psnhub-old")<0)return -1;
    if(fsync(parent)<0)return -1;
#ifdef HUB_HOST_TEST
    if(getenv("HUB_TEST_CRASH_AFTER_RENAME"))_exit(90);
#endif
    if(renameat(parent,".psnhub-new",parent,name)<0){if(active)renameat(parent,".psnhub-old",parent,name);return -1;}
    if(fsync(parent)<0)return -1;
    return hub_remove_tree(parent,".psnhub-old");
}
