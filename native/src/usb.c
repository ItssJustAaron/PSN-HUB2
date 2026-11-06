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
static int config_root=-1,mounts=-1,home=-1,enabled;
static char selected[8]="usb0";
static unsigned interval=30;
static time_t next_run,last_run;
static int last_result,exported,skipped;
static int usb_name(const char *s){return strlen(s)==4&&!strncmp(s,"usb",3)&&s[3]>='0'&&s[3]<='7';}
static int volume(const char *id){
 if(!usb_name(id))return -1;int fd=hub_child(mounts,id,0);if(fd<0)return -1;
#ifndef HUB_HOST_TEST
 struct stat a,b;if(fstat(fd,&a)<0||fstat(mounts,&b)<0||a.st_dev==b.st_dev){close(fd);return -1;}
#endif
 return fd;
}
static time_t due(void){
#ifdef HUB_HOST_TEST
 const char *test=getenv("HUB_TEST_AUTO_SECONDS");if(test)return time(NULL)+atoi(test);
#endif
 return time(NULL)+(time_t)interval*60;
}
void hub_usb_init(int base){
 config_root=dup(base);
#ifdef HUB_HOST_TEST
 mounts=hub_child(base,"usb",1);home=hub_child(base,"home",1);
#else
 mounts=hub_open_path("/mnt",0);home=hub_open_path("/user/home",0);
#endif
 int fd=openat(base,"save-usb.conf",O_RDONLY|O_NOFOLLOW|O_NONBLOCK);char text[128]={0};
 if(fd>=0){ssize_t n=read(fd,text,sizeof(text)-1);close(fd);unsigned minutes;int on;char id[8],extra;
  if(n>0&&sscanf(text,"%d %7s %u %c",&on,id,&minutes,&extra)==3&&(on==0||on==1)&&usb_name(id)&&minutes>=15&&minutes<=1440){enabled=on;interval=minutes;strcpy(selected,id);}}
 next_run=due();
}
int hub_usb_config(int on,const char *id,unsigned minutes){
 if((on!=0&&on!=1)||!usb_name(id)||minutes<15||minutes>1440)return -1;
 if(on){int usb=volume(id);if(usb<0)return -1;close(usb);}
 char text[100];int n=snprintf(text,sizeof(text),"%d %s %u\n",on,id,minutes);
 if(hub_atomic(config_root,"save-usb.conf",-1,(size_t)n,(unsigned char *)text,(size_t)n)<0)return -1;
 enabled=on;interval=minutes;strcpy(selected,id);next_run=due();return 0;
}
int hub_usb_status(Buffer *b){
 buf_add(b,"{\"supported\":true,\"enabled\":%s,\"usb\":\"%s\",\"minutes\":%u,\"lastRun\":%lld,\"lastSuccess\":%s,\"exported\":%d,\"skipped\":%d,\"volumes\":[",enabled?"true":"false",selected,interval,(long long)last_run,last_result==0?"true":"false",exported,skipped);
 int count=0;for(int i=0;i<8;i++){char id[8];snprintf(id,sizeof(id),"usb%d",i);int fd=volume(id);if(fd>=0){close(fd);buf_add(b,"%s\"%s\"",count++?",":"",id);}}buf_add(b,"]}");return b->failed?-1:0;
}
static int same_inventory(int dir,Buffer *b){
 int fd=openat(dir,"latest-inventory.json",O_RDONLY|O_NOFOLLOW|O_NONBLOCK);if(fd<0)return 0;
 struct stat st;int equal=0;if(fstat(fd,&st)==0&&S_ISREG(st.st_mode)&&(size_t)st.st_size==b->len){char *data=malloc(b->len);size_t at=0;while(data&&at<b->len){ssize_t n=read(fd,data+at,b->len-at);if(n<=0)break;at+=(size_t)n;}equal=at==b->len&&!memcmp(data,b->data,b->len);free(data);}close(fd);return equal;
}
static int export_one(const char *usb,const char *user,const char *platform,const char *title,Buffer *report,int changed_only){
 int source=hub_save_title(user,platform,title),target=volume(usb),result=-1;Buffer inventory={0};char id[80];
 if(source<0||target<0)goto done;
 const char *parts[]={"PSN-HUB","Saves",user,platform,title};
 for(int i=0;i<5;i++){int next=hub_child(target,parts[i],1);close(target);target=next;if(target<0)goto done;}
 if(hub_save_files(source,&inventory)<0)goto done;
 if(changed_only&&same_inventory(target,&inventory)){skipped++;result=0;goto done;}
 if(hub_save_backup_into(target,source,title,id)<0)goto done;
 /* Snapshot validation finishes before the successful inventory marker changes. */
 if(hub_atomic(target,"latest-inventory.json",-1,inventory.len,(unsigned char *)inventory.data,inventory.len)<0)goto done;
 exported++;if(report)buf_add(report,"{\"saved\":true,\"path\":\"/mnt/%s/PSN-HUB/Saves/%s/%s/%s/%s\"}",usb,user,platform,title,id);result=0;
done:buf_free(&inventory);if(source>=0)close(source);if(target>=0)close(target);return result;
}
int hub_usb_export(const char *usb,const char *user,const char *platform,const char *title,Buffer *b){return export_one(usb,user,platform,title,b,0);}
int hub_usb_all(const char *usb,Buffer *b){
 int check=volume(usb);if(check<0)return -1;close(check);exported=skipped=0;
 int scan=openat(home,".",O_RDONLY|O_DIRECTORY);DIR *users=scan<0?NULL:fdopendir(scan);if(!users){if(scan>=0)close(scan);return -1;}int result=0;struct dirent *u;
 while((u=readdir(users))){if(strlen(u->d_name)!=8)continue;int user=hub_child(home,u->d_name,0);if(user<0)continue;
  const char *names[]={"savedata_prospero","savedata"},*platforms[]={"ps5","ps4"};
  for(int i=0;i<2;i++){int root=hub_child(user,names[i],0);if(root<0)continue;DIR *titles=fdopendir(root);if(!titles){close(root);result=-1;continue;}struct dirent *t;
   while((t=readdir(titles))){if(strlen(t->d_name)!=9||(strncmp(t->d_name,"PPSA",4)&&strncmp(t->d_name,"CUSA",4)))continue;if(export_one(usb,u->d_name,platforms[i],t->d_name,NULL,1)<0)result=-1;}closedir(titles);
  }close(user);
 }closedir(users);last_run=time(NULL);last_result=result;
 if(b)buf_add(b,"{\"saved\":%s,\"exported\":%d,\"unchanged\":%d}",result==0?"true":"false",exported,skipped);return result;
}
void hub_usb_tick(void){if(!enabled||time(NULL)<next_run)return;hub_usb_all(selected,NULL);next_run=due();}
