const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name));
const icon=read('Manager/assets/home-icon.png'),elf=read('payloads/PSN-HUB-Manager.elf');
assert.equal(icon.readUInt32BE(16),512);assert.equal(icon.readUInt32BE(20),512);
const unified=elf.includes(Buffer.from('PSNHUB_UNIFIED_V1'));
if(unified)assert(elf.includes(icon),'unified ELF contains the reviewed icon');
else for(const [offset,capacity] of [[93232,209927],[303424,141347]]){
 const png=elf.subarray(offset,offset+capacity),parts=[png.subarray(0,8)];let pos=8;
 while(pos<png.length){const n=png.readUInt32BE(pos),kind=png.toString('ascii',pos+4,pos+8);assert(pos+n+12<=png.length);if(kind!=='npAd')parts.push(png.subarray(pos,pos+n+12));pos+=n+12;if(kind==='IEND')break;}
 assert.equal(pos,capacity);assert.deepEqual(Buffer.concat(parts),icon,'embedded icon matches reviewed export');
}
const page=read('index.html').toString();assert(page.includes('<img id="mascot-image"'));assert(!page.includes('renderTransparentMascot'));
assert(read('cache.appcache').toString().includes('mascot.png?v=2'));
const web=read('mascot.png');assert.equal(web.readUInt32BE(16),768);assert.equal(web.readUInt32BE(20),768);
if(!unified)assert(read('payloads/PSN-HUB-HD-Icons.elf').includes(icon),'legacy icon refresh ELF embeds the reviewed export');
console.log('PASS: HD web image, offline URL and reviewed native icon artwork.');
