const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../Manager/library.js'),'utf8');
const nodes=new Map(),calls=[];
class Node {
  constructor(tag,text){this.tag=tag;this.textContent=text;this.children=[];this.events={};}
  set id(value){this.name=value;nodes.set(value,this);}get id(){return this.name;}
  append(...children){this.children.push(...children);}after(){}
  replaceChildren(...children){this.children=children;}
  setAttribute(name,value){this[name]=value;}
  getAttribute(name){return this[name];}
  addEventListener(event,fn){this.events[event]=fn;}
  querySelectorAll(){return this.children.flatMap(child=>[...(child.tag==='button'?[child]:[]),...child.querySelectorAll()]);}
  focus(){this.focused=true;}
}
const element=(tag,text)=>new Node(tag,text),action=(text,fn)=>{const node=element('button',text);node.events.click=fn;return node;};
const original=element('button');original.id='tab-emulators';nodes.set('panel-emulators',element('div'));
const state={manager:true,preview:false,backend:{}},managerTabs=[original];let selected;
const context=vm.createContext({state,element,action,managerTabs,location:{hostname:'console'},selectTab:tab=>{selected=tab;tab.setAttribute('aria-selected','true');},$:id=>nodes.get(id),supports:key=>state.backend[key]===true,encodeURIComponent,
  response:async(url,options)=>{calls.push({url,options});let data;
    if(url==='/api/saves')data={items:[{user:'00000001',platform:'ps5',title:'PPSA00001'}]};
    else if(url.startsWith('/api/saves/usb/config')||url==='/api/saves/usb')data={volumes:['usb0'],enabled:false,usb:'usb0',minutes:30,lastRun:0};
    else if(url.startsWith('/api/saves/usb/all'))data={exported:1,unchanged:2};
    else if(url==='/api/saves/backups')data={items:[{id:'save-existing'}]};
    else if(url.startsWith('/api/saves/backup?'))data={id:'save-created'};
    else data={items:[{name:'slot.bin',size:16}]};return {text:async()=>JSON.stringify(data)};
  }});
vm.runInContext(source.slice(source.indexOf('  let saveControls=null;'),source.indexOf('  saveManagerControls(); backgroundControls();'))+'\nsaveManagerControls();globalThis.controls=saveControls;',context);
(async()=>{
  const controls=context.controls,tab=nodes.get('tab-save-manager');
  assert.equal(managerTabs.length,2);assert.equal(controls.refresh.disabled,true);
  await controls.refresh.events.click();assert.equal(calls.length,0,'Unsupported stable engine must receive no save calls');
  await tab.events.click();assert.equal(controls.frame.src,'http://console:8087/#console-saves');assert.equal(calls.length,0,'Stable page embeds the local native save browser instead of calling nonexistent stable APIs');
  state.backend={saveRead:true,saveBackup:true};vm.runInContext('updateSaveControls()',context);
  await new Promise(setImmediate);
  assert.equal(controls.refresh.disabled,false);await controls.refresh.events.click();
  assert.equal(controls.list.children[0].children[0].textContent,'PS5 · PPSA00001 · User 00000001');
  await controls.list.children[0].children[1].events.click();
  assert(controls.files.children[1].children[0].href.includes('name=slot.bin'));
  await controls.list.children[0].children[2].events.click();
  const backup=calls.find(call=>call.options.method==='POST');assert(backup);assert.equal(backup.options.headers['X-PSNHUB-Request'],'1');
  assert(controls.status.textContent.includes('save-created'));assert(controls.status.textContent.includes('not a verified restorable export'));
  state.backend.saveUSB=true;await controls.refresh.events.click();assert.equal(controls.usbSelect.value,'usb0');
  controls.auto.checked=true;await controls.usbButtons[2].events.click();
  assert(calls.some(call=>call.url.includes('/api/saves/usb/config?usb=usb0&enabled=1&minutes=30')&&call.options.method==='POST'));
  state.backend.saveUSB=false;
  await tab.events.click();assert.equal(selected,tab);
  tab.events.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(selected,original);
  state.backend={};vm.runInContext('updateSaveControls()',context);assert.equal(controls.refresh.disabled,true);assert.equal(controls.files.children.length,0);
  context.window={};context.repositoryBase='https://source/';context.UI_RELEASE='test';context.location={hostname:'console'};context.requestHeaders=()=>({});context.fetch=()=>{};
  context.document={head:{append(script){vm.runInContext(script.textContent,context);}}};const scriptURLs=[];
  context.response=async url=>{scriptURLs.push(url);return {text:async()=>url.includes('fflate')?'window.fflate={};':'window.PSNSaveTools={mount:options=>{globalThis.loadedOptions=options;}};'};};
  context.downloadURL=()=>{throw Error('Payload-only path validation must not handle script assets');};
  const container=element('div'),button=element('button');await context.loadSaveTools(container,button);
  assert.equal(button.hidden,true);assert.deepEqual(scriptURLs,['https://source/Manager/vendor/fflate-0.8.2.js?v=test','https://source/Manager/save-tools.js?v=test']);assert.equal(context.loadedOptions.hostname,'console');assert.equal(context.loadedOptions.canImport(),false);
  await assert.rejects(context.loadedOptions.backup({}),/8087/);
  const payloadPanel=element('div');nodes.set('panel-my-library',payloadPanel);context.backgroundControls();const card=payloadPanel.children[0],apply=card.children[2],restore=card.children[3],message=card.children[4];
  const entry={name:'PSN-HUB-Store-Background.elf',path:'payloads/PSN-HUB-Store-Background.elf'};state.catalog={payloads:[entry,{name:'PSN-HUB-Store-Background-Restore.elf',path:'payloads/PSN-HUB-Store-Background-Restore.elf'}]};let sends=0;
  context.startTransfer=async items=>{sends++;state.transfer={completed:items,failures:[],running:false,cancelled:false};};
  context.response=async url=>{assert.equal(url,'http://console:8093/api/status');return {text:async()=>JSON.stringify({success:true,operation:'apply-background',sha256:'43ae997fe0b0ff3dca9d50d489baa9f948caa9069815c0c443700369c1e24d85',message:'Background applied'})};};
  await apply.events.click();assert.equal(sends,1);assert.equal(message.textContent,'Background applied');
  await restore.events.click();assert.equal(sends,2);assert(message.textContent.includes('Unexpected background updater result'));
  state.preview=true;await apply.events.click();assert.equal(sends,2,'Preview must never send a background payload');
  assert(source.includes('payloadLibrary.hidden=true'));
  assert(!source.includes("renderPayloads($('payload-library'), data.payloads"));
  const css=fs.readFileSync(path.join(__dirname,'../Manager/library.css'),'utf8');assert(css.includes('#panel-payloads #list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))'));
  console.log('PASS: Save Manager capability gates, script loader, snapshots and background result verification.');
})().catch(error=>{console.error(error);process.exitCode=1;});
