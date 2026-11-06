/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "hub.h"
#include <assert.h>
#include <errno.h>
#include <stdio.h>
int main(void){
    errno=0;assert(hub_sys_result(ENOENT,1)==-1&&errno==ENOENT);
    errno=0;assert(hub_sys_result(EEXIST,1)==-1&&errno==EEXIST);
    errno=0;assert(hub_sys_result(EACCES,1)==-1&&errno==EACCES);
    errno=123;assert(hub_sys_result(2,0)==2&&errno==123);
    assert(hub_sys_result(0,0)==0);assert(hub_sys_result(5000,1)==-1&&errno==EIO);
    puts("PASS: raw FreeBSD errors are converted to errno; valid low file handles stay valid");return 0;
}
