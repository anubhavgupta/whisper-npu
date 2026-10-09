import { Readable } from 'stream';
import { createInterface } from 'readline';

/** The tray assigns its job object before granting permission to spawn children. */
export function waitForTray(input: Readable, quit: () => void, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    let started = false;
    let closed = false;
    const control = createInterface({ input });
    const timer = setTimeout(() => {
      closed = true;
      control.close();
      reject(new Error('Tray launcher did not complete the startup handshake'));
    }, timeoutMs);
    control.on('line', line => {
      if (line === 'start' && !started && !closed) {
        started = true;
        clearTimeout(timer);
        resolve();
      } else if (line === 'quit' && !closed) {
        closed = true;
        clearTimeout(timer);
        control.close();
        if (!started) reject(new Error('Startup cancelled by tray launcher'));
        quit();
      }
    });
    control.on('close', () => {
      clearTimeout(timer);
      if (closed) return;
      closed = true;
      if (!started) reject(new Error('Tray launcher disconnected before startup'));
      quit();
    });
    input.once('error', () => control.close());
  });
}
