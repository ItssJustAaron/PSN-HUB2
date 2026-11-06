/* SPDX-License-Identifier: GPL-3.0-or-later
 * Reversible visibility policy for this project's duplicate Media jailbreak tile.
 * Caller owns one transaction across main, info and plan; no app records/files deleted.
 */
#include <sqlite3.h>
#include <string.h>
#include <stdio.h>
#define MEDIA_ID "PSNH00002"
#define MEDIA_CONCEPT "cid:local:PSNH00002"
#define MEDIA_SITE "https://itssjustaaron.github.io/PSN-HUB2/"
static int execute(sqlite3 *db,const char *sql){return sqlite3_exec(db,sql,0,0,0)==SQLITE_OK?0:-1;}
static int has_column(sqlite3 *db,const char *schema,const char *table,const char *column){return sqlite3_table_column_metadata(db,schema,table,column,0,0,0,0,0)==SQLITE_OK;}
static int profile_table(const char *table,const char *prefix){size_t n=strlen(prefix);if(strncmp(table,prefix,n)||!table[n])return 0;for(const char *p=table+n;*p;p++)if(*p<'0'||*p>'9')return 0;return 1;}
static int write_cell(sqlite3 *db,const char *schema,const char *table,const char *key,const char *value,sqlite3_int64 row,const char *column,const char *path,sqlite3_value *old,sqlite3_value *next){
    sqlite3_stmt *s=0;char *sql=0;
    if(path)sql=sqlite3_mprintf("UPDATE %s.\"%w\" SET \"%w\"=json_set(\"%w\",?,?) WHERE rowid=? AND \"%w\"=? AND json_extract(\"%w\",?) IS ?;",schema,table,column,column,key,column);
    else sql=sqlite3_mprintf("UPDATE %s.\"%w\" SET \"%w\"=? WHERE rowid=? AND \"%w\"=? AND \"%w\" IS ?;",schema,table,column,key,column);
    if(!sql||sqlite3_prepare_v2(db,sql,-1,&s,0)!=SQLITE_OK){sqlite3_free(sql);return -1;}sqlite3_free(sql);int index=1;
    if(path)sqlite3_bind_text(s,index++,path,-1,SQLITE_TRANSIENT);sqlite3_bind_value(s,index++,next);sqlite3_bind_int64(s,index++,row);sqlite3_bind_text(s,index++,value,-1,SQLITE_TRANSIENT);if(path)sqlite3_bind_text(s,index++,path,-1,SQLITE_TRANSIENT);sqlite3_bind_value(s,index,old);
    int code=sqlite3_step(s),changed=sqlite3_changes(db);sqlite3_finalize(s);return code==SQLITE_DONE&&changed==1?0:-1;
}
static int hide_column(sqlite3 *db,const char *schema,const char *table,const char *key,const char *value,const char *column,const char *path,const char *filter_key,int hidden){
    if(!has_column(db,schema,table,column))return 0;
    char *sql=path?sqlite3_mprintf("SELECT rowid,json_extract(\"%w\",?),json_type(\"%w\",?),\"%w\" FROM %s.\"%w\" WHERE \"%w\"=? %s;",column,column,column,schema,table,key,filter_key?"AND key=?":""):sqlite3_mprintf("SELECT rowid,\"%w\",typeof(\"%w\") FROM %s.\"%w\" WHERE \"%w\"=? %s;",column,column,schema,table,key,filter_key?"AND key=?":"");
    sqlite3_stmt *read=0;if(!sql||sqlite3_prepare_v2(db,sql,-1,&read,0)!=SQLITE_OK){sqlite3_free(sql);return -1;}sqlite3_free(sql);int index=1;if(path){sqlite3_bind_text(read,index++,path,-1,SQLITE_TRANSIENT);sqlite3_bind_text(read,index++,path,-1,SQLITE_TRANSIENT);}sqlite3_bind_text(read,index++,value,-1,SQLITE_TRANSIENT);if(filter_key)sqlite3_bind_text(read,index,filter_key,-1,SQLITE_TRANSIENT);
    int code,result=0;
    while((code=sqlite3_step(read))==SQLITE_ROW){
        if(path&&sqlite3_column_type(read,2)==SQLITE_NULL)continue;
        int type=sqlite3_column_type(read,1);if(type!=SQLITE_INTEGER&&type!=SQLITE_NULL){result=-1;break;}
        if(type==SQLITE_INTEGER&&sqlite3_column_int64(read,1)==hidden)continue;
        sqlite3_int64 row=sqlite3_column_int64(read,0);sqlite3_value *old=sqlite3_value_dup(sqlite3_column_value(read,1));sqlite3_stmt *save=0;
        const char *insert="INSERT INTO plan.media_changes(schema_name,table_name,key_column,key_value,row_id,column_name,json_path,old_value,new_value,old_document,new_document) VALUES(?,?,?,?,?,?,?,?,?,?,CASE WHEN ? IS NOT NULL THEN json_set(?,?,?) ELSE NULL END);";
        if(!old||sqlite3_prepare_v2(db,insert,-1,&save,0)!=SQLITE_OK){sqlite3_value_free(old);result=-1;break;}
        const char *texts[]={schema,table,key,value,column};for(int i=0;i<4;i++)sqlite3_bind_text(save,i+1,texts[i],-1,SQLITE_TRANSIENT);sqlite3_bind_int64(save,5,row);sqlite3_bind_text(save,6,column,-1,SQLITE_TRANSIENT);if(path)sqlite3_bind_text(save,7,path,-1,SQLITE_TRANSIENT);else sqlite3_bind_null(save,7);sqlite3_bind_value(save,8,old);sqlite3_bind_int(save,9,hidden);if(path){sqlite3_bind_value(save,10,sqlite3_column_value(read,3));sqlite3_bind_value(save,11,sqlite3_column_value(read,3));sqlite3_bind_value(save,12,sqlite3_column_value(read,3));sqlite3_bind_text(save,13,path,-1,SQLITE_TRANSIENT);sqlite3_bind_int(save,14,hidden);}else for(int j=10;j<=14;j++)sqlite3_bind_null(save,j);
        int saved=sqlite3_step(save);sqlite3_finalize(save);if(saved!=SQLITE_DONE){sqlite3_value_free(old);result=-1;break;}
        sqlite3_stmt *number=0;if(sqlite3_prepare_v2(db,"SELECT ?;",-1,&number,0)!=SQLITE_OK){sqlite3_value_free(old);result=-1;break;}sqlite3_bind_int(number,1,hidden);sqlite3_step(number);
        int updated=write_cell(db,schema,table,key,value,row,column,path,old,sqlite3_column_value(number,0));sqlite3_finalize(number);sqlite3_value_free(old);if(updated<0){result=-1;break;}
    }
    sqlite3_finalize(read);return result==0&&code==SQLITE_DONE?0:-1;
}
static int hide_json(sqlite3 *db,const char *table,const char *key,const char *value,const char *column){
    if(!has_column(db,"main",table,column))return 0;
    char *sql=sqlite3_mprintf("SELECT \"%w\" FROM main.\"%w\" WHERE \"%w\"=? LIMIT 1;",column,table,key);sqlite3_stmt *read=0;
    if(!sql||sqlite3_prepare_v2(db,sql,-1,&read,0)!=SQLITE_OK){sqlite3_free(sql);return -1;}sqlite3_free(sql);sqlite3_bind_text(read,1,value,-1,SQLITE_TRANSIENT);
    char *json=0;if(sqlite3_step(read)==SQLITE_ROW&&sqlite3_column_type(read,0)==SQLITE_TEXT)json=sqlite3_mprintf("%s",sqlite3_column_text(read,0));sqlite3_finalize(read);if(!json)return 0;
    sqlite3_stmt *shape=0;if(sqlite3_prepare_v2(db,"SELECT json_type(?,'$.field_list');",-1,&shape,0)!=SQLITE_OK){sqlite3_free(json);return -1;}sqlite3_bind_text(shape,1,json,-1,SQLITE_TRANSIENT);int code=sqlite3_step(shape);int legacy=code==SQLITE_ROW&&sqlite3_column_type(shape,0)==SQLITE_TEXT&&!strcmp((const char *)sqlite3_column_text(shape,0),"array");sqlite3_finalize(shape);int result=0;
    if(code!=SQLITE_ROW)result=-1;
    else if(!legacy){if(hide_column(db,"main",table,key,value,column,"$.DISPLAYLOCATION",0,0)<0||hide_column(db,"main",table,key,value,column,"$.display_location",0,0)<0)result=-1;}
    else{
        sqlite3_stmt *fields=0;if(sqlite3_prepare_v2(db,"SELECT key FROM json_each(?,'$.field_list') WHERE json_extract(value,'$.key')='display_location';",-1,&fields,0)!=SQLITE_OK)result=-1;
        else{sqlite3_bind_text(fields,1,json,-1,SQLITE_TRANSIENT);while((code=sqlite3_step(fields))==SQLITE_ROW){char path[96];snprintf(path,sizeof(path),"$.field_list[%lld].data",(long long)sqlite3_column_int64(fields,0));if(hide_column(db,"main",table,key,value,column,path,0,0)<0){result=-1;break;}}if(code!=SQLITE_DONE)result=-1;sqlite3_finalize(fields);}
    }sqlite3_free(json);return result;
}
static int replay_visibility(sqlite3 *db,int restore);
static int hide_flag(sqlite3 *db,const char *table);
int hub_media_hide(sqlite3 *db){
    if(sqlite3_get_autocommit(db))return -1;
    sqlite3_stmt *identity=0;if(sqlite3_prepare_v2(db,"SELECT pprDeeplinkUri FROM main.tbl_contentinfo WHERE titleId='PSNH00002';",-1,&identity,0)!=SQLITE_OK)return -1;
    int code=sqlite3_step(identity);if(code==SQLITE_DONE){sqlite3_finalize(identity);return execute(db,"INSERT OR REPLACE INTO plan.meta VALUES('mediaJailbreakHidden','1');");}int own=code==SQLITE_ROW&&sqlite3_column_type(identity,0)==SQLITE_TEXT&&!strcmp((const char *)sqlite3_column_text(identity,0),MEDIA_SITE);sqlite3_finalize(identity);if(!own)return -1;
    if(execute(db,"CREATE TABLE IF NOT EXISTS plan.media_changes(n INTEGER PRIMARY KEY,schema_name TEXT,table_name TEXT,key_column TEXT,key_value TEXT,row_id INTEGER,column_name TEXT,json_path TEXT,old_value,new_value,old_document TEXT,new_document TEXT);")<0)return -1;
    sqlite3_stmt *existing=0;if(sqlite3_prepare_v2(db,"SELECT count(*) FROM plan.media_changes;",-1,&existing,0)!=SQLITE_OK)return -1;code=sqlite3_step(existing);int recorded=code==SQLITE_ROW&&sqlite3_column_int(existing,0)>0;sqlite3_finalize(existing);if(recorded)return replay_visibility(db,0);
    if(hide_column(db,"main","tbl_contentinfo","titleId",MEDIA_ID,"dispLocation",0,0,0)<0||hide_json(db,"tbl_contentinfo","titleId",MEDIA_ID,"AppInfoJson")<0||hide_column(db,"main","tbl_conceptmetadata","localConceptId",MEDIA_CONCEPT,"dispLocation",0,0,0)<0||hide_json(db,"tbl_conceptmetadata","localConceptId",MEDIA_CONCEPT,"ConceptInfoJson")<0)return -1;
    sqlite3_stmt *tables=0;if(sqlite3_prepare_v2(db,"SELECT name FROM main.sqlite_master WHERE type='table' ORDER BY name;",-1,&tables,0)!=SQLITE_OK)return -1;int result=0;
    while((code=sqlite3_step(tables))==SQLITE_ROW){const char *table=(const char *)sqlite3_column_text(tables,0);
        if(profile_table(table,"tbl_iconinfo_")){
            const char *columns[]={"dispLocation","visible","emsDeletedFlag","emsPushedFlag"};int values[]={0,0,1,0};
            for(int i=0;i<4;i++)if(hide_column(db,"main",table,"titleId",MEDIA_ID,columns[i],0,0,values[i])<0){result=-1;break;}
        }else if(profile_table(table,"tbl_concepticoninfo_")){
            if(hide_column(db,"main",table,"primaryTitleId",MEDIA_ID,"dispLocation",0,0,0)<0||hide_column(db,"main",table,"primaryTitleId",MEDIA_ID,"validFlag",0,0,0)<0)result=-1;
        }
        else if(profile_table(table,"tbl_info_")){if(hide_flag(db,table)<0)result=-1;}
        if(result<0)break;
    }sqlite3_finalize(tables);if(result<0||code!=SQLITE_DONE)return -1;
    if(hide_column(db,"info","tbl_appinfo","titleId",MEDIA_ID,"val",0,"DISPLAYLOCATION",0)<0||hide_column(db,"info","tbl_conceptinfo","local_concept_id",MEDIA_CONCEPT,"val",0,"display_location",0)<0)return -1;
    return execute(db,"INSERT OR REPLACE INTO plan.meta VALUES('mediaJailbreakHidden','1');");
}
static int safe_record(const char *schema,const char *table,const char *key,const char *value,const char *column,const char *path){
    if(!schema||!table||!key||!value||!column)return 0;
    if(strcmp(value,MEDIA_ID)&&strcmp(value,MEDIA_CONCEPT))return 0;
    if(!strcmp(schema,"info"))return !path&&!strcmp(column,"val")&&((!strcmp(table,"tbl_appinfo")&&!strcmp(key,"titleId")&&!strcmp(value,MEDIA_ID))||(!strcmp(table,"tbl_conceptinfo")&&!strcmp(key,"local_concept_id")&&!strcmp(value,MEDIA_CONCEPT)));
    if(strcmp(schema,"main"))return 0;
    if(path){if(strcmp(column,"AppInfoJson")&&strcmp(column,"ConceptInfoJson"))return 0;if(strcmp(path,"$.DISPLAYLOCATION")&&strcmp(path,"$.display_location")&&strncmp(path,"$.field_list[",13))return 0;}
    else if(strcmp(column,"dispLocation")&&strcmp(column,"visible")&&strcmp(column,"validFlag")&&strcmp(column,"emsDeletedFlag")&&strcmp(column,"emsPushedFlag"))return 0;
    return (!strcmp(table,"tbl_contentinfo")&&!strcmp(key,"titleId")&&!strcmp(value,MEDIA_ID))||(!strcmp(table,"tbl_conceptmetadata")&&!strcmp(key,"localConceptId")&&!strcmp(value,MEDIA_CONCEPT))||(profile_table(table,"tbl_iconinfo_")&&!strcmp(key,"titleId")&&!strcmp(value,MEDIA_ID))||(profile_table(table,"tbl_concepticoninfo_")&&!strcmp(key,"primaryTitleId")&&!strcmp(value,MEDIA_ID));
}
static int safe_path(const char *path){
    if(!path||!strcmp(path,"$.DISPLAYLOCATION")||!strcmp(path,"$.display_location"))return 1;
    if(strncmp(path,"$.field_list[",13))return 0;const char *p=path+13;if(*p<'0'||*p>'9')return 0;while(*p>='0'&&*p<='9')p++;return !strcmp(p,"].data");
}
static int replay_visibility(sqlite3 *db,int restore){
    if(sqlite3_get_autocommit(db))return -1;if(!has_column(db,"plan","media_changes","old_value"))return 0;
    sqlite3_stmt *read=0;if(sqlite3_prepare_v2(db,"SELECT schema_name,table_name,key_column,key_value,row_id,column_name,json_path,old_value,new_value,old_document,new_document FROM plan.media_changes ORDER BY n DESC;",-1,&read,0)!=SQLITE_OK)return -1;int code,result=0;
    while((code=sqlite3_step(read))==SQLITE_ROW){
        const char *schema=(const char *)sqlite3_column_text(read,0),*table=(const char *)sqlite3_column_text(read,1),*key=(const char *)sqlite3_column_text(read,2),*value=(const char *)sqlite3_column_text(read,3),*column=(const char *)sqlite3_column_text(read,5),*path=(const char *)sqlite3_column_text(read,6);sqlite3_int64 row=sqlite3_column_int64(read,4);
        if(!safe_record(schema,table,key,value,column,path)||!safe_path(path)){result=-1;break;}
        sqlite3_value *expected=sqlite3_column_value(read,restore?8:7),*desired=sqlite3_column_value(read,restore?7:8);
        char *sql=path?sqlite3_mprintf("SELECT json_extract(\"%w\",?) IS ?,json_extract(\"%w\",?) IS ?,\"%w\" FROM %s.\"%w\" WHERE rowid=? AND \"%w\"=?;",column,column,column,schema,table,key):sqlite3_mprintf("SELECT \"%w\" IS ?,\"%w\" IS ?,%s FROM %s.\"%w\" WHERE rowid=? AND \"%w\"=?;",column,column,!strcmp(schema,"info")?"key":"NULL",schema,table,key);
        sqlite3_stmt *current=0;if(!sql||sqlite3_prepare_v2(db,sql,-1,&current,0)!=SQLITE_OK){sqlite3_free(sql);result=-1;break;}sqlite3_free(sql);int i=1;
        if(path)sqlite3_bind_text(current,i++,path,-1,SQLITE_TRANSIENT);sqlite3_bind_value(current,i++,desired);if(path)sqlite3_bind_text(current,i++,path,-1,SQLITE_TRANSIENT);sqlite3_bind_value(current,i++,expected);sqlite3_bind_int64(current,i++,row);sqlite3_bind_text(current,i,value,-1,SQLITE_TRANSIENT);
        int rc=sqlite3_step(current),already=rc==SQLITE_ROW&&sqlite3_column_int(current,0),matches=rc==SQLITE_ROW&&sqlite3_column_int(current,1);
        if(!strcmp(schema,"info")){const char *actual=(const char *)sqlite3_column_text(current,2);const char *wanted=!strcmp(table,"tbl_appinfo")?"DISPLAYLOCATION":"display_location";if(!actual||strcmp(actual,wanted))matches=already=0;}
        char *document=path&&rc==SQLITE_ROW&&sqlite3_column_type(current,2)==SQLITE_TEXT?sqlite3_mprintf("%s",sqlite3_column_text(current,2)):0;
        int exact=restore&&document&&sqlite3_column_type(read,10)==SQLITE_TEXT&&!strcmp(document,(const char *)sqlite3_column_text(read,10));sqlite3_free(document);
        sqlite3_finalize(current);
        if(path&&strncmp(path,"$.field_list[",13)==0){
            char key_path[128];size_t n=strlen(path);if(n+1>sizeof(key_path)){result=-1;break;}memcpy(key_path,path,n-4);strcpy(key_path+n-4,"key");
            sql=sqlite3_mprintf("SELECT json_extract(\"%w\",?) FROM %s.\"%w\" WHERE rowid=? AND \"%w\"=?;",column,schema,table,key);sqlite3_stmt *shape=0;
            if(!sql||sqlite3_prepare_v2(db,sql,-1,&shape,0)!=SQLITE_OK){sqlite3_free(sql);result=-1;break;}sqlite3_free(sql);sqlite3_bind_text(shape,1,key_path,-1,SQLITE_TRANSIENT);sqlite3_bind_int64(shape,2,row);sqlite3_bind_text(shape,3,value,-1,SQLITE_TRANSIENT);
            int valid=sqlite3_step(shape)==SQLITE_ROW&&sqlite3_column_type(shape,0)==SQLITE_TEXT&&!strcmp((const char *)sqlite3_column_text(shape,0),"display_location");sqlite3_finalize(shape);if(!valid){result=-1;break;}
        }
        if(already)continue;
        if(exact){
            sql=sqlite3_mprintf("UPDATE %s.\"%w\" SET \"%w\"=? WHERE rowid=? AND \"%w\"=? AND \"%w\" IS ?;",schema,table,column,key,column);sqlite3_stmt *whole=0;
            if(!sql||sqlite3_prepare_v2(db,sql,-1,&whole,0)!=SQLITE_OK){sqlite3_free(sql);result=-1;break;}sqlite3_free(sql);sqlite3_bind_value(whole,1,sqlite3_column_value(read,9));sqlite3_bind_int64(whole,2,row);sqlite3_bind_text(whole,3,value,-1,SQLITE_TRANSIENT);sqlite3_bind_value(whole,4,sqlite3_column_value(read,10));int done=sqlite3_step(whole),count=sqlite3_changes(db);sqlite3_finalize(whole);if(done!=SQLITE_DONE||count!=1){result=-1;break;}continue;
        }
        if(!matches||write_cell(db,schema,table,key,value,row,column,path,expected,desired)<0){result=-1;break;}
    }sqlite3_finalize(read);return result==0&&code==SQLITE_DONE?0:-1;
}
#define NSX_KEY "nsx_content_flag_PSNH00002"
#define NSX_HIDDEN "{\"deleted\":true,\"pushed\":false}"
static int hide_flag(sqlite3 *db,const char *table){
    if(!has_column(db,"main",table,"key")||!has_column(db,"main",table,"value"))return 0;
    if(execute(db,"CREATE TABLE IF NOT EXISTS plan.media_flags(table_name TEXT PRIMARY KEY,old_exists INTEGER,old_value,new_value);")<0)return -1;
    sqlite3_stmt *read=0;char *sql=sqlite3_mprintf("SELECT value FROM main.\"%w\" WHERE key=?;",table);if(!sql||sqlite3_prepare_v2(db,sql,-1,&read,0)!=SQLITE_OK){sqlite3_free(sql);return -1;}sqlite3_free(sql);sqlite3_bind_text(read,1,NSX_KEY,-1,SQLITE_STATIC);int code=sqlite3_step(read),exists=code==SQLITE_ROW;
    if(!exists&&code!=SQLITE_DONE){sqlite3_finalize(read);return -1;}sqlite3_value *old=exists?sqlite3_value_dup(sqlite3_column_value(read,0)):0;sqlite3_finalize(read);
    sqlite3_stmt *save=0;if(sqlite3_prepare_v2(db,"INSERT OR IGNORE INTO plan.media_flags VALUES(?,?,?,?);",-1,&save,0)!=SQLITE_OK){sqlite3_value_free(old);return -1;}
    sqlite3_bind_text(save,1,table,-1,SQLITE_TRANSIENT);sqlite3_bind_int(save,2,exists);if(old)sqlite3_bind_value(save,3,old);else sqlite3_bind_null(save,3);sqlite3_bind_text(save,4,NSX_HIDDEN,-1,SQLITE_STATIC);code=sqlite3_step(save);sqlite3_finalize(save);sqlite3_value_free(old);if(code!=SQLITE_DONE)return -1;
    sql=exists?sqlite3_mprintf("UPDATE main.\"%w\" SET value=? WHERE key=?;",table):sqlite3_mprintf("INSERT INTO main.\"%w\"(key,value) VALUES(?,?);",table);if(!sql||sqlite3_prepare_v2(db,sql,-1,&save,0)!=SQLITE_OK){sqlite3_free(sql);return -1;}sqlite3_free(sql);sqlite3_bind_text(save,1,exists?NSX_HIDDEN:NSX_KEY,-1,SQLITE_STATIC);sqlite3_bind_text(save,2,exists?NSX_KEY:NSX_HIDDEN,-1,SQLITE_STATIC);code=sqlite3_step(save);sqlite3_finalize(save);return code==SQLITE_DONE?0:-1;
}
static int restore_flags(sqlite3 *db){
    if(!has_column(db,"plan","media_flags","old_value"))return 0;sqlite3_stmt *read=0;if(sqlite3_prepare_v2(db,"SELECT table_name,old_exists,old_value,new_value FROM plan.media_flags;",-1,&read,0)!=SQLITE_OK)return -1;int code,result=0;
    while((code=sqlite3_step(read))==SQLITE_ROW){const char *table=(const char *)sqlite3_column_text(read,0);if(!table||!profile_table(table,"tbl_info_")){result=-1;break;}
        char *sql=sqlite3_mprintf("SELECT value IS ? FROM main.\"%w\" WHERE key=?;",table);sqlite3_stmt *guard=0;if(!sql||sqlite3_prepare_v2(db,sql,-1,&guard,0)!=SQLITE_OK){sqlite3_free(sql);result=-1;break;}sqlite3_free(sql);sqlite3_bind_value(guard,1,sqlite3_column_value(read,3));sqlite3_bind_text(guard,2,NSX_KEY,-1,SQLITE_STATIC);int valid=sqlite3_step(guard)==SQLITE_ROW&&sqlite3_column_int(guard,0);sqlite3_finalize(guard);if(!valid){result=-1;break;}
        int existed=sqlite3_column_int(read,1);sql=existed?sqlite3_mprintf("UPDATE main.\"%w\" SET value=? WHERE key=?;",table):sqlite3_mprintf("DELETE FROM main.\"%w\" WHERE key=?;",table);sqlite3_stmt *write=0;if(!sql||sqlite3_prepare_v2(db,sql,-1,&write,0)!=SQLITE_OK){sqlite3_free(sql);result=-1;break;}sqlite3_free(sql);int i=1;if(existed)sqlite3_bind_value(write,i++,sqlite3_column_value(read,2));sqlite3_bind_text(write,i,NSX_KEY,-1,SQLITE_STATIC);int rc=sqlite3_step(write);sqlite3_finalize(write);if(rc!=SQLITE_DONE){result=-1;break;}
    }sqlite3_finalize(read);return result==0&&code==SQLITE_DONE?0:-1;
}
int hub_media_restore(sqlite3 *db){if(replay_visibility(db,1)<0)return -1;return restore_flags(db);}
