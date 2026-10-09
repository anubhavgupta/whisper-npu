import * as fs from 'fs';
import type { uIOhook, UiohookKey } from 'uiohook-napi';
import RecordAudio from './recordAudio';
import TranscribeAudio from './transcribeAudio';
import TextInsertion from './textInsertion';
import { HoldToRecord } from './holdToRecord';
import { HotkeyBinding } from './hotkeyBinding';
import { AppConfig } from './types';

type Hook = Pick<typeof uIOhook, 'on' | 'removeListener' | 'start' | 'stop'>;
interface Dependencies {
  config?: Pick<AppConfig, 'hotkey'>;
  hook: Hook;
  keys: typeof UiohookKey;
  recordAudio: Pick<RecordAudio, 'start' | 'stop'>;
  transcriber: Pick<TranscribeAudio, 'transcribe'>;
  insertion: Pick<TextInsertion, 'insert'>;
}

class HotkeyRecorder {
  private readonly dependencies: Dependencies;
  private readonly cycle: HoldToRecord;
  private binding?: HotkeyBinding;
  private isRegistered = false;
  private readonly abort = new AbortController();

  constructor(dependencies?: Dependencies) {
    if (dependencies) this.dependencies = dependencies;
    else {
      const { uIOhook, UiohookKey } = require('uiohook-napi') as typeof import('uiohook-napi');
      const config: AppConfig = JSON.parse(fs.readFileSync('config.json', 'utf8'));
      this.dependencies = {
        config,
        hook: uIOhook, keys: UiohookKey,
        recordAudio: new RecordAudio(), transcriber: new TranscribeAudio(), insertion: new TextInsertion(config)
      };
    }
    this.cycle = new HoldToRecord({
      start: async () => {
        console.log('\n[Recording Started]');
        const result = await this.dependencies.recordAudio.start({
          outputFile: 'recording.wav', sampleRate: 16000, channels: 1, bitDepth: 16
        });
        if (!result.success) throw new Error(result.error ?? 'Recording failed to start');
      },
      stop: async () => {
        const result = await this.dependencies.recordAudio.stop();
        if (!result.success || !result.outputFile) throw new Error(result.error ?? 'Recording failed to stop');
        return result.outputFile;
      },
      transcribe: async file => {
        if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error('Recording is missing or empty');
        console.log('[Transcription Started]');
        const transcription = await this.dependencies.transcriber.transcribe(file, 'verbose_json', this.abort.signal);
        const text = typeof transcription.text === 'string' ? transcription.text : JSON.stringify(transcription);
        console.log('\n=== TRANSCRIPTION ===\n' + text + '\n====================');
        if (!this.cycle.isClosing()) await this.dependencies.insertion.insert(text);
      },
      report: error => { console.error('Dictation failed:', error instanceof Error ? error.message : error); }
    });
  }

  async start(hotkey = this.dependencies.config?.hotkey ?? 'win+/'): Promise<void> {
    if (this.isRegistered) return;
    if (this.cycle.isClosing()) throw new Error('Recorder has been closed');
    if (typeof hotkey !== 'string' || !hotkey.trim()) {
      throw new Error('hotkey must be a non-empty shortcut string, such as "ctrl+space"');
    }
    hotkey = hotkey.split('+').map(part => part.trim()).join('+');
    const { hook, keys } = this.dependencies;
    this.binding = new HotkeyBinding(hotkey, keys, () => this.cycle.press(), () => this.cycle.releaseKey());
    hook.on('keydown', this.binding.keydown);
    hook.on('keyup', this.binding.keyup);
    try {
      hook.start();
      this.isRegistered = true;
    } catch (error) {
      hook.removeListener('keydown', this.binding.keydown);
      hook.removeListener('keyup', this.binding.keyup);
      try { hook.stop(); } catch { /* Preserve the original startup error. */ }
      throw error;
    }
    console.log(`Global hotkey registered: ${hotkey}. Hold to record, release to stop.`);
  }

  isRecordingActive(): boolean { return this.cycle.isRecording(); }

  async unregister(): Promise<void> {
    this.abort.abort();
    try {
      if (this.isRegistered && this.binding) {
        const { hook } = this.dependencies;
        hook.removeListener('keydown', this.binding.keydown);
        hook.removeListener('keyup', this.binding.keyup);
        this.isRegistered = false;
        hook.stop();
      }
    } finally { await this.cycle.close(); }
  }
}

export default HotkeyRecorder;
