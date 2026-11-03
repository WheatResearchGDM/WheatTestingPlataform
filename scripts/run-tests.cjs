const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const file of ['test-list-layout.cjs', 'test-layout-storage.cjs', 'test-road-route.cjs', 'test-beta-workflows.cjs', 'test-planting-import.cjs', 'test-adjustments.cjs']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
