import globalHotkey from 'global-hotkey';
import RecordAudio from './recordAudio';
import TranscribeAudio from './transcribeAudio';
import { exec, ChildProcess } from 'child_process';

interface HotkeyEvent {
  [key: string]: boolean | number;
  keyCode: number;
}

class HotkeyRecorder {
  private isRecording: boolean = false;
  private recordAudio: RecordAudio;
  private transcriber: TranscribeAudio;
  private isRegistered: boolean = false;
  private hotkey: string = 'win+/';
  private listenerId: number | null = null;

  constructor() {
    this.recordAudio = new RecordAudio();
    this.transcriber = new TranscribeAudio();
  }

  /**
   * Start recording with global hotkey
   * @param hotkey - The hotkey combination (default: 'win+/')
   */
  async start(hotkey: string = 'win+/'): Promise<void> {
    this.hotkey = hotkey;
    if (this.isRegistered) {
      console.log('Hotkey already registered');
      return;
    }

    try {
      // Parse hotkey string
      const keyEvent = this.parseHotkey(hotkey);

      // Start listening for key events
      globalHotkey.startListening();

      // Add listener for the hotkey combination
      this.listenerId = globalHotkey.addListener(keyEvent, () => {
        console.log('Hotkey pressed! Toggling recording...');
        this.toggleRecording();
      });

      this.isRegistered = true;
      console.log(`Global hotkey registered: ${hotkey}`);
      console.log('Press the hotkey to start/stop recording');

    } catch (error) {
      console.error('Failed to register hotkey:', (error as Error).message);
    }
  }

  /**
   * Parse hotkey string to object format
   * @param hotkey - Hotkey string like 'win+/'
   * @returns HotkeyEvent - Key event object
   */
  parseHotkey(hotkey: string): HotkeyEvent {
    const parts = hotkey.split('+');
    const modifier = parts[0]; // win, ctrl, alt
    const key = parts[1]; // /

    const modifiers: Record<string, string> = {
      'win': 'meta',
      'ctrl': 'ctrl',
      'alt': 'alt',
      'meta': 'meta'
    };

    const keyCodes: Record<string, number> = {
      '/': 0xBF,  // OEM_2 - Regular slash key
      '?': 0xBF,  // Same as slash
      '@': 0x40,
      '&': 0x26,
      '*': 0x6A,
      '+': 0xBB,
      '=': 0xBB,
      '-': 0xBD,
      '_': 0xBD,
      '[': 0xDB,
      ']': 0xDD,
      '\\': 0xDC,
      '|': 0xDC,
      ';': 0xBA,
      ':': 0xBA,
      "'": 0xDE,
      '"': 0xDE,
      ',': 0xBC,
      '.': 0xBE,
      '<': 0xBC,
      '>': 0xBE,
      '!': 0x31,
      '#': 0x35,
      '$': 0x24,
      '%': 0x25,
      '^': 0x5E,
      '(': 0x28,
      ')': 0x29,
      '`': 0xC0
    };

    const modifierKey = modifiers[modifier.toLowerCase()];
    const keyCode = keyCodes[key.toUpperCase()];

    if (!modifierKey || keyCode === undefined) {
      throw new Error(`Invalid hotkey: ${hotkey}`);
    }

    return {
      [modifierKey]: true,
      keyCode: keyCode
    };
  }

  /**
   * Toggle recording start/stop
   */
  async toggleRecording(): Promise<void> {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  /**
   * Start recording
   */
  async startRecording(): Promise<void> {
    if (this.isRecording) {
      console.log('Already recording');
      return;
    }

    console.log('\n[Recording Started]');
    console.log('Configuration: 16000Hz, Mono, 16-bit');
    console.log('Output file: recording.wav');

    const result = await this.recordAudio.start({
      outputFile: 'recording.wav',
      sampleRate: 16000,
      channels: 1,
      bitDepth: 16
    });

    if (result.success) {
      this.isRecording = true;
      console.log(` Recording process started successfully`);
      console.log(` Output file: ${result.outputFile}`);
    } else {
      console.error(' Failed to start recording:', result.error);
    }
  }

  /**
   * Stop recording and transcribe
   */
  async stopRecording(): Promise<void> {
    if (!this.isRecording) {
      console.log('Not recording');
      return;
    }

    console.log('\n[Recording Stopped - Transcribing...]');
    console.log('Stopping recording process...');

    const result = await this.recordAudio.stop();

    if (result.success) {
      this.isRecording = false;
      console.log(` Recording stopped`);
      console.log(` Output file: ${result.outputFile}`);

      // Wait for file to be fully written
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if file exists and has content
      const fs = require('fs');
      if (!fs.existsSync(result.outputFile)) {
        throw new Error('Output file not found after recording');
      }

      const fileSize = fs.statSync(result.outputFile).size;
      if (fileSize === 0) {
        throw new Error('Output file is empty');
      }
      console.log(` File verified: ${fileSize} bytes`);

      // Start transcription
      try {
        console.log('[Transcription Started]');
        const transcription = await this.transcriber.transcribe(result.outputFile!);
        console.log('\n=== TRANSCRIPTION ===');
        const text = typeof transcription.text === 'string' ? transcription.text :
                      typeof transcription === 'string' ? transcription :
                      JSON.stringify(transcription);
        console.log(text);
        console.log('====================\n');
        console.log('[Transcription Completed]');

        // Copy to clipboard and trigger paste
        await this.copyToClipboard(text);
        await this.triggerPaste();
      } catch (error) {
        console.error(' Transcription failed:', (error as Error).message);
      }
    } else {
      console.error(' Failed to stop recording:', result.error);
    }
  }

  /**
   * Copy text to clipboard
   * @param text - Text to copy
   * @returns Promise<void>
   */
  async copyToClipboard(text: string): Promise<void> {
    return new Promise((resolve) => {
      console.log('  Copying text to clipboard...');
      // Use PowerShell to copy text to clipboard on Windows
      const escapedText = text
        .replace(/`/g, '``')   // escape backticks first
        .replace(/"/g, '`"');  // escape double quotes for PowerShell

      const command = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText(\\"${escapedText}\\")"`;
      exec(command, (error: Error | null) => {
        if (error) {
          console.error(' Failed to copy to clipboard:', error.message);
        } else {
          console.log(' Text copied to clipboard');
        }
        resolve();
      });
    });
  }

  /**
   * Trigger paste event (Ctrl+V)
   * @returns Promise<void>
   */
  async triggerPaste(): Promise<void> {
    return new Promise((resolve) => {
      console.log('  Triggering paste...');
      // Use PowerShell to send Ctrl+V on Windows
      const command = 'powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^(v)\')"';
      exec(command, (error: Error | null) => {
        if (error) {
          console.error(' Failed to trigger paste:', error.message);
        } else {
          console.log(' Paste triggered');
        }
        resolve();
      });
    });
  }

  /**
   * Check if currently recording
   * @returns boolean - True if recording
   */
  isRecordingActive(): boolean {
    return this.isRecording;
  }

  /**
   * Unregister the global hotkey
   */
  async unregister(): Promise<void> {
    if (this.isRegistered) {
      if (this.listenerId) {
        globalHotkey.removeListener(this.listenerId);
      }
      globalHotkey.stopListening();
      this.isRegistered = false;
      this.listenerId = null;
      console.log('Hotkey unregistered');
    }
  }
}

export default HotkeyRecorder;
