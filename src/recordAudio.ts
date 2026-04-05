import { spawn, ChildProcess } from 'child_process';
import { RecordingOptions, RecordingResult } from './types';
import * as fs from 'fs';
import * as path from 'path';

class RecordAudio {
  private isRecording: boolean = false;
  private recordProcess: ChildProcess | null = null;
  private currentOutputFile: string = 'recording.wav';
  private sampleRate: number = 16000;
  private channels: number = 1;
  private bitDepth: number = 16;
  private encoding: string = 'signed-integer';
  private configPath: string = './openvino-config.json';

  /**
   * Start recording audio
   * @param options - Recording options
   * @param options.outputFile - Output file path (default: 'recording.wav')
   * @param options.sampleRate - Sample rate in Hz (default: 16000)
   * @param options.channels - Number of channels (default: 1)
   * @param options.bitDepth - Bit depth (default: 16)
   * @param options.encoding - Audio encoding (default: 'signed-integer')
   * @returns Promise<RecordingResult> - Result object with success status and process
   */
  async start({
    outputFile = 'recording.wav',
    sampleRate = 16000,
    channels = 1,
    bitDepth = 16,
    encoding = 'signed-integer'
  }: Partial<RecordingOptions>): Promise<RecordingResult> {
    if (this.isRecording) {
      return {
        success: false,
        error: 'Already recording'
      };
    }

    return new Promise((resolve) => {
      // Store parameters as instance variables for later use in stop()
      this.sampleRate = sampleRate;
      this.channels = channels;
      this.bitDepth = bitDepth;
      this.encoding = encoding;

      // Load config to get sox path
      let soxExecutable = 'sox';
      try {
        if (fs.existsSync(this.configPath)) {
          const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8')) as any;
          if (config.soxDirectoryPath) {
            soxExecutable = path.resolve(config.soxDirectoryPath, 'sox.exe');
          }
        }
      } catch (e) {
        console.error('Error loading config for sox path, falling back to global sox');
      }

      // Build the SOX command
      const cmd = soxExecutable;

      const args = [
        '-t', 'waveaudio', 'default',
        '-r', sampleRate.toString(),
        '-c', channels.toString(),
        '-b', bitDepth.toString(),
        '-e', encoding,
        outputFile
      ];

      // Execute using spawn
      this.recordProcess = spawn(cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.isRecording = true;

      // Handle process errors
      this.recordProcess.on('error', (error: Error) => {
        this.isRecording = false;
        resolve({
          success: false,
          error: error.message
        });
      });

      // Handle process exit
      this.recordProcess.on('exit', (code: number | null) => {
        this.isRecording = false;
        if (code !== 0) {
          resolve({
            success: false,
            error: `Recording process exited with code ${code}`
          });
        }
      });

      // Listen to stdout and stderr
      let stderr = '';
      const process: ChildProcess = this.recordProcess;
      if (process.stderr) {
        process.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
        });
      }

      // Resolve with success
      setTimeout(() => {
        this.currentOutputFile = outputFile;
        resolve({
          success: true,
          outputFile,
          message: 'Recording started'
        });
      }, 500); // Small delay to ensure process is ready
    });
  }

  /**
   * Fix audio - convert raw audio to WAV format using SOX
   * @param outputFile - Path to the audio file to fix
   * @returns Promise<void>
   */
  async fixAudio(outputFile: string): Promise<void> {
    console.log(`  Converting raw audio to WAV...`);
    try {
      let soxExecutable = 'sox';
      if (fs.existsSync(this.configPath)) {
        const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8')) as any;
        if (config.soxDirectoryPath) {
          soxExecutable = path.resolve(config.soxDirectoryPath, 'sox.exe');
        }
      }

      const convertProcess = spawn(soxExecutable, [
        '-t', 'raw',
        '-r', this.sampleRate.toString(),
        '-c', this.channels.toString(),
        '-b', this.bitDepth.toString(),
        '-e', this.encoding,
        outputFile,
        'to-transcribe.wav'
      ], { stdio: ['ignore', 'pipe', 'pipe'] });

      await new Promise<void>((resolveConvert, rejectConvert) => {
        convertProcess.on('exit', (convertCode: number | null) => {
          if (convertCode === 0 || convertCode === null) {
            console.log(`  ✓ Conversion successful`);
            resolveConvert();
          } else {
            console.log(`  ✗ Conversion failed with code ${convertCode}`);
            rejectConvert(new Error('Conversion failed'));
          }
        });

        convertProcess.stderr.on('data', (data: Buffer) => {
          console.log(`  [SOX convert stderr]: ${data.toString().trim()}`);
        });
      });
    } catch (convertError: unknown) {
      console.log(`  Conversion error: ${(convertError as Error).message}`);
      // Continue anyway - file might still work
    }
  }

  /**
   * Stop recording
   * @returns Promise<RecordingResult> - Result object with success status and file path
   */
  async stop(): Promise<RecordingResult> {
    if (!this.isRecording || !this.recordProcess) {
      return {
        success: false,
        error: 'Not recording or no active recording process'
      };
    }

    return new Promise((resolve) => {
      const process: ChildProcess = this.recordProcess!;
      let timeoutReached = false;

      // Kill the process (defaults to SIGTERM, like node-record-lpcm16)
      process.kill();

      // Wait for process to exit
      const timeout = setTimeout(async () => {
        timeoutReached = true;
        this.isRecording = false;
        this.recordProcess = null;

        // If process didn't exit, try SIGKILL as fallback
        console.log(`  Trying SIGKILL as fallback...`);
        process.kill('SIGKILL');

        setTimeout(() => {
          this.isRecording = false;
          this.recordProcess = null;
          resolve({
            success: false,
            error: 'Process did not terminate'
          });
        }, 1000);
      }, 2000); // 2 second timeout

      process.on('exit', async (code: number | null) => {
        if (timeoutReached) {
          return;
        }
        clearTimeout(timeout);
        this.isRecording = false;
        this.recordProcess = null;

        // Process exited successfully if code is 0 or null
        if (code === 0 || code === null) {
          console.log(`  Recording stopped`);

          // Fix audio - convert raw audio to WAV format
          await this.fixAudio(this.currentOutputFile);

          resolve({
            success: true,
            outputFile: 'to-transcribe.wav',
            message: 'Recording stopped successfully'
          });
        } else {
          console.log(`  Recording exited with code ${code}`);
          resolve({
            success: false,
            error: `Recording stopped with exit code ${code}`
          });
        }
      });

      if (process.stderr) {
        process.stderr.on('data', (data: Buffer) => {
          console.log(`  [SOX stderr]: ${data.toString().trim()}`);
        });
      }
    });
  }

  /**
   * Check if currently recording
   * @returns boolean - True if recording
   */
  isRecordingActive(): boolean {
    return this.isRecording;
  }
}

export default RecordAudio;
