const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/roadRoute.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sandbox = { exports: {}, fetch: null }; vm.runInNewContext(compiled, sandbox);
const { optimizeOrder, calculateRoadRoute } = sandbox.exports;
const total = (matrix, order, round) => order.reduce((sum, to, i) => sum + matrix[i ? order[i - 1] : 0][to], 0) + (round ? matrix[order.at(-1)][0] : 0);
const permutations = (list) => list.length ? list.flatMap((value) => permutations(list.filter((n) => n !== value)).map((rest) => [value, ...rest])) : [[]];
let seed = 27;
for (let sample = 0; sample < 12; sample++) {
  const cost = Array.from({ length: 7 }, (_, row) => Array.from({ length: 7 }, (_, col) => row === col ? 0 : (seed = (seed * 48271) % 2147483647) % 100 + 1));
  for (const round of [false, true]) {
    const order = optimizeOrder(cost, round);
    const expected = Math.min(...permutations([1, 2, 3, 4, 5, 6]).map((path) => total(cost, path, round)));
    assert.equal(total(cost, order, round), expected, 'must minimize asymmetric road durations');
    assert.equal(new Set(order).size, 6);
  }
}
assert.equal(optimizeOrder([[0]]).length, 0);
assert.throws(() => optimizeOrder([[0, Infinity], [1, 0]]), /conectar/);
const large = Array.from({ length: 15 }, (_, a) => Array.from({ length: 15 }, (_, b) => Math.abs(a - b)));
assert.equal(new Set(optimizeOrder(large)).size, 14);
(async () => {
  let requests = [];
  sandbox.fetch = async (url) => { requests.push(url); return { ok: true, json: async () => url.includes('/table/') ? { code: 'Ok', durations: [[0, 20, 5], [20, 0, 3], [5, 3, 0]] } : { code: 'Ok', routes: [{ legs: [{ duration: 5, distance: 100 }, { duration: 3, distance: 80 }], geometry: { coordinates: [[-52, -28], [-51, -27]] } }] } }; };
  const result = await calculateRoadRoute([{ lat: -28, lng: -52 }, { lat: -27, lng: -51 }, { lat: -26, lng: -50 }], false, new AbortController().signal);
  assert.equal(result.order.join(','), '2,1');
  assert.equal(result.coordinates[0].join(','), '-28,-52');
  assert.ok(requests[1].includes('-52,-28;-50,-26;-51,-27'));
  sandbox.fetch = async () => ({ ok: true, json: async () => ({ code: 'Ok', durations: [[0, null], [null, 0]] }) });
  await assert.rejects(() => calculateRoadRoute([{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }], false, new AbortController().signal), /conectar/);
  console.log('Road routes: exact asymmetric optimization, return trip, large itineraries, geometry and unreachable stops passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
