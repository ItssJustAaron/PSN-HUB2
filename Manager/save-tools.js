/* PSN-HUB save tools. Garlic SaveMgr performs local PFS/account/database operations.
 * Protocol reference: earthonion/garlic-savemgr @ 08c24b5f98bf410f0addeec210857cfa07b73f63.
 * Original integration code; upstream source is not copied here. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PSNSaveTools=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const ENGINE_NAME='garlic-savemgr_08c24b5.elf', IMAGE_LIMIT=2*1024**3, ZIP_LIMIT=128*1024**2, EXPANDED_LIMIT=256*1024**2;
  const account=value=>{const hex=String(value||'').replace(/^0x/i,'');if(!/^[\da-f]{16}$/i.test(hex))throw Error('Account ID must contain exactly 16 hexadecimal characters.');return hex.toUpperCase();};
  const user=value=>{if(!/^[\da-f]{8}$/i.test(value))throw Error('Select a valid console user.');return value;};
  const platform=value=>{if(value!=='ps4'&&value!=='ps5')throw Error('Select PS4 or PS5.');return value;};
  const safePath=value=>{if(typeof value!=='string'||!value||value.length>240||/[\\\x00-\x1f\x7f:#?]/.test(value)||value.split('/').some(part=>!part||['.','..','__proto__','constructor','prototype'].includes(part)))throw Error('Unsafe save file path.');return value;};
  const crcTable=Uint32Array.from({length:256},(_,i)=>{for(let bit=0;bit<8;bit++)i=(i>>>1)^((i&1)?0xedb88320:0);return i>>>0;});
  function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&255];return (crc^0xffffffff)>>>0;}
  function inputFile(file,limit=IMAGE_LIMIT){if(!file||!Number.isSafeInteger(file.size)||file.size<=0||file.size>limit)throw Error('Select a nonempty file smaller than '+Math.round(limit/1024**2)+' MiB.');return file;}
  function metadata(bytes){
    if(bytes.length<20||bytes[0]!==0||bytes[1]!==80||bytes[2]!==83||bytes[3]!==70)throw Error('Missing or invalid sce_sys/param.sfo.');
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),keys=view.getUint32(8,true),data=view.getUint32(12,true),count=view.getUint32(16,true),out={};
    if(count>512||20+count*16>bytes.length)throw Error('Invalid SFO table.');
    for(let i=0;i<count;i++){const row=20+i*16,k=keys+view.getUint16(row,true),length=view.getUint32(row+4,true),offset=data+view.getUint32(row+12,true);if(k>=bytes.length||offset+length>bytes.length)throw Error('Invalid SFO bounds.');let end=k;while(end<bytes.length&&bytes[end])end++;const key=new TextDecoder().decode(bytes.subarray(k,end));if(['TITLE_ID','FORMAT','SAVEDATA_DIRECTORY'].includes(key))out[key]=new TextDecoder().decode(bytes.subarray(offset,offset+length)).replace(/\0.*$/s,'');}
    return out;
  }
  function checkZip(bytes){
    // Validate central-directory sizes/paths before allowing decompression.
    const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let eocd=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===bytes.length){eocd=i;break;}
    if(eocd<0||v.getUint16(eocd+4,true)||v.getUint16(eocd+6,true))throw Error('A single-volume ZIP archive is required.');
    const count=v.getUint16(eocd+10,true),size=v.getUint32(eocd+12,true),offset=v.getUint32(eocd+16,true);let pos=offset,total=0;const entries=[];
    if(!count||count>4096||v.getUint16(eocd+8,true)!==count||offset+size>eocd)throw Error('ZIP64, empty or oversized archives are unsupported.');
    for(let i=0;i<count;i++){
      if(pos+46>offset+size||v.getUint32(pos,true)!==0x02014b50)throw Error('Invalid ZIP directory.');
      const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),length=v.getUint32(pos+24,true),nameLen=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),local=v.getUint32(pos+42,true);
      if((flags&1)||![0,8].includes(method)||length===0xffffffff||local===0xffffffff||pos+46+nameLen+extra+comment>offset+size)throw Error('Encrypted, unsupported or malformed ZIP entry.');
      const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(pos+46,pos+46+nameLen)),directory=name.endsWith('/');safePath(directory?name.slice(0,-1):name);
      if(((v.getUint32(pos+38,true)>>>16)&0xf000)===0xa000)throw Error('ZIP symlinks are unsupported.');
      if(local+30>offset||v.getUint32(local,true)!==0x04034b50||v.getUint32(pos+20,true)>offset-local-30)throw Error('Invalid ZIP local entry.');
      const localName=v.getUint16(local+26,true),localExtra=v.getUint16(local+28,true);
      if(local+30+localName+localExtra+v.getUint32(pos+20,true)>offset||new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(local+30,local+30+localName))!==name)throw Error('ZIP filenames or bounds do not match.');
      if(!directory){total+=length;if(total>EXPANDED_LIMIT)throw Error('Expanded ZIP is larger than 256 MiB.');entries.push({name,size:length,crc:v.getUint32(pos+16,true)});}
      pos+=46+nameLen+extra+comment;
    }
    if(pos!==offset+size||!entries.length)throw Error('Invalid ZIP contents.');return entries;
  }
  async function prepareFiles({zip,files,fflate,type}){
    platform(type);let items=[];
    if(zip){inputFile(zip,ZIP_LIMIT);const bytes=new Uint8Array(await zip.arrayBuffer()),entries=checkZip(bytes),allowed=new Set(entries.map(item=>item.name));
      if(allowed.size!==entries.length)throw Error('Duplicate ZIP filenames.');
      const unpacked=fflate.unzipSync(bytes,{filter:entry=>allowed.has(entry.name)});
      for(const entry of entries){if(!unpacked[entry.name]||unpacked[entry.name].length!==entry.size||crc32(unpacked[entry.name])!==entry.crc)throw Error('ZIP file size or CRC mismatch.');items.push({name:entry.name,blob:new Blob([unpacked[entry.name]])});}
    }else{for(const file of Array.from(files||[]))items.push({name:safePath(file.webkitRelativePath||file.name),blob:file});}
    if(!items.length||items.length>4096)throw Error('Choose a save ZIP or a single save folder.');
    const sfos=items.filter(item=>/(^|\/)sce_sys\/param\.sfo$/.test(item.name));if(sfos.length!==1)throw Error('Select exactly one save containing sce_sys/param.sfo.');
    const prefix=sfos[0].name.slice(0,-'sce_sys/param.sfo'.length),names=new Set();let total=0;
    items=items.map(item=>{if(!item.name.startsWith(prefix))throw Error('Archive contains files outside the selected save.');const name=safePath(item.name.slice(prefix.length));if(names.has(name))throw Error('Duplicate save paths.');names.add(name);total+=item.blob.size;return {...item,name};});
    if(total>EXPANDED_LIMIT)throw Error('Folder encryption/import currently supports up to 256 MiB of files.');
    const sfo=items.find(item=>item.name==='sce_sys/param.sfo');if(sfo.blob.size>32768)throw Error('SFO is too large.');const bytes=new Uint8Array(await sfo.blob.arrayBuffer());
    const zero=bytes.length>0&&bytes.every(value=>value===0);let info={};
    if(zero){if(type!=='ps5'||!['PS5PARAM','PS5KEY','PS5IMAGE'].every(name=>names.has(name)))throw Error('A zeroed PS5 SFO requires its original PS5PARAM, PS5KEY and PS5IMAGE files.');}
    else{info=metadata(bytes);if((type==='ps4'&&!/^CUSA\d{5}$/.test(info.TITLE_ID||''))||(type==='ps5'&&!/^PPSA\d{5}$/.test(info.TITLE_ID||'')))throw Error('The save title does not match the selected platform.');}
    return {items,total,zero,info};
  }
  class Client {
    constructor({base,fetch:fetcher,fflate,backup,onProgress=()=>{}}){const url=new URL(base);if(url.protocol!=='http:'||url.port!=='8082'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Save engine must use this console on HTTP port 8082.');this.base=url.origin;this.fetch=fetcher;this.fflate=fflate;this.backup=backup;this.progress=onProgress;this.pending=null;this.owned=false;this.busy=false;this.uncertain=false;}
    url(path){if(!/^\/api\/[a-z_]+(?:\?[^\r\n#]*)?$/.test(path))throw Error('Invalid engine route.');return this.base+path;}
    async request(path,body,timeout=300000){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);let response;
      try{response=await this.fetch(this.url(path),{method:body===undefined?'GET':'POST',...(body===undefined?{}:{body,headers:{'Content-Type':'application/octet-stream'}}),cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});const result=await response.json();if(!response.ok||result.error)throw Error(result.error||'Engine HTTP '+response.status);return result;}
      catch(error){if(!response){this.uncertain=true;throw Error('Connection interrupted; the engine may still be working. Check its state before retrying. '+(error.message||''));}throw error;}finally{clearTimeout(timer);}
    }
    async connect(){const status=await this.request('/api/status',undefined,5000);if(typeof status.mounted!=='boolean')throw Error('Unexpected service on port 8082. Start the bundled Garlic SaveMgr engine.');const data=await this.request('/api/users',undefined,5000);if(!Array.isArray(data.users))throw Error('Save engine user list is unavailable.');this.uncertain=false;return {status,users:data.users.filter(item=>/^[\da-f]{8}$/i.test(item.id))};}
    async begin(){if(this.pending||this.owned)throw Error('Finish or cancel the current operation first.');if(this.uncertain)throw Error('Reconnect and check the engine before starting another operation.');const status=await this.request('/api/status',undefined,5000);if(status.mounted!==false)throw Error('The save engine already has a mounted save. Finish that session first.');this.owned=true;}
    async key(file){inputFile(file,4096);if(file.size!==96)throw Error('Select the matching 96-byte PS4 companion .bin key.');await this.request('/api/upload_key',file);}
    async exclusive(fn){if(this.busy)throw Error('A save operation is already running.');this.busy=true;try{return await fn();}finally{this.busy=false;}}
    async encryptedInput(type,image,key){platform(type);inputFile(image);if(type==='ps4'){inputFile(key,4096);if(key.size!==96)throw Error('A matching 96-byte PS4 companion key is required.');}await this.begin();if(type==='ps4')await this.key(key);}
    async decrypt({type,image,key}){return this.exclusive(async()=>{await this.encryptedInput(type,image,key);this.progress('Uploading and decrypting…');const result=await this.request('/api/decrypt_upload'+(type==='ps4'?'?ps4=1':''),image);if(result.ok!==true)throw Error('Decryption did not complete.');return {url:this.url('/api/download'),name:'decrypted-save.zip',mounted:true};});}
    async resign({type,image,key,aid}){return this.exclusive(async()=>{const owner=account(aid);await this.encryptedInput(type,image,key);this.progress('Uploading and resigning…');const result=await this.request('/api/resign?aid='+owner+(type==='ps4'?'&ps4=1':''),image);if(result.ok!==true)throw Error('Resigning did not complete.');this.owned=false;return {url:this.url('/api/resign_download?name=resigned-save'+(type==='ps4'?'&ps4=1':'')),name:type==='ps4'?'resigned-save.zip':'resigned-save',warning:result.warning||''};});}
    async encrypt({type,zip,files,aid}){return this.exclusive(async()=>{const owner=aid?account(aid):'',data=await prepareFiles({zip,files,fflate:this.fflate,type});await this.begin();this.progress('Creating encrypted save…');
      if(type==='ps5'){const contents=Object.create(null);for(const item of data.items)contents[item.name]=new Uint8Array(await item.blob.arrayBuffer());const packed=this.fflate.zipSync(contents,{level:0});const result=await this.request('/api/encrypt_upload'+(owner?'?aid='+owner:''),new Blob([packed]));if(result.ok!==true)throw Error('Encryption did not complete.');this.owned=false;return {url:this.url('/api/encrypt_download?name=encrypted-save'),name:'encrypted-save'};}
      await this.create(data,type);return {url:this.url('/api/download_new?name=encrypted-save'+(owner?'&aid='+owner:'')),name:'encrypted-save.zip',mounted:true};});}
    async create(data,type){if(data.zero)throw Error('Importing a decrypted save requires a real SFO. Encrypt the preserved PS5 archive first, then import the encrypted image.');const size=Math.max(32*1024**2,Math.ceil((data.total*1.25+4*1024**2)/32768)*32768);const result=await this.request('/api/create_pfs?size='+size+(type==='ps4'?'&ps4=1':''));if(result.ok!==true)throw Error('Creating the save image failed.');let count=0;for(const item of data.items){if(/^PS5(?:PARAM(?:_SIZE)?|KEY|IMAGE)$/.test(item.name))continue;this.progress('Uploading '+(++count)+'/'+data.items.length+': '+item.name);const result=await this.request('/api/upload_file?name='+encodeURIComponent(item.name),item.blob);if(result.ok!==true)throw Error('Uploading '+item.name+' failed.');}}
    async prepareImport({type,image,key,zip,files,uid}){return this.exclusive(async()=>{user(uid);platform(type);if(typeof this.backup!=='function')throw Error('Imports require the experimental Manager backup API on port 8087.');let staged;
      if(image){await this.encryptedInput(type,image,key);this.progress('Staging encrypted save…');staged=await this.request('/api/import_encrypted?uid='+encodeURIComponent(uid)+(type==='ps4'?'&ps4=1':''),image);if(staged.ok!==true)throw Error('Staging the encrypted save failed.');}
      else{const data=await prepareFiles({zip,files,fflate:this.fflate,type});if(data.zero)throw Error('Encrypt the preserved PS5 archive first, then import its encrypted image.');await this.begin();await this.create(data,type);staged={};}
      const preview=await this.request('/api/import_check?uid='+encodeURIComponent(uid));const title=preview.title_id||staged.title_id,dir=preview.dir_name||staged.dir_name;
      if(staged.sfo_zeroed||!new RegExp(type==='ps4'?'^CUSA\\d{5}$':'^PPSA\\d{5}$').test(title||'')||!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,126}$/.test(dir||''))throw Error('Save metadata is missing, unsafe or does not match the selected platform.');
      this.progress('Backing up existing title data before review…');const backup=await this.backup({user:uid,platform:type,title});if(!backup||(!backup.id&&!backup.newTitle))throw Error('The pre-import backup did not complete.');
      this.pending={uid,type,title,dir,exists:!!preview.exists,saveAid:staged.save_aid||'',userAid:staged.user_aid||'',backup};return {...this.pending};});}
    async finishImport(){return this.exclusive(async()=>{const pending=this.pending;if(!pending)throw Error('Prepare and review a save first.');if(this.uncertain||pending.commitAttempted)throw Error('The previous install needs checking on the console. It will not be sent again automatically.');const current=await this.request('/api/import_check?uid='+encodeURIComponent(pending.uid));if(current.title_id!==pending.title||current.dir_name!==pending.dir||!!current.exists!==pending.exists)throw Error('The staged save or destination changed. Cancel and prepare it again.');this.progress('Installing save and registering its metadata…');pending.commitAttempted=true;const result=await this.request('/api/import_finish?uid='+encodeURIComponent(pending.uid));if(result.ok!==true)throw Error('Import did not complete. No force-import was attempted. Check the console before trying another import.');this.pending=null;this.owned=false;return {...result,backup:pending.backup};});}
    async release(){return this.exclusive(async()=>{if(this.uncertain)throw Error('Reconnect first. Do not interrupt an engine operation that may still be running.');if(this.owned){const result=await this.request('/api/unmount');if(result.ok!==true)throw Error('Could not release the engine session.');}this.pending=null;this.owned=false;});}
  }
  function mount({container,element,action,fflate,fetch:fetcher,hostname,startEngine,backup,snapshotSource,canStart=()=>true,canImport=()=>typeof backup==='function'}){
    hostname=hostname.replace(/^\[|\]$/g,'');const base='http://'+(hostname.includes(':')?'['+hostname+']':hostname)+':8082';
    const section=element('section',undefined,'card save-tools');section.append(element('h3','Decrypt, encrypt, resign and import'),element('p','Powered by Garlic SaveMgr on this PS5. Close games before importing. Use one save-tool session at a time. Files are sent to this console; no cloud service is required.','hint'));
    const status=element('p','Start the save engine, then check its connection.','hint');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const client=new Client({base,fetch:fetcher,fflate,backup,onProgress:text=>status.textContent=text});let ready=false,busy=false;
    const field=(title,node)=>{const label=element('label',title);label.append(node);section.append(label);return node;};
    const select=(title,options)=>{const node=element('select');for(const [value,text] of options){const item=element('option',text);item.value=value;node.append(item);}node.value=options[0][0];return field(title,node);};
    const start=action('Start save engine',()=>run(async()=>{if(!canStart())throw Error('Open Manager on the PS5 to send the engine.');await startEngine(ENGINE_NAME);status.textContent='Check the transfer report, then choose Check engine after it starts.';}),'secondary');
    const check=action('Check engine',()=>run(async()=>{const data=await client.connect();ready=true;const selected=uid.value;uid.replaceChildren();for(const item of data.users){const option=element('option',item.name+' · '+item.id);option.value=item.id;uid.append(option);}if(data.users.some(item=>item.id===selected))uid.value=selected;else uid.value=data.users[0]?.id||'';status.textContent=data.status.mounted?'Engine connected. A save is mounted; finish its current session first.':'Engine connected. Choose an operation and files.';}),'secondary');
    section.append(start,check,status);
    const operation=select('Operation',[['decrypt','Decrypt an encrypted image'],['encrypt','Encrypt a decrypted save'],['resign','Resign an encrypted image'],['import','Import / restore a save']]);
    const type=select('Platform',[['ps5','PS5'],['ps4','PS4']]);
    const source=select('Input format',[['encrypted','Encrypted image'],['zip','Decrypted ZIP'],['folder','Decrypted folder'],['snapshot','Raw Manager snapshot']]);
    const image=field('Encrypted save image',element('input'));image.type='file';
    const key=field('PS4 companion .bin key (96 bytes)',element('input'));key.type='file';key.accept='.bin';
    const zip=field('Decrypted save ZIP (up to 128 MiB compressed)',element('input'));zip.type='file';zip.accept='.zip';
    const folder=field('Decrypted save folder (up to 256 MiB)',element('input'));folder.type='file';folder.multiple=true;folder.setAttribute('webkitdirectory','');
    const snapshot=select('Manager snapshot',[["",'Refresh snapshots to select one']]);
    const snapshotFile=select('Encrypted image in snapshot',[["",'Select a snapshot first']]);let snapshotItems=[];
    const loadSnapshots=action('Refresh snapshots',()=>run(async()=>{if(!snapshotSource)throw Error('Snapshot access requires the experimental Manager.');const data=await snapshotSource.list();snapshot.replaceChildren();for(const item of data.items){const option=element('option',item.id);option.value=item.id;snapshot.append(option);}snapshot.value=data.items[0]?.id||'';await loadSnapshotFiles();}),'secondary');section.append(loadSnapshots);
    async function loadSnapshotFiles(){snapshotFile.replaceChildren();snapshotItems=[];if(!snapshot.value)return;const data=await snapshotSource.files(snapshot.value);snapshotItems=data.items;for(const item of data.items.filter(item=>type.value==='ps5'||!item.name.endsWith('.bin'))){const option=element('option',item.name);option.value=item.name;snapshotFile.append(option);}snapshotFile.value=snapshotItems.find(item=>type.value==='ps5'||!item.name.endsWith('.bin'))?.name||'';}
    snapshot.addEventListener('change',()=>run(loadSnapshotFiles));
    const aid=field('Target Account ID (16 hex characters; optional for encryption)',element('input'));aid.type='text';aid.maxLength=18;aid.autocomplete='off';
    const uid=select('Import to console user',[["",'Check engine to load console users']]);
    const submit=action('Run selected operation',()=>run(perform));section.append(submit);
    const output=element('div'),review=element('div');review.hidden=true;const closed=element('input');closed.type='checkbox';const closedLabel=element('label','All games are closed and I have reviewed the target user and save.','save-tools-confirm');closedLabel.append(closed);
    const confirm=action('Install reviewed save',()=>run(async()=>{if(!closed.checked)throw Error('Close games and review the destination first.');const result=await client.finishImport();review.hidden=true;closed.checked=false;output.replaceChildren(element('p',result.warning?'Import returned a warning: '+result.warning:'Save imported and registered by the engine. Verify it in the game.'));status.textContent='Backup retained: '+(result.backup.id||'new title — no previous title files');}));confirm.disabled=true;
    review.append(closedLabel,confirm);section.append(output,review);
    const release=action('Cancel / release this tool session',()=>run(async()=>{await client.release();review.hidden=true;closed.checked=false;output.replaceChildren();status.textContent='Tool session released.';}),'secondary');section.append(release);
    section.append(element('p','Raw images: up to 2 GiB. PS4 downloads include the companion key in a ZIP. Download results before starting another operation. Imports require Manager’s backup API on port 8087.','hint'));
    function visibility(node,show){node.hidden=!show;const parent=node.parentNode;if(parent)parent.hidden=!show;}
    function update(){const op=operation.value,format=source.value,locked=busy||!!client.pending;
      for(const node of [operation,type,source,image,key,zip,folder,snapshot,snapshotFile,aid,uid])node.disabled=locked;
      start.disabled=busy||!!client.pending||client.owned||!canStart();check.disabled=busy;submit.disabled=busy||!ready||!!client.pending;
      confirm.disabled=busy||!client.pending||client.pending.commitAttempted||!closed.checked||client.uncertain;release.disabled=busy||(!client.owned&&!client.pending)||client.uncertain;
      visibility(image,format==='encrypted');visibility(key,type.value==='ps4'&&format==='encrypted');visibility(zip,format==='zip');visibility(folder,format==='folder');visibility(snapshot,format==='snapshot');visibility(snapshotFile,format==='snapshot');loadSnapshots.hidden=format!=='snapshot';loadSnapshots.disabled=locked||!snapshotSource;
      visibility(aid,op==='resign'||op==='encrypt');visibility(uid,op==='import');
    }
    async function run(fn){if(busy)return;busy=true;update();try{await fn();}catch(error){status.textContent=error.message;}finally{busy=false;update();}}
    async function perform(){
      const op=operation.value,format=source.value;if((op==='decrypt'||op==='resign')&&!['encrypted','snapshot'].includes(format))throw Error('This operation requires an encrypted image.');if(op==='encrypt'&&!['zip','folder'].includes(format))throw Error('Encryption requires a decrypted ZIP or folder.');
      if(client.pending||client.owned)throw Error('Download the current result and release this session before another operation.');
      if(op==='import'&&!canImport())throw Error('Open the experimental Manager on port 8087 for backed-up imports.');
      const params={type:type.value,aid:aid.value.trim(),uid:uid.value};
      if(format==='encrypted'){params.image=image.files[0];params.key=key.files[0];}
      else if(format==='zip')params.zip=zip.files[0];else if(format==='folder')params.files=folder.files;
      else{if(!snapshotSource||!snapshot.value||!snapshotFile.value)throw Error('Choose a snapshot and image first.');const item=snapshotItems.find(item=>item.name===snapshotFile.value);if(!item||item.size>IMAGE_LIMIT)throw Error('Snapshot image exceeds the engine’s 2 GiB limit.');params.image=await snapshotSource.download(snapshot.value,item.name);if(type.value==='ps4'){const name=item.name.replace(/^sdimg_/,'')+'.bin';if(!snapshotItems.some(file=>file.name===name&&file.size===96))throw Error('Matching PS4 companion key is missing from this snapshot.');params.key=await snapshotSource.download(snapshot.value,name);}}
      output.replaceChildren();
      if(op==='import'){const data=await client.prepareImport(params);output.append(element('h4','Review staged import'));for(const [label,value] of [['User',data.uid],['Platform',data.type.toUpperCase()],['Title',data.title],['Save',data.dir],['Existing save',data.exists?'will be replaced':'new save'],['Source Account ID',data.saveAid||'read from staged SFO'],['Target Account ID',data.userAid||'selected console user'],['Pre-import backup',data.backup.id||'new title — no previous files']])output.append(element('p',label+': '+value));closed.checked=false;review.hidden=false;status.textContent='Staged and backed up. Review before installing.';}
      else{const result=await client[op](params);const link=element('a','Download '+result.name);link.href=result.url;link.download=result.name;output.append(link);if(result.warning)output.append(element('p',result.warning));status.textContent='Result ready. Download it before releasing this session or starting another operation.';}
    }
    for(const control of [operation,type,source,closed])control.addEventListener('change',()=>{if(control===operation&&operation.value==='encrypt')source.value='zip';if(control===operation&&(operation.value==='decrypt'||operation.value==='resign'))source.value='encrypted';update();});
    container.append(section);update();return {client,section,update};
  }
  return {Client,ENGINE_NAME,account,user,safePath,metadata,checkZip,prepareFiles,mount};
});
