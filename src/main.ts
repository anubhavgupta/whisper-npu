import HotkeyRecorder from './hotkeyRecorder';
import OVMSManager from './ovmsManager';

async function main(): Promise<void> {
  const ovmsManager = new OVMSManager();
  const recorder = new HotkeyRecorder();

  try {
    // Start OpenVINO server first
    await ovmsManager.start();

    // Start the global hotkey recorder
    await recorder.start();

    // Keep the process running
    console.log('\nPress Ctrl+C to exit...');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await recorder.unregister();

      // Stop OVMS server
      await ovmsManager.stop();

      process.exit(0);
    });

  } catch (error) {
    console.error('Fatal error:', (error as Error).message);
    process.exit(1);
  }
}

main();
