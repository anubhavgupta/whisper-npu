const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const OUTPUT_DIR = path.join(__dirname, '..', 'pack');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'whisper-npu.zip');

async function pack() {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Check if required files exist
  const exePath = path.join(__dirname, '..', 'whisper-npu.exe');
  const externalDir = path.join(__dirname, '..', 'external');
  const configPath = path.join(__dirname, '..', 'config.json');

  if (!fs.existsSync(exePath)) {
    console.error('Error: whisper-npu.exe not found. Run "npm run exe" first.');
    process.exit(1);
  }

  if (!fs.existsSync(externalDir)) {
    console.error('Error: external directory not found.');
    process.exit(1);
  }

  if (!fs.existsSync(configPath)) {
    console.error('Error: config.json not found.');
    process.exit(1);
  }

  // Create output stream
  const output = fs.createWriteStream(OUTPUT_FILE);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      console.log(`Pack created: ${OUTPUT_FILE}`);
      console.log(`Size: ${(archive.pointer() / 1024 / 1024).toFixed(2)} MB`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add files to archive
    archive.file(exePath, { name: 'whisper-npu.exe' });
    archive.directory(externalDir, 'external');
    archive.file(configPath, { name: 'config.json' });

    archive.finalize();
  });
}

pack().catch((err) => {
  console.error('Pack failed:', err);
  process.exit(1);
});
