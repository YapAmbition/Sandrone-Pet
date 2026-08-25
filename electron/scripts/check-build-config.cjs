const path = require('node:path');
const packageJson = require('../package.json');
const { validateConfiguration } = require('../node_modules/app-builder-lib/out/util/config/config.js');

async function main() {
  const config = packageJson.build || {};
  if (Object.prototype.hasOwnProperty.call(config, 'electronDist')) {
    throw new Error('Shared build config must not contain a machine-specific electronDist path.');
  }

  const iconPath = path.resolve(__dirname, '..', config.win?.icon || '');
  if (!require('node:fs').existsSync(iconPath)) {
    throw new Error(`Windows icon does not exist: ${iconPath}`);
  }

  await validateConfiguration(config, { isEnabled: false, add() {} });
  console.log('electron-builder 配置有效，且未包含本机 Electron 路径。');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
