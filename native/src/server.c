/* SPDX-License-Identifier: GPL-3.0-or-later
 * Experimental, single-request-at-a-time LAN server. No public Internet binding/auth.
 */
#define _POSIX_C_SOURCE 200809L
#include "hub.h"
#include "dashboard.h"
#include <arpa/inet.h>
#include <ctype.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <strings.h>
#include <sys/file.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <time.h>
#include <unistd.h>
#ifndef HUB_HOST_TEST
#include <ps5/kernel.h>
#endif
#define HEADER_LIMIT 16384
static int parents[2],payloads,backups,categories;
static const char *destinations[]={"etahen","onionhen"};
static int loader_port=9021;
typedef struct { char header[HEADER_LIMIT+1],method[8],target[8192],host[256],origin[320];size_t length,first;unsigned char *body;int marker,cross_site; } Request;
static void reply(int client,int code,const char *type,const void *data,size_t size) {
    char head[512];int n=snprintf(head,sizeof(head),"HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",code,code==200?"OK":"Error",type,size);
    if(n>0&&(size_t)n<sizeof(head)&&hub_write(client,head,(size_t)n)==0)hub_write(client,data,size);
}
static void error_reply(int fd,int code,const char *message){Buffer b={0};buf_add(&b,"{\"error\":\"%s\"}",message);reply(fd,code,"application/json",b.data,b.len);buf_free(&b);}
static void json_reply(int fd,Buffer *b){if(b->failed)error_reply(fd,500,"Response limit exceeded");else reply(fd,200,"application/json",b->data,b->len);buf_free(b);}
static int parse_request(int fd,Request *r) {
    size_t used=0;char *end=NULL;memset(r,0,sizeof(*r));
    while(used<HEADER_LIMIT){ssize_t n=read(fd,r->header+used,HEADER_LIMIT-used);if(n<0&&errno==EINTR)continue;if(n<=0)return 400;
      used+=(size_t)n;r->header[used]=0;end=strstr(r->header,"\r\n\r\n");if(end)break;}
    if(!end)return 431;
    if(memchr(r->header,0,(size_t)(end-r->header)))return 400;
    *end=0;r->body=(unsigned char *)end+4;r->first=used-(size_t)(end+4-r->header);
    char *line=strstr(r->header,"\r\n");if(!line)return 400;*line=0;
    char version[16],extra;if(sscanf(r->header,"%7s %8191s %15s %c",r->method,r->target,version,&extra)!=3||strcmp(version,"HTTP/1.1")||r->target[0]!='/')return 400;
    int have_length=0,have_host=0,have_origin=0;char *save=NULL;
    for(char *field=strtok_r(line+2,"\r\n",&save);field;field=strtok_r(NULL,"\r\n",&save)){
      if(*field==' '||*field=='\t')return 400;char *colon=strchr(field,':');if(!colon)return 400;*colon++=0;while(*colon==' '||*colon=='\t')colon++;
      size_t value_len=strlen(colon);while(value_len&&(colon[value_len-1]==' '||colon[value_len-1]=='\t'))colon[--value_len]=0;
      if(!strcasecmp(field,"Content-Length")){
        if(have_length++||!*colon)return 400;for(char *p=colon;*p;p++)if(!isdigit((unsigned char)*p))return 400;
        errno=0;unsigned long long v=strtoull(colon,NULL,10);if(errno||v>HUB_LIMIT)return 413;r->length=(size_t)v;
      }else if(!strcasecmp(field,"Transfer-Encoding"))return 400;
      else if(!strcasecmp(field,"Host")){if(have_host++||value_len>=sizeof(r->host)||!value_len)return 400;strcpy(r->host,colon);}
      else if(!strcasecmp(field,"Origin")){if(have_origin++||value_len>=sizeof(r->origin))return 400;strcpy(r->origin,colon);}
      else if(!strcasecmp(field,"X-PSNHUB-Request")){if(r->marker||strcmp(colon,"1"))return 403;r->marker=1;}
      else if(!strcasecmp(field,"Sec-Fetch-Site")&&!strcasecmp(colon,"cross-site"))r->cross_site=1;
    }
    if(!have_host||r->first>r->length)return 400;
    if(strcmp(r->method,"GET")){
      char origin[320];snprintf(origin,sizeof(origin),"http://%s",r->host);
      if(!r->marker||r->cross_site||(r->origin[0]&&strcmp(r->origin,origin)))return 403;
    }
    return 0;
}
static int unhex(char c){if(c>='0'&&c<='9')return c-'0';if(c>='A'&&c<='F')return c-'A'+10;if(c>='a'&&c<='f')return c-'a'+10;return -1;}
static int query(const Request *r,const char *key,char *out,size_t cap) {
    const char *q=strchr(r->target,'?');out[0]=0;if(!q)return 0;q++;int found=0;
    while(*q){const char *end=strchr(q,'&');if(!end)end=q+strlen(q);const char *eq=memchr(q,'=',(size_t)(end-q));
      if(eq&&(size_t)(eq-q)==strlen(key)&&!strncmp(q,key,strlen(key))){if(found++)return -1;size_t n=0;
        for(const char *p=eq+1;p<end;p++){unsigned char c=(unsigned char)*p;if(c=='%'){if(end-p<3)return -1;int a=unhex(p[1]),b=unhex(p[2]);if(a<0||b<0)return -1;c=(unsigned char)(a*16+b);p+=2;}else if(c=='+')c=' ';
          if(!c||c<32||c>126||n+1>=cap)return -1;out[n++]=(char)c;}out[n]=0;
      }q=*end?end+1:end;
    }return found;
}
static int destination(const Request *r) {char value[32];int q=query(r,"destination",value,sizeof(value));if(q<0)return -1;if(!q)return 0;for(int i=0;i<2;i++)if(!strcmp(value,destinations[i]))return i;return -1;}
static int is_payload(const char *name){const char *ext=strrchr(name,'.');return hub_name(name)&&ext&&(!strcasecmp(ext,".elf")||!strcasecmp(ext,".bin"));}
static int send_payload(const char *name) {
    if(!is_payload(name))return -1;int file=openat(payloads,name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK);if(file<0)return -1;
    struct stat st;if(fstat(file,&st)<0||!S_ISREG(st.st_mode)||st.st_size<=0||(uint64_t)st.st_size>HUB_LIMIT){close(file);return -1;}
    int sock=socket(AF_INET,SOCK_STREAM,0);if(sock<0){close(file);return -1;}
    struct timeval timeout={10,0};setsockopt(sock,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof(timeout));
    struct sockaddr_in address;memset(&address,0,sizeof(address));address.sin_family=AF_INET;address.sin_port=htons((uint16_t)loader_port);address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
    int result=connect(sock,(struct sockaddr *)&address,sizeof(address));
    unsigned char buffer[32768];ssize_t n;
    while(result==0&&(n=read(file,buffer,sizeof(buffer)))!=0){if(n<0){if(errno==EINTR)continue;result=-1;break;}result=hub_write(sock,buffer,(size_t)n);}
    close(file);close(sock);return result;
}
static int list_payloads(Buffer *b){int scan=openat(payloads,".",O_RDONLY|O_DIRECTORY);if(scan<0)return -1;DIR *d=fdopendir(scan);if(!d){close(scan);return -1;}struct dirent *e;int count=0;buf_add(b,"{\"items\":[");
    while((e=readdir(d))){struct stat st;if(!is_payload(e->d_name))continue;if(fstatat(payloads,e->d_name,&st,AT_SYMLINK_NOFOLLOW)<0){closedir(d);return -1;}if(!S_ISREG(st.st_mode))continue;buf_add(b,"%s{\"name\":\"%s\",\"size\":%lld}",count++?",":"",e->d_name,(long long)st.st_size);}
    closedir(d);buf_add(b,"]}");return b->failed?-1:0;
}
static int inventory(int root,Buffer *b,const char *destination_name){const char *formats[]={"json","mc4","shn"};int count=0;buf_add(b,"{\"destination\":\"%s\",\"items\":[",destination_name);
    for(int i=0;i<3;i++){int dir=hub_child(root,formats[i],0);if(dir<0){if(errno==ENOENT)continue;return -1;}char prefix[8];snprintf(prefix,sizeof(prefix),"%s/",formats[i]);int result=hub_inventory(dir,b,prefix,&count);close(dir);if(result<0)return -1;}buf_add(b,"]}");return b->failed?-1:0;
}
static int backup_create(int dest,char id[64]) {
    int group=hub_child(backups,destinations[dest],1);if(group<0)return -1;
    static unsigned serial;struct timespec now;if(clock_gettime(CLOCK_REALTIME,&now)<0){close(group);return -1;}snprintf(id,64,"backup-%lld-%09ld-%u",(long long)now.tv_sec,now.tv_nsec,++serial);
    char temporary[80];snprintf(temporary,sizeof(temporary),".%s",id);
    if(mkdirat(group,temporary,0700)<0){close(group);return -1;}int staged=openat(group,temporary,O_RDONLY|O_DIRECTORY|O_NOFOLLOW),root=hub_child(parents[dest],"cheats",1);size_t total=0;
    int result=staged<0||root<0?-1:hub_copy_tree(root,staged,0,&total);
    if(staged>=0)close(staged);if(root>=0)close(root);
    if(result==0){struct stat st;if(fstatat(group,id,&st,AT_SYMLINK_NOFOLLOW)==0||errno!=ENOENT)result=-1;}
    if(result==0)result=renameat(group,temporary,group,id);
    if(result==0)result=fsync(group);
    if(result<0)hub_remove_tree(group,temporary);close(group);return result;
}
static int backup_list(int dest,Buffer *b){int group=hub_child(backups,destinations[dest],1);if(group<0)return -1;DIR *d=fdopendir(group);if(!d){close(group);return -1;}struct dirent *e;int count=0;buf_add(b,"{\"destination\":\"%s\",\"backups\":[",destinations[dest]);while((e=readdir(d))){if(strncmp(e->d_name,"backup-",7)||!hub_name(e->d_name))continue;struct stat st;if(fstatat(group,e->d_name,&st,AT_SYMLINK_NOFOLLOW)<0||!S_ISDIR(st.st_mode))continue;buf_add(b,"%s{\"id\":\"%s\"}",count++?",":"",e->d_name);}closedir(d);buf_add(b,"]}");return b->failed?-1:0;}
static int read_category(const char *name,char *data,size_t cap){int fd=openat(categories,name,O_RDONLY|O_NOFOLLOW|O_NONBLOCK);if(fd<0)return -1;struct stat st;if(fstat(fd,&st)<0||!S_ISREG(st.st_mode)||st.st_size<1||(uint64_t)st.st_size>=cap){close(fd);return -1;}size_t used=0;while(used<(size_t)st.st_size){ssize_t n=read(fd,data+used,(size_t)st.st_size-used);if(n<0&&errno==EINTR)continue;if(n<=0){close(fd);return -1;}used+=(size_t)n;}close(fd);data[used]=0;return 0;}
static int category_data(char *data,unsigned *delay,char **list){char *end=strchr(data,'\n');if(!end)return -1;*end++=0;char *tail=NULL;unsigned long v=strtoul(data,&tail,10);if(!*data||*tail||v>60000)return -1;*delay=(unsigned)v;*list=end;return 0;}
static int category_json(Buffer *b,const char *name,char *data){unsigned delay;char *list;if(category_data(data,&delay,&list)<0)return -1;buf_add(b,"{\"name\":\"%s\",\"delayMs\":%u,\"payloads\":[",name,delay);int n=0;char *save=NULL;for(char *p=strtok_r(list,",",&save);p;p=strtok_r(NULL,",",&save)){if(!is_payload(p)||++n>64)return -1;buf_add(b,"%s\"%s\"",n>1?",":"",p);}if(!n)return -1;buf_add(b,"]}");return 0;}
static void handle(int fd,Request *r) {
    char path[8192];strcpy(path,r->target);char *q=strchr(path,'?');if(q)*q=0;
    int get=!strcmp(r->method,"GET"),post=!strcmp(r->method,"POST"),put=!strcmp(r->method,"PUT");
    if(!get&&!post&&!put){error_reply(fd,405,"Unsupported method");return;}
    Buffer b={0};int result=0;
    if(get&&!strcmp(path,"/")){reply(fd,200,"text/html; charset=utf-8",dashboard,dashboard_size);return;}
    if(get&&!strcmp(path,"/api/status")){
      char firmware[32]="";
#ifndef HUB_HOST_TEST
      uint32_t version=kernel_get_fw_version();if(version)snprintf(firmware,sizeof(firmware),"%x.%02x",version>>24,(version>>16)&255);
#endif
      buf_add(&b,"{\"version\":\"%s\",\"experimental\":true,\"firmware\":\"%s\",\"capabilities\":{\"destinations\":[\"etahen\",\"onionhen\"],\"cheatInventory\":true,\"cheatBackup\":true,\"cheatRestore\":true,\"backupList\":true,\"shortcuts\":false},\"manager\":{\"status\":\"failed\",\"stage\":\"not supported by experimental engine\",\"code\":0},\"jailbreak\":{\"status\":\"failed\",\"stage\":\"not supported by experimental engine\",\"code\":0}}",HUB_VERSION,firmware);
    }else if(get&&!strcmp(path,"/api/list"))result=list_payloads(&b);
    else if((put||post)&&!strcmp(path,"/api/upload")){
      char name[128];if(query(r,"name",name,sizeof(name))!=1||!is_payload(name)||!r->length){error_reply(fd,400,"Invalid payload name or empty upload");return;}
      result=hub_atomic(payloads,name,fd,r->length,r->body,r->first);buf_add(&b,"{\"saved\":true}");
    }else if(post&&!strcmp(path,"/api/delete")){
      char name[128];if(query(r,"name",name,sizeof(name))!=1||!is_payload(name)){error_reply(fd,400,"Invalid payload name");return;}result=unlinkat(payloads,name,0);if(result==0)result=fsync(payloads);buf_add(&b,"{\"deleted\":true}");
    }else if(post&&!strcmp(path,"/api/send")){
      char name[128];if(query(r,"name",name,sizeof(name))!=1||!is_payload(name)){error_reply(fd,400,"Invalid payload name");return;}result=send_payload(name);buf_add(&b,"{\"sent\":1}");
    }else if((get&&!strcmp(path,"/api/cheats"))||(get&&!strcmp(path,"/api/cheats/backups"))||(post&&(!strcmp(path,"/api/cheats/backup")||!strcmp(path,"/api/cheats/restore")||!strcmp(path,"/api/cheat-upload")))){
      int dest=destination(r);if(dest<0){error_reply(fd,400,"Unknown cheat destination");return;}
      if(get&&!strcmp(path,"/api/cheats/backups"))result=backup_list(dest,&b);
      else if(post&&!strcmp(path,"/api/cheats/backup")){char id[64];result=backup_create(dest,id);if(result==0)buf_add(&b,"{\"id\":\"%s\",\"destination\":\"%s\"}",id,destinations[dest]);}
      else if(post&&!strcmp(path,"/api/cheats/restore")){
        char id[128];if(query(r,"id",id,sizeof(id))!=1||strncmp(id,"backup-",7)||!hub_name(id)){error_reply(fd,400,"Invalid backup id");return;}
        int group=hub_child(backups,destinations[dest],0),snapshot=group<0?-1:hub_child(group,id,0);if(snapshot<0)result=-1;else result=hub_restore(parents[dest],"cheats",snapshot);if(snapshot>=0)close(snapshot);if(group>=0)close(group);buf_add(&b,"{\"restored\":true}");
      }else{int root=hub_child(parents[dest],"cheats",1);if(root<0)result=-1;
        else if(get)result=inventory(root,&b,destinations[dest]);
        else{char relative[256];if(query(r,"path",relative,sizeof(relative))!=1||!hub_cheat_path(relative)||!r->length||r->length>8u*1024u*1024u){close(root);error_reply(fd,400,"Invalid cheat path or size");return;}char *slash=strchr(relative,'/');*slash=0;int dir=hub_child(root,relative,1);result=dir<0?-1:hub_atomic(dir,slash+1,fd,r->length,r->body,r->first);if(dir>=0)close(dir);buf_add(&b,"{\"saved\":true}");}
        if(root>=0)close(root);
      }
    }else if(get&&!strcmp(path,"/api/categories")){
      int scan=openat(categories,".",O_RDONLY|O_DIRECTORY);DIR *d=scan<0?NULL:fdopendir(scan);if(!d){if(scan>=0)close(scan);result=-1;}
      else{struct dirent *e;int count=0;buf_add(&b,"{\"categories\":[");while((e=readdir(d))){if(!hub_name(e->d_name))continue;char data[8192];if(read_category(e->d_name,data,sizeof(data))<0){result=-1;break;}if(count++)buf_add(&b,",");if(category_json(&b,e->d_name,data)<0){result=-1;break;}}closedir(d);buf_add(&b,"]}");}
    }else if(post&&(!strcmp(path,"/api/category/save")||!strcmp(path,"/api/category/delete")||!strcmp(path,"/api/category/run"))){
      char name[128];if(query(r,"category",name,sizeof(name))!=1||!hub_name(name)){error_reply(fd,400,"Invalid category name");return;}
      if(!strcmp(path,"/api/category/delete")){result=unlinkat(categories,name,0);if(result==0)result=fsync(categories);buf_add(&b,"{\"deleted\":true}");}
      else if(!strcmp(path,"/api/category/save")){
        char delay[16],list[8000];if(query(r,"delay",delay,sizeof(delay))!=1||query(r,"payloads",list,sizeof(list))!=1){error_reply(fd,400,"Invalid category");return;}
        char data[8192],test[8192];int n=snprintf(data,sizeof(data),"%s\n%s",delay,list);if(n<=0||(size_t)n>=sizeof(data)){error_reply(fd,400,"Category too large");return;}strcpy(test,data);Buffer validation={0};if(category_json(&validation,name,test)<0){buf_free(&validation);error_reply(fd,400,"Invalid category contents");return;}buf_free(&validation);result=hub_atomic(categories,name,-1,(size_t)n,(unsigned char *)data,(size_t)n);buf_add(&b,"{\"saved\":true}");
      }else{char data[8192],*list=NULL;unsigned delay=0;int sent=0;if(read_category(name,data,sizeof(data))<0||category_data(data,&delay,&list)<0)result=-1;
        else{char *save=NULL;for(char *p=strtok_r(list,",",&save);p;p=strtok_r(NULL,",",&save)){if(!is_payload(p)||sent>=64||send_payload(p)<0){result=-1;break;}sent++;if(save&&*save){struct timespec pause={(time_t)(delay/1000),(long)(delay%1000)*1000000};while(nanosleep(&pause,&pause)<0&&errno==EINTR){}}}}buf_add(&b,"{\"sent\":%d}",sent);}
    }else{error_reply(fd,404,"Unknown route");return;}
    if(result<0){buf_free(&b);error_reply(fd,500,"Operation failed; check console storage, permissions or elfldr");return;}json_reply(fd,&b);
}
int main(int argc,char **argv) {
    int port=8087,base;
#ifdef HUB_HOST_TEST
    if(argc<3){fprintf(stderr,"usage: manager-host ABSOLUTE_TEST_ROOT PORT [LOADER_PORT]\n");return 2;}port=atoi(argv[2]);if(argc>3)loader_port=atoi(argv[3]);base=hub_open_path(argv[1],1);
#else
    (void)argc;(void)argv;base=hub_open_path("/data/psn-hub-native",1);
#endif
    if(base<0){perror("Manager storage");return 1;}
    int lock=openat(base,"lock",O_CREAT|O_RDWR|O_NOFOLLOW,0600);if(lock<0||flock(lock,LOCK_EX|LOCK_NB)<0){fprintf(stderr,"Manager already running or lock unavailable\n");return 1;}
    payloads=hub_child(base,"payloads",1);backups=hub_child(base,"backups",1);categories=hub_child(base,"categories",1);
#ifdef HUB_HOST_TEST
    parents[0]=hub_child(base,"etaHEN",1);parents[1]=hub_child(base,"OnionHEN",1);
#else
    parents[0]=hub_open_path("/data/etaHEN",1);parents[1]=hub_open_path("/data/OnionHEN",1);
#endif
    for(int i=0;i<2;i++){if(parents[i]<0||hub_recover(parents[i],"cheats")<0){fprintf(stderr,"Cannot recover cheat storage\n");return 1;}int dir=hub_child(parents[i],"cheats",1);if(dir<0)return 1;close(dir);}
    if(payloads<0||backups<0||categories<0)return 1;
    signal(SIGPIPE,SIG_IGN);int server=socket(AF_INET,SOCK_STREAM,0);if(server<0)return 1;int yes=1;setsockopt(server,SOL_SOCKET,SO_REUSEADDR,&yes,sizeof(yes));
    struct sockaddr_in address;memset(&address,0,sizeof(address));address.sin_family=AF_INET;address.sin_port=htons((uint16_t)port);
#ifdef HUB_HOST_TEST
    address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);
#else
    address.sin_addr.s_addr=htonl(INADDR_ANY);
#endif
    if(port<1||port>65535||bind(server,(struct sockaddr *)&address,sizeof(address))<0||listen(server,16)<0){perror("Manager listener");return 1;}
    printf("PSN-HUB native %s listening on %d\n",HUB_VERSION,port);fflush(stdout);
    for(;;){int client=accept(server,NULL,NULL);if(client<0){if(errno==EINTR)continue;break;}struct timeval timeout={30,0};setsockopt(client,SOL_SOCKET,SO_RCVTIMEO,&timeout,sizeof(timeout));setsockopt(client,SOL_SOCKET,SO_SNDTIMEO,&timeout,sizeof(timeout));Request request;int code=parse_request(client,&request);if(code)error_reply(client,code,"Invalid request, size, origin or mutation header");else handle(client,&request);close(client);}
    close(server);close(lock);close(base);return 1;
}
