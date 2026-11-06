/* SPDX-License-Identifier: GPL-3.0-or-later */
#define _DEFAULT_SOURCE
#include "hub.h"
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>

/* Raw, flat title directories only. No mounting, database edits or restore. */
#define SAVE_LIMIT ((uint64_t)4*1024*1024*1024)
static int save_home=-1, save_backups=-1;
static int valid_user(const char *s){if(strlen(s)!=8)return 0;for(int i=0;i<8;i++)if(!((s[i]>='0'&&s[i]<='9')||(s[i]>='a'&&s[i]<='f')||(s[i]>='A'&&s[i]<='F')))return 0;return 1;}
static const char *save_folder(const char *s){return !strcmp(s,"ps5")?"savedata_prospero":!strcmp(s,"ps4")?"savedata":NULL;}
static int valid_title(const char *s){if(strlen(s)!=9||(strncmp(s,"PPSA",4)&&strncmp(s,"CUSA",4)))return 0;for(int i=4;i<9;i++)if(s[i]<'0'||s[i]>'9')return 0;return 1;}
void hub_saves_init(int base){
#ifdef HUB_HOST_TEST
    save_home=hub_child(base,"home",1);
#else
    save_home=hub_open_path("/user/home",0);
#endif
    save_backups=hub_child(base,"save-backups",1);
}
int hub_save_title(const char *user,const char *platform,const char *title){
    const char *folder=save_folder(platform);if(!valid_user(user)||!folder||!valid_title(title)){errno=EINVAL;return -1;}
    int u=hub_child(save_home,user,0);if(u<0)return -1;int p=hub_child(u,folder,0);close(u);if(p<0)return -1;int t=hub_child(p,title,0);close(p);return t;
}
/* Fail closed on nonregular files, nested directories and excessive listings. */
int hub_save_files(int root,Buffer *b){
    int scan=openat(root,".",O_RDONLY|O_DIRECTORY);DIR *d=scan<0?NULL:fdopendir(scan);if(!d){if(scan>=0)close(scan);return -1;}
    int count=0,result=0;uint64_t total=0;struct dirent *e;buf_add(b,"{\"items\":[");
    while((e=readdir(d))){if(!strcmp(e->d_name,".")||!strcmp(e->d_name,".."))continue;struct stat st;
      if(!hub_name(e->d_name)||++count>4096||fstatat(root,e->d_name,&st,AT_SYMLINK_NOFOLLOW)<0||!S_ISREG(st.st_mode)||st.st_size<0||(uint64_t)st.st_size>SAVE_LIMIT||total>SAVE_LIMIT-(uint64_t)st.st_size){result=-1;break;}
      total+=(uint64_t)st.st_size;buf_add(b,"%s{\"name\":\"%s\",\"size\":%lld,\"modified\":%lld,\"inode\":%llu}",count>1?",":"",e->d_name,(long long)st.st_size,(long long)st.st_mtime,(unsigned long long)st.st_ino);
    }
    closedir(d);buf_add(b,"],\"size\":%llu}",(unsigned long long)total);return result<0||b->failed?-1:0;
}
int hub_save_list(Buffer *b){
    int scan=openat(save_home,".",O_RDONLY|O_DIRECTORY);DIR *users=scan<0?NULL:fdopendir(scan);if(!users){if(scan>=0)close(scan);return -1;}
    struct dirent *u;int count=0,result=0;buf_add(b,"{\"items\":[");
    while((u=readdir(users))){if(!valid_user(u->d_name))continue;int user=hub_child(save_home,u->d_name,0);if(user<0){result=-1;break;}
      const char *platforms[]={"ps5","ps4"};
      for(int i=0;i<2&&result==0;i++){int root=hub_child(user,save_folder(platforms[i]),0);if(root<0){if(errno!=ENOENT)result=-1;continue;}DIR *titles=fdopendir(root);if(!titles){close(root);result=-1;break;}struct dirent *t;
        while((t=readdir(titles))){if(!valid_title(t->d_name))continue;int title=hub_child(root,t->d_name,0);if(title<0||count>=4096){if(title>=0)close(title);result=-1;break;}close(title);
          buf_add(b,"%s{\"user\":\"%s\",\"platform\":\"%s\",\"title\":\"%s\"}",count++?",":"",u->d_name,platforms[i],t->d_name);
        }closedir(titles);
      }close(user);if(result<0)break;
    }closedir(users);buf_add(b,"]}");return result<0||b->failed?-1:0;
}
int hub_save_snapshot(const char *id){if(strncmp(id,"save-",5)||!hub_name(id))return -1;return hub_child(save_backups,id,0);}
int hub_save_backup(int source,const char *label,char id[80]){
    if(!hub_name(label)||strlen(label)>24)return -1;
    Buffer before={0},after={0};int result=hub_save_files(source,&before);if(result<0){buf_free(&before);return -1;}
    static unsigned seq;struct timespec now;if(clock_gettime(CLOCK_REALTIME,&now)<0){buf_free(&before);return -1;}
    snprintf(id,80,"save-%s-%lld-%09ld-%u",label,(long long)now.tv_sec,now.tv_nsec,++seq);char temp[96];snprintf(temp,sizeof(temp),".%s",id);
    if(mkdirat(save_backups,temp,0700)<0){buf_free(&before);return -1;}
    int target=openat(save_backups,temp,O_RDONLY|O_DIRECTORY|O_NOFOLLOW),scan=openat(source,".",O_RDONLY|O_DIRECTORY);DIR *d=scan<0?NULL:fdopendir(scan);
    if(target<0||!d){if(scan>=0&&!d)close(scan);result=-1;}
    struct dirent *e;uint64_t total=0;
    while(result==0&&(e=readdir(d))){if(!strcmp(e->d_name,".")||!strcmp(e->d_name,".."))continue;
      int in=-1,out=-1;struct stat st;char original[65],copied[65];
      if(!hub_name(e->d_name)||(in=openat(source,e->d_name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK))<0||fstat(in,&st)<0||!S_ISREG(st.st_mode)||st.st_size<0||(uint64_t)st.st_size>SAVE_LIMIT||total>SAVE_LIMIT-(uint64_t)st.st_size)result=-1;
      if(result==0){total+=(uint64_t)st.st_size;out=openat(target,e->d_name,O_CREAT|O_EXCL|O_RDWR|O_NOFOLLOW,0600);if(out<0)result=-1;}
      uint64_t left=result==0?(uint64_t)st.st_size:0;unsigned char data[65536];
      while(result==0&&left){size_t want=left<sizeof(data)?(size_t)left:sizeof(data);ssize_t n=read(in,data,want);if(n<0&&errno==EINTR)continue;if(n<=0||hub_write(out,data,(size_t)n)<0){result=-1;break;}left-=(uint64_t)n;}
      if(result==0&&(hub_hash(in,original)<0||hub_hash(out,copied)<0||strcmp(original,copied)||fsync(out)<0))result=-1;
      if(in>=0)close(in);if(out>=0&&close(out)<0)result=-1;
    }
    if(d)closedir(d);
    if(result==0&&(hub_save_files(source,&after)<0||before.len!=after.len||memcmp(before.data,after.data,before.len)))result=-1;
    if(result==0&&fsync(target)<0)result=-1;if(target>=0)close(target);buf_free(&before);buf_free(&after);
    if(result==0)result=renameat(save_backups,temp,save_backups,id);if(result==0)result=fsync(save_backups);
    if(result<0)hub_remove_tree(save_backups,temp);return result;
}
int hub_save_backups(Buffer *b){
    int scan=openat(save_backups,".",O_RDONLY|O_DIRECTORY);DIR *d=scan<0?NULL:fdopendir(scan);if(!d){if(scan>=0)close(scan);return -1;}struct dirent *e;int count=0,result=0;buf_add(b,"{\"items\":[");
    while((e=readdir(d))){if(strncmp(e->d_name,"save-",5)||!hub_name(e->d_name))continue;if(++count>4096){result=-1;break;}int dir=hub_save_snapshot(e->d_name);if(dir<0){result=-1;break;}close(dir);buf_add(b,"%s{\"id\":\"%s\"}",count>1?",":"",e->d_name);}closedir(d);buf_add(b,"]}");return result<0||b->failed?-1:0;
}
