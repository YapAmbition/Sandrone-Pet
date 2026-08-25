function windowsLaunchExecutable(execPath, environment = process.env) {
  const portableExecutable = environment.PORTABLE_EXECUTABLE_FILE;
  return typeof portableExecutable === 'string' && portableExecutable.trim()
    ? portableExecutable
    : execPath;
}

module.exports = { windowsLaunchExecutable };
