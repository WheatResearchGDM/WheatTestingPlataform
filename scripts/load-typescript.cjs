const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
module.exports = function loader(environment = {}) {
  const cache = new Map();
  function load(file) {
    const resolved = path.resolve(__dirname, '..', file);
    if (cache.has(resolved)) return cache.get(resolved);
    const exports = {}; cache.set(resolved, exports);
    const source = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(source, { exports, ...environment, require: (name) => name.startsWith('.') ? load(path.resolve(path.dirname(resolved), name + '.ts')) : require(name) }, { filename: resolved });
    return exports;
  }
  return load;
};
