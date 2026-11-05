const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),binary=fs.readFileSync(path.join(root,'payloads/PSN-HUB-Manager.elf'));
const metadata=JSON.parse(fs.readFileSync(path.join(root,'Manager/build.json')));
function environment(mode){
  const requests=[],window={};
  const context=vm.createContext({window,TextDecoder,AbortController,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,Uint8Array,
    fetch:async url=>{requests.push(url);if(url.startsWith('Manager/build.json')){
      if(mode==='offline')throw new Error('offline');
      const data={...metadata};if(mode==='bad-size')data.elfBytes=100;if(mode==='bad-hash')data.elfSha256='0'.repeat(64);
      return {ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(data)).buffer};
    }
    if(mode==='download-error'&&url.includes('?build='))return {ok:false,status:503};
    return {ok:true,arrayBuffer:async()=>Uint8Array.from(binary).buffer};
  }});
  vm.runInContext(fs.readFileSync(path.join(root,'payload-fetch.js'),'utf8'),context);return {window,requests};
}
(async()=>{
  const online=environment('online');assert.equal((await online.window.fetchPayloadFile('PSN-HUB-Manager.elf')).byteLength,binary.length);
  assert(online.requests.some(url=>url.endsWith('?build='+metadata.elfSha256)));assert(online.window.__managerPayloadSource.includes(metadata.buildId));
  const offline=environment('offline');await offline.window.fetchPayloadFile('PSN-HUB-Manager.elf');assert(offline.window.__managerPayloadSource.includes('unverified'));
  for(const mode of ['bad-size','bad-hash','download-error']){const env=environment(mode);await assert.rejects(env.window.fetchPayloadFile('PSN-HUB-Manager.elf'));assert(!env.requests.includes('payloads/PSN-HUB-Manager.elf'),'Do not silently execute a stale Manager when published validation fails');}
  await assert.rejects(online.window.fetchPayloadFile('../Manager.elf'),/Invalid/);
  let swaps=0,reloads=0;const cacheEvents={},buttonEvents={};
  const status={},button={addEventListener:(name,fn)=>buttonEvents[name]=fn};
  const cache={status:1,UPDATEREADY:4,swapCache:()=>swaps++,update(){},addEventListener:(name,fn)=>cacheEvents[name]=fn};
  vm.runInNewContext(fs.readFileSync(path.join(root,'cache-status.js'),'utf8'),{window:{applicationCache:cache},document:{getElementById:id=>id==='update-site'?button:status},location:{reload:()=>reloads++}});
  cacheEvents.updateready();assert.equal(swaps,1);assert.equal(reloads,0);buttonEvents.click();assert.equal(reloads,1);
  console.log('PASS: versioned Manager download, size/hash validation, explicit offline fallback and user-controlled cache refresh.');
})().catch(error=>{console.error(error);process.exitCode=1;});
