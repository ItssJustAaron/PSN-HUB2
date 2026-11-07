const assert=require('node:assert/strict');
const {Client,prepareFiles,checkZip,account,safePath,mount}=require('../Manager/save-tools.js');
const fflate=require('../Manager/vendor/fflate-0.8.2.js');
const enc=new TextEncoder();
function sfo(type='ps5'){
  const values={TITLE_ID:type==='ps4'?'CUSA00001':'PPSA00001',SAVEDATA_DIRECTORY:'slot',FORMAT:type==='ps4'?'obs':'ppr'},keys=Object.keys(values);
  const keyBytes=enc.encode(keys.join('\0')+'\0'),data=enc.encode(Object.values(values).join('\0')+'\0'),start=20+keys.length*16,keyStart=start,dataStart=start+keyBytes.length,bytes=new Uint8Array(dataStart+data.length),v=new DataView(bytes.buffer);
  bytes.set([0,80,83,70]);v.setUint32(8,keyStart,true);v.setUint32(12,dataStart,true);v.setUint32(16,keys.length,true);let k=0,d=0;
  keys.forEach((key,i)=>{const row=20+i*16,length=enc.encode(values[key]).length+1;v.setUint16(row,k,true);v.setUint16(row+2,0x204,true);v.setUint32(row+4,length,true);v.setUint32(row+8,length,true);v.setUint32(row+12,d,true);k+=key.length+1;d+=length;});bytes.set(keyBytes,keyStart);bytes.set(data,dataStart);return bytes;
}
const zip=type=>new Blob([fflate.zipSync({'Title/slot/sce_sys/param.sfo':sfo(type),'Title/slot/data.bin':enc.encode('game progress')})]);
const image=new Blob([new Uint8Array(100)]),key=new Blob([new Uint8Array(96)]);
function mock({backup=async()=>({id:'save-backup'}),override=()=>undefined}={}){
  const calls=[];let mounted=false;
  const fetcher=async(url,options)=>{const p=new URL(url);calls.push({path:p.pathname,query:p.searchParams,options});const special=await override(p,options);if(special instanceof Error)throw special;let data=special;
    if(data===undefined){if(p.pathname==='/api/status')data={mounted};else if(p.pathname==='/api/users')data={users:[{id:'00000001',name:'Aaron'}]};else if(p.pathname==='/api/upload_file')data={ok:true,size:options.body.size};else if(p.pathname==='/api/import_check')data={title_id:'PPSA00001',dir_name:'slot',exists:true};else if(p.pathname==='/api/import_encrypted'){mounted=true;data={ok:true,title_id:'PPSA00001',dir_name:'slot',save_aid:'0000000000000001',user_aid:'0000000000000002'};}else{if(['/api/create_pfs','/api/decrypt_upload'].includes(p.pathname))mounted=true;if(['/api/unmount','/api/encrypt_upload','/api/resign','/api/import_finish'].includes(p.pathname))mounted=false;data={ok:true};}}
    return {ok:true,status:200,json:async()=>data};
  };
  return {client:new Client({base:'http://console:8082',fetch:fetcher,fflate,backup}),calls};
}
(async()=>{
  assert.throws(()=>account('123'),/16/);assert.equal(account('0x00000000000000ab'),'00000000000000AB');
  for(const path of ['../secret','/absolute','x/../../a','x\\a','__proto__/x','x\0a','x//y'])assert.throws(()=>safePath(path));
  assert.throws(()=>new Client({base:'https://cloud.example:8082',fetch,fflate}));
  const data=await prepareFiles({zip:zip('ps5'),type:'ps5',fflate});assert.equal(data.info.TITLE_ID,'PPSA00001');assert.deepEqual(data.items.map(item=>item.name),['sce_sys/param.sfo','data.bin']);
  await assert.rejects(prepareFiles({zip:zip('ps5'),type:'ps4',fflate}),/platform/);
  const unsafe=new Blob([fflate.zipSync({'../escape':enc.encode('bad'),'sce_sys/param.sfo':sfo()})]);await assert.rejects(prepareFiles({zip:unsafe,type:'ps5',fflate}),/Unsafe/);
  const corrupt=fflate.zipSync({'sce_sys/param.sfo':sfo(),'data.bin':enc.encode('hello')},{level:0});corrupt[30+'sce_sys/param.sfo'.length+2]^=1;await assert.rejects(prepareFiles({zip:new Blob([corrupt]),type:'ps5',fflate}),/CRC/);
  const bomb=fflate.zipSync({'sce_sys/param.sfo':sfo()});const view=new DataView(bomb.buffer);for(let i=0;i<bomb.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,0x7fffffff,true);break;}assert.throws(()=>checkZip(bomb),/256/);
  const zeroZip=new Blob([fflate.zipSync({'sce_sys/param.sfo':new Uint8Array(3072)})]);await assert.rejects(prepareFiles({zip:zeroZip,type:'ps5',fflate}),/original PS5PARAM/);
  {
    const {client,calls}=mock();await assert.rejects(client.resign({type:'ps4',image,key,aid:'bad'}),/16/);assert.equal(calls.length,0);
    await assert.rejects(client.decrypt({type:'ps4',image,key:new Blob(['bad'])}),/96-byte/);assert.equal(calls.length,0);
    const result=await client.decrypt({type:'ps4',image,key});assert.equal(result.url,'http://console:8082/api/download');assert.deepEqual(calls.map(call=>call.path),['/api/status','/api/upload_key','/api/decrypt_upload']);assert.equal(calls[2].query.get('ps4'),'1');await client.release();assert.equal(calls.at(-1).path,'/api/unmount');
  }
  {
    const {client,calls}=mock();const result=await client.resign({type:'ps5',image,aid:'00000000000000ab'});assert(result.url.includes('/api/resign_download'));assert.equal(calls.at(-1).query.get('aid'),'00000000000000AB');assert.equal(calls.at(-1).options.body,image);
  }
  {
    const {client,calls}=mock();const result=await client.encrypt({type:'ps5',zip:zip('ps5')});assert(result.url.includes('/api/encrypt_download'));const body=calls.at(-1).options.body;const packed=new Uint8Array(await body.arrayBuffer());assert(checkZip(packed).some(entry=>entry.name==='sce_sys/param.sfo'));assert.equal(new DataView(packed.buffer).getUint16(8,true),0,'Repacked PS5 ZIP must be stored for the upstream extractor');
  }
  {
    const {client,calls}=mock();const result=await client.encrypt({type:'ps4',zip:zip('ps4'),aid:'0000000000000001'});assert(result.url.includes('/api/download_new'));assert.equal(calls.find(call=>call.path==='/api/create_pfs').query.get('ps4'),'1');assert.equal(calls.filter(call=>call.path==='/api/upload_file').length,2);await client.release();
  }
  {
    const {client,calls}=mock({override:p=>p.pathname==='/api/upload_file'?{ok:true,size:1}:undefined});await assert.rejects(client.encrypt({type:'ps4',zip:zip('ps4')}),/incomplete/);assert(!calls.some(call=>call.path==='/api/import_finish'));await client.release();
  }
  {
    const backups=[];const {client,calls}=mock({backup:async selection=>{backups.push(selection);return {id:'save-original'};}});await assert.rejects(client.finishImport(),/Prepare/);
    const preview=await client.prepareImport({type:'ps5',image,uid:'00000001',expectedTitle:'PPSA00001'});assert.equal(preview.backup.id,'save-original');assert.equal(preview.userAid,'0000000000000002');assert.deepEqual(backups,[{user:'00000001',platform:'ps5',title:'PPSA00001'}]);assert(!calls.some(call=>call.path==='/api/import_finish'),'Review must not install anything');
    const result=await client.finishImport();assert.equal(result.backup.id,'save-original');assert.equal(calls.at(-1).query.get('uid'),'00000001');assert(!calls.at(-1).query.has('force'));await assert.rejects(client.finishImport(),/Prepare/);assert.equal(calls.filter(call=>call.path==='/api/import_finish').length,1);
  }
  {
    const {client}=mock({backup:async()=>assert.fail('Mismatched titles must fail before backup')});
    await assert.rejects(client.prepareImport({type:'ps5',image,uid:'00000001',expectedTitle:'PPSA00002'}),/does not match/);
    await assert.rejects(client.finishImport(),/Prepare/);
    await client.release();
  }
  {
    const {client}=mock({backup:async()=>({newTitle:true})});
    await assert.rejects(client.prepareImport({type:'ps5',image,uid:'00000001'}),/backup did not complete/);
    await assert.rejects(client.finishImport(),/Prepare/);
    await client.release();
  }
  {
    const {client,calls}=mock({backup:async()=>{throw Error('disk full');}});await assert.rejects(client.prepareImport({type:'ps5',image,uid:'00000001'}),/disk full/);await assert.rejects(client.finishImport(),/Prepare/);assert(!calls.some(call=>call.path==='/api/import_finish'));await client.release();
  }
  {
    let changed=false;const {client,calls}=mock({override:p=>p.pathname==='/api/import_check'&&changed?{title_id:'PPSA00002',dir_name:'slot',exists:true}:undefined});await client.prepareImport({type:'ps5',image,uid:'00000001'});changed=true;await assert.rejects(client.finishImport(),/changed/);assert(!calls.some(call=>call.path==='/api/import_finish'));await client.release();
  }
  {
    const {client,calls}=mock({override:p=>p.pathname==='/api/import_finish'?Error('lost connection'):undefined});await client.prepareImport({type:'ps5',image,uid:'00000001'});await assert.rejects(client.finishImport(),/may still be working/);await client.connect();await assert.rejects(client.finishImport(),/will not be sent again/);assert.equal(calls.filter(call=>call.path==='/api/import_finish').length,1);
  }
  {
    const {client,calls}=mock({override:p=>p.pathname==='/api/import_encrypted'?{ok:true,sfo_zeroed:true}:undefined});await assert.rejects(client.prepareImport({type:'ps5',image,uid:'00000001'}),/metadata/);assert(!calls.some(call=>call.path==='/api/import_finish'));
  }
  {
    class E {
      constructor(tag,text){this.tag=tag;this.textContent=text;this.children=[];this.events={};this.files=[];this.checked=false;this.value="";}
      append(...nodes){nodes.forEach(node=>{node.parentNode=this;this.children.push(node);});}
      replaceChildren(...nodes){this.children=[];this.append(...nodes);}
      setAttribute(name,value){this[name]=value;}addEventListener(name,fn){this.events[name]=fn;}
    }
    const element=(tag,text)=>new E(tag,text),action=(text,fn)=>{const e=element('button',text);e.events.click=fn;return e;};
    const container=element('div'),{client:fake,calls}=mock();
    const view=mount({container,element,action,fflate,hostname:'console',fetch:fake.fetch,backup:async()=>({id:'save-before-import'}),startEngine:async()=>{},canStart:()=>false});
    const all=node=>[node,...node.children.flatMap(all)],find=text=>all(view.section).find(node=>node.tag==='button'&&node.textContent===text),field=title=>all(view.section).find(node=>node.tag==='label'&&node.textContent===title).children[0];
    assert.equal(find('Start save engine').disabled,true);await find('Check engine').events.click();
    const operation=field('Operation');operation.value='import';operation.events.change();field('Encrypted save image').files=[image];
    await find('Run selected operation').events.click();
    assert(view.client.pending,all(view.section).filter(node=>node.tag==='p').map(node=>node.textContent).join(' | '));
    const install=find('Install reviewed save');assert.equal(install.disabled,true);assert(!calls.some(call=>call.path==='/api/import_finish'));
    const closed=field('All games are closed and I have reviewed the target user and save.');closed.checked=true;closed.events.change();assert.equal(install.disabled,false);
    await install.events.click();assert.equal(calls.filter(call=>call.path==='/api/import_finish').length,1);assert.equal(install.disabled,true);
  }
  console.log('PASS: local save-engine protocol, ZIP bounds/CRC/traversal, PS4 keys, PS5 metadata, transforms, pre-import backup, review controls and no-retry import contracts.');
})().catch(error=>{console.error(error);process.exitCode=1;});
