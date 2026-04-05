const fs = require('fs');
const path = require('path');

const dirsToClean = [
  path.join(__dirname, '..', 'dist'),
  path.join(__dirname, '..', 'pack')
];

const filesToClean = [
  path.join(__dirname, '..', 'whisper-npu.exe')
];

dirsToClean.forEach(dir => {
  fs.rmSync(dir, { recursive: true, force: true });
});

filesToClean.forEach(file => {
  fs.rmSync(file, { force: true });
});
