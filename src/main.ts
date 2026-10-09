import HotkeyRecorder from './hotkeyRecorder';
import OVMSManager from './ovmsManager';
import { waitForTray } from './engineControl';

async function main(): Promise<void> {
  const trayMode = process.argv.includes('--tray-engine');
  const ovmsManager = new OVMSManager('./config.json', error => {
    console.error('OpenVINO server failed:', error.message);
    void shutdown(1);
  });
  let recorder: HotkeyRecorder | undefined;
  let shuttingDown = false;
  const shutdown = async (exitCode: number) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try { await recorder?.unregister(); }
    catch (error) { console.error('Recorder cleanup failed:', error); exitCode = 1; }
    try { await ovmsManager.stop(); }
    catch (error) { console.error('Server cleanup failed:', error); exitCode = 1; }
    process.exit(exitCode);
  };
  process.on('SIGINT', () => { void shutdown(0); });
  process.on('SIGTERM', () => { void shutdown(0); });
  try {
    if (trayMode) await waitForTray(process.stdin, () => { void shutdown(0); });
    if (shuttingDown) return;
    recorder = new HotkeyRecorder();
    await ovmsManager.start();
    if (shuttingDown) return;
    await recorder.start();
    console.log(trayMode ? '\nDictation ready. Use the tray menu to quit.' : '\nPress Ctrl+C to exit...');
  } catch (error) {
    console.error('Fatal error:', (error as Error).message);
    await shutdown(1);
  }
}

void main();
