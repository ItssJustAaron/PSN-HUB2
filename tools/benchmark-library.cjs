const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {performance} = require('node:perf_hooks');
const root = path.resolve(__dirname, '..');
const files = JSON.parse(fs.readFileSync(path.join(root,'Manager/catalog.json'))).cheats;
const source = fs.readFileSync(path.join(root,'Manager/library.js'),'utf8');
const start = source.indexOf('  const searchIndex ='), end = source.indexOf('  function applyFilters()');
const api = vm.runInNewContext(source.slice(start,end)+'\n({filterCheats,groupCheats});');
function reference(filters) {
  const words = filters.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return files.filter(file => (!filters.platform || file.platform === filters.platform) &&
    (!filters.format || file.format === filters.format) && (!filters.version || file.version.toLowerCase().includes(filters.version.toLowerCase().trim())) &&
    words.every(word => [file.title,file.id,...(file.creators||[])].join(' ').toLowerCase().includes(word)));
}
const queries = ['', 'the', 'god war', 'Killzone', 'PPSA', 'no-such-game-qqqq'];
const cases = queries.flatMap(query => ['', 'PS4','PS5'].flatMap(platform => ['', 'json','mc4','shn'].map(format => ({query,platform,format,version:query==='the'?'01.00':''}))));
for (const filters of cases) assert.deepEqual(Array.from(api.filterCheats(files,filters),file=>file.path),reference(filters).map(file=>file.path));
const grouped = api.groupCheats(files);
assert.equal(api.groupCheats(files),grouped,'Repeated catalogue grouping reuses the index');
assert.equal(grouped.reduce((total,game)=>total+game.files.length,0),files.length);
assert.notEqual(api.groupCheats(files.slice(0,10)),grouped,'A new catalogue gets its own index');
function measure(fn) { const start=performance.now();for(let repeat=0;repeat<8;repeat++)for(const filters of cases)fn(filters);return performance.now()-start; }
const before=measure(reference),after=measure(filters=>api.filterCheats(files,filters));
console.log(`PASS: ${cases.length} search combinations match the original results across ${files.length} files; grouping is reused and new catalogues stay independent.`);
console.log(`Search benchmark (${cases.length*8} queries): original ${before.toFixed(0)} ms, indexed ${after.toFixed(0)} ms. Timing varies by machine.`);
