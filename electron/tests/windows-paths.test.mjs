import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { windowsLaunchExecutable } = require('../src/main/windows-paths.cjs');

test('installed Windows app uses its packaged executable for login startup', () => {
  assert.equal(
    windowsLaunchExecutable('C:\\Program Files\\哈气桑多涅\\哈气桑多涅.exe', {}),
    'C:\\Program Files\\哈气桑多涅\\哈气桑多涅.exe'
  );
});

test('portable Windows app registers the original portable executable', () => {
  assert.equal(
    windowsLaunchExecutable('C:\\Users\\me\\AppData\\Local\\Temp\\pet\\哈气桑多涅.exe', {
      PORTABLE_EXECUTABLE_FILE: 'D:\\Pets\\Hissy-Sandrone-Windows-Portable.exe'
    }),
    'D:\\Pets\\Hissy-Sandrone-Windows-Portable.exe'
  );
});
