import { spawn } from 'child_process';
import * as path from 'path';
import { AppConfig } from './types';

export const pasteMethods = ['auto', 'ctrl-v', 'ctrl-shift-v', 'shift-insert', 'direct'] as const;
export type PasteMethod = typeof pasteMethods[number];

export function insertionOptions(config: Pick<AppConfig, 'pasteMethod' | 'clipboardRestoreDelayMs'>) {
  const method = config.pasteMethod ?? 'auto';
  const restoreDelayMs = config.clipboardRestoreDelayMs ?? 500;
  if (!pasteMethods.includes(method)) throw new Error(`Invalid pasteMethod: ${method}`);
  if (!Number.isInteger(restoreDelayMs) || restoreDelayMs < 0 || restoreDelayMs > 30000) {
    throw new Error('clipboardRestoreDelayMs must be an integer between 0 and 30000');
  }
  return { method, restoreDelayMs };
}

export default class TextInsertion {
  private readonly options: ReturnType<typeof insertionOptions>;
  constructor(config: Pick<AppConfig, 'pasteMethod' | 'clipboardRestoreDelayMs'>) {
    this.options = insertionOptions(config);
  }

  async insert(text: string): Promise<void> {
    if (!text.trim()) return;
    if (process.platform !== 'win32') throw new Error('Text insertion requires Windows');
    const packaged = !!(process as NodeJS.Process & { pkg?: unknown }).pkg;
    const base = packaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
    const helper = path.join(base, 'windows', 'insert-text.ps1');
    await new Promise<void>((resolve, reject) => {
      const child = spawn('powershell.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-STA',
        '-ExecutionPolicy', 'Bypass', '-File', helper
      ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let errorOutput = '';
      child.stderr.on('data', data => { errorOutput += data.toString(); });
      child.stdout.on('data', data => { process.stdout.write(data); });
      child.on('error', reject);
      child.stdin.on('error', reject);
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(errorOutput.trim() || `Text insertion helper exited with ${code}`));
      });
      // JSON is transported as base64 ASCII to avoid PowerShell's console encoding.
      child.stdin.end(Buffer.from(JSON.stringify({ text, ...this.options }), 'utf8').toString('base64'));
    });
  }
}
