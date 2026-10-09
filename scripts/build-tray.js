const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist', 'tray');
const result = spawnSync(process.env.DOTNET || 'dotnet', [
  'build', path.join(root, 'windows', 'TrayHost', 'TrayHost.csproj'),
  '--configuration', 'Release', '--output', output, '--nologo'
], { cwd: root, stdio: 'inherit' });
if (result.error) {
  console.error('Building the tray launcher requires the .NET SDK (8 or newer). Install it or set DOTNET to its executable path.');
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status || 1);
for (const name of ['whisper-npu.exe', 'whisper-npu.exe.config']) {
  fs.copyFileSync(path.join(output, name), path.join(root, name));
}
