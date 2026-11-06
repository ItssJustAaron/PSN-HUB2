const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'manager-launch.js'),'utf8');
function environment(){const window={};vm.runInNewContext(source,{window,setTimeout});return window;}
(async()=>{
  const window=environment(),events=[];let sends=0,probes=0;
  const options={address:'http://192.168.1.50:8085/',send:async name=>{assert.equal(name,'PSN-HUB-Manager.elf');sends++;return 512;},ready:async()=>++probes===4,pause:async()=>{},status:text=>events.push(text),navigate:url=>events.push(url)};
  const first=window.startManagerFlow(options),duplicate=window.startManagerFlow(options);assert.equal(first,duplicate);
  const result=await first;assert.equal(sends,1);assert.equal(probes,4);assert.equal(result.opened,true);assert.equal(events.at(-1),options.address);
  sends=0;probes=0;events.length=0;const timed=await window.startManagerFlow({...options,ready:async()=>{probes++;return false;}});assert.equal(sends,1);assert.equal(probes,40);assert.equal(timed.opened,false);assert(!events.includes(options.address));assert(events.at(-1).includes('Open Manager'));
  events.length=0;let checked=false;await assert.rejects(window.startManagerFlow({...options,send:async()=>{throw new Error('download failed');},ready:async()=>{checked=true;return true;}}),/download failed/);assert.equal(checked,false);assert(!events.includes(options.address));
  probes=0;const retry=await window.startManagerFlow({...options,ready:async()=>true});assert.equal(retry.opened,true,'Explicit retry is possible after failure');
  await assert.rejects(window.startManagerFlow({...options,address:'https://outside.example/'}),/address unavailable/);
  const blocked=await window.startManagerFlow({...options,ready:async()=>true,navigate:()=>{throw new Error('Navigation blocked');}});assert.equal(blocked.opened,false);assert(events.at(-1).includes('Use Open Manager'));
  const main=fs.readFileSync(path.join(root,'main.js'),'utf8').replace(/\r\n/g,'\n'),calls=[],window2={};
  assert.equal(main.split('/* BEGIN EMBEDDED MANAGER LAUNCH */\n')[1].split('/* END EMBEDDED MANAGER LAUNCH */')[0],source.replace(/\r\n/g,'\n'),'The launcher is bundled into main.js and cannot be missing as a separate dependency');
  const segment=main.slice(main.indexOf('  const sendAddr ='),main.indexOf('  async function sendLocalPayload('));
  let active=0,maximum=0;
  vm.runInNewContext(segment,{window:window2,ip:{ip:'192.168.1.50'},p:{malloc:()=>({})},chain:{syscall:async(name)=>{calls.push(name);if(name==='socket'){active++;maximum=Math.max(maximum,active);}if(name==='close')active--;return {low:name==='socket'?10:0};}},SYS_SOCKET:'socket',SYS_CONNECT:'connect',SYS_CLOSE:'close',AF_INET:2,SOCK_STREAM:1,htons:n=>n,build_addr:(_p,_addr,_family,port)=>assert.equal(port,8085)});
  assert.equal(window2.__managerAddress,options.address);await Promise.all([window2.__managerReady(),window2.__managerReady()]);assert.equal(maximum,1);assert.deepEqual(calls,['socket','connect','close','socket','connect','close']);
  const publicList={};vm.runInNewContext(fs.readFileSync(path.join(root,'payloads.js'),'utf8'),{window:publicList});assert.deepEqual(Array.from(publicList.PAYLOAD_TILES,item=>item.name),['PSN-HUB-Manager.elf']);
  assert(!fs.readFileSync(path.join(root,'index.html'),'utf8').includes('handlePayloadsNav'));
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'Manager/catalog.json'),'utf8'));assert.deepEqual(catalog.payloads.map(item=>item.name).sort(),JSON.parse(fs.readFileSync(path.join(root,'Manager/payloads.json'),'utf8')).map(item=>item.name).sort());assert(!catalog.payloads.some(item=>item.name==='PSN-HUB-Manager.elf'));
  console.log('PASS: Manager-only public launch, one ELF send per attempt, serialized readiness, confirmed dashboard navigation, timeout fallback and explicit retry.');
})().catch(error=>{console.error(error);process.exitCode=1;});
