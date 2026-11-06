/* SPDX-License-Identifier: GPL-3.0-or-later
 * Normalize missing-libScePosix *at calls on the PS5. FreeBSD syscalls return
 * positive errno with carry set; those values must never be used as file IDs.
 * ABI reference: ps5-payload-dev/sdk v0.45 libc/syscalls.c.
 */
#include "hub.h"
#include <errno.h>
#include <stdarg.h>
long hub_sys_result(long value,int failed){if(failed){errno=value>0&&value<4096?(int)value:EIO;return -1;}return value;}
#ifndef HUB_HOST_TEST
static long call6(long number,long a,long b,long c,long d,long e,long f){
    register long r10 __asm__("r10")=d;
    register long r8 __asm__("r8")=e;
    register long r9 __asm__("r9")=f;
    long value;unsigned char failed;
    __asm__ volatile("syscall\n\tsetc %1"
      :"=a"(value),"=qm"(failed)
      :"a"(number),"D"(a),"S"(b),"d"(c),"r"(r10),"r"(r8),"r"(r9)
      :"rcx","r11","memory","cc");
    return hub_sys_result(value,failed);
}
int hub_ps5_openat(int dir,const char *path,int flags,...){int mode=0;if(flags&O_CREAT){va_list ap;va_start(ap,flags);mode=va_arg(ap,int);va_end(ap);}return (int)call6(499,dir,(long)(intptr_t)path,flags,mode,0,0);}
int hub_ps5_mkdirat(int dir,const char *path,mode_t mode){return (int)call6(496,dir,(long)(intptr_t)path,mode,0,0,0);}
int hub_ps5_fstatat(int dir,const char *path,struct stat *st,int flags){return (int)call6(493,dir,(long)(intptr_t)path,(long)(intptr_t)st,flags,0,0);}
int hub_ps5_renameat(int olddir,const char *old,int newdir,const char *next){return (int)call6(501,olddir,(long)(intptr_t)old,newdir,(long)(intptr_t)next,0,0);}
int hub_ps5_unlinkat(int dir,const char *path,int flags){return (int)call6(503,dir,(long)(intptr_t)path,flags,0,0,0);}
#endif
