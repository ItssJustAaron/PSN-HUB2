const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../Manager/library.js'),'utf8');
const nodes=new Map(),calls=[];
class Node {
  constructor(tag,text){this.tag=tag;this.textContent=text;this.children=[];this.events={};}
  set id(value){this.name=value;nodes.set(value,this);}get id(){return this.name;}
  append(...children){this.children.push(...children);}after(){}
  replaceChildren(...children){this.children=children;}
  setAttribute(name,value){this[name]=value;}
  addEventListener(event,fn){this.events[event]=fn;}
  querySelectorAll(){return this.children.flatMap(child=>[...(child.tag==='button'?[child]:[]),...child.querySelectorAll()]);}
  focus(){this.focused=true;}
}
const element=(tag,text)=>new Node(tag,text),action=(text,fn)=>{const node=element('button',text);node.events.click=fn;return node;};
const original=element('button');original.id='tab-emulators';nodes.set('panel-emulators',element('div'));
const state={manager:true,preview:false,backend:{}},managerTabs=[original];let selected;
const context=vm.createContext({state,element,action,managerTabs,selectTab:tab=>selected=tab,$:id=>nodes.get(id),supports:key=>state.backend[key]===true,encodeURIComponent,
  response:async(url,options)=>{calls.push({url,options});let data;
    if(url==='/api/saves')data={items:[{user:'00000001',platform:'ps5',title:'PPSA00001'}]};
    else if(url==='/api/saves/backups')data={items:[{id:'save-existing'}]};
    else if(url.startsWith('/api/saves/backup?'))data={id:'save-created'};
    else data={items:[{name:'slot.bin',size:16}]};return {text:async()=>JSON.stringify(data)};
  }});
vm.runInContext(source.slice(source.indexOf('  let saveControls=null;'),source.indexOf('  saveManagerControls(); restoreBrowsing();'))+'\nsaveManagerControls();globalThis.controls=saveControls;',context);
(async()=>{
  const controls=context.controls,tab=nodes.get('tab-save-manager');
  assert.equal(managerTabs.length,2);assert.equal(controls.refresh.disabled,true);
  await controls.refresh.events.click();assert.equal(calls.length,0,'Unsupported stable engine must receive no save calls');
  state.backend={saveRead:true,saveBackup:true};vm.runInContext('updateSaveControls()',context);
  assert.equal(controls.refresh.disabled,false);await controls.refresh.events.click();
  assert.equal(controls.list.children[0].children[0].textContent,'PS5 · PPSA00001 · User 00000001');
  await controls.list.children[0].children[1].events.click();
  assert(controls.files.children[1].children[0].href.includes('name=slot.bin'));
  await controls.list.children[0].children[2].events.click();
  const backup=calls.find(call=>call.options.method==='POST');assert(backup);assert.equal(backup.options.headers['X-PSNHUB-Request'],'1');
  assert(controls.status.textContent.includes('save-created'));assert(controls.status.textContent.includes('not a verified restorable export'));
  tab.events.click();assert.equal(selected,tab);
  tab.events.keydown({key:'ArrowRight',preventDefault(){}});assert.equal(selected,original);
  state.backend={};vm.runInContext('updateSaveControls()',context);assert.equal(controls.refresh.disabled,true);assert.equal(controls.files.children.length,0);
  console.log('PASS: Save Manager native capability gates, browsing, downloads, manual snapshot requests and tab navigation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
