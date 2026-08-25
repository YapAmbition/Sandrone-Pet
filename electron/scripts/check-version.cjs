const fs = require('node:fs');
const path = require('node:path');

const packageJson = require('../package.json');
const plist = fs.readFileSync(path.resolve(__dirname, '../../Info.plist'), 'utf8');
const match = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
if (!match) throw new Error('无法从 Info.plist 读取原生版版本号');
if (match[1] !== packageJson.version) {
  throw new Error(`版本号不一致：Info.plist=${match[1]}，electron/package.json=${packageJson.version}`);
}
console.log(`版本号一致：${packageJson.version}`);
