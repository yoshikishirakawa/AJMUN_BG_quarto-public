const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function getPlatformPackage() {
  const key = `${process.platform}-${process.arch}`;
  const packages = {
    'darwin-arm64': '@esbuild/darwin-arm64',
    'darwin-x64': '@esbuild/darwin-x64',
    'linux-arm64': '@esbuild/linux-arm64',
    'linux-x64': '@esbuild/linux-x64',
    'win32-arm64': '@esbuild/win32-arm64',
    'win32-x64': '@esbuild/win32-x64',
  };
  return packages[key];
}

function getBinaryVersion(binaryPath) {
  return execFileSync(binaryPath, ['--version'], { encoding: 'utf8' }).trim();
}

function replaceBinary(targetPath, sourcePath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  fs.chmodSync(targetPath, 0o755);
}

function main() {
  const esbuild = require('esbuild');
  const hostVersion = esbuild.version;
  const platformPackage = getPlatformPackage();

  if (!platformPackage) {
    console.warn(`[ensure-esbuild] Unsupported platform ${process.platform}/${process.arch}. Skipping.`);
    return;
  }

  let expectedBinaryPath;
  try {
    expectedBinaryPath = require.resolve(`${platformPackage}/bin/esbuild`);
  } catch {
    throw new Error(
      `[ensure-esbuild] Missing ${platformPackage}. Current node is ${process.platform}/${process.arch}, so reinstall dependencies under the same architecture you use to run Vite.`
    );
  }
  const installedBinaryPath = path.join(path.dirname(require.resolve('esbuild')), '..', 'bin', 'esbuild');
  const expectedVersion = getBinaryVersion(expectedBinaryPath);
  const installedVersion = getBinaryVersion(installedBinaryPath);

  if (hostVersion === installedVersion && installedVersion === expectedVersion) {
    return;
  }

  replaceBinary(installedBinaryPath, expectedBinaryPath);
  const repairedVersion = getBinaryVersion(installedBinaryPath);

  if (repairedVersion !== hostVersion) {
    throw new Error(
      `[ensure-esbuild] Repair failed. host=${hostVersion} installed=${repairedVersion} expected=${expectedVersion}`
    );
  }

  console.warn(
    `[ensure-esbuild] Repaired esbuild binary mismatch. host=${hostVersion} old=${installedVersion} new=${repairedVersion}`
  );
}

main();
