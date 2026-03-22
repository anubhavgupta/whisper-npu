const HotkeyRecorder = require('./hotkeyRecorder');

async function startHotkeyRecorder() {
  const recorder = new HotkeyRecorder();

  // Start the global hotkey recorder
  await recorder.start();

  // Keep the process running
  console.log('\nPress Ctrl+C to exit...');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await recorder.unregister();
    process.exit(0);
  });
}

startHotkeyRecorder().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});