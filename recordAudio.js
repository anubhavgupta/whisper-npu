const { spawn } = require('child_process');

class RecordAudio {
  constructor() {
    this.isRecording = false;
    this.recordProcess = null;
    this.currentOutputFile = 'recording.wav';
    this.sampleRate = 16000;
    this.channels = 1;
    this.bitDepth = 16;
    this.encoding = 'signed-integer';
  }

  /**
   * Start recording audio
   * @param {Object} options - Recording options
   * @param {string} options.outputFile - Output file path (default: 'recording.wav')
   * @param {number} options.sampleRate - Sample rate in Hz (default: 16000)
   * @param {number} options.channels - Number of channels (default: 1)
   * @param {number} options.bitDepth - Bit depth (default: 16)
   * @param {string} options.encoding - Audio encoding (default: 'signed-integer')
   * @returns {Promise<Object>} Result object with success status and process
   */
  async start({
    outputFile = 'recording.wav',
    sampleRate = 16000,
    channels = 1,
    bitDepth = 16,
    encoding = 'signed-integer'
  } = {}) {
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

      // Build the SOX command
      const cmd = 'sox';

      const args = [
        '-t', 'waveaudio', 'default',
        '-r', sampleRate,
        '-c', channels,
        '-b', bitDepth,
        '-e', encoding,
        outputFile
      ];

      // Execute using spawn
      this.recordProcess = spawn(cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.isRecording = true;

      // Handle process errors
      this.recordProcess.on('error', (error) => {
        this.isRecording = false;
        resolve({
          success: false,
          error: error.message
        });
      });

      // Handle process exit
      this.recordProcess.on('exit', (code) => {
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
      this.recordProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });


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
   * @param {string} outputFile - Path to the audio file to fix
   * @returns {Promise<void>}
   */
  async fixAudio(outputFile) {
    console.log(`  Converting raw audio to WAV...`);
    try {
      const convertCmd = `sox -t raw -r ${this.sampleRate} -c ${this.channels} -b ${this.bitDepth} -e ${this.encoding} ${outputFile} to-transcribe.wav`;
      const convertProcess = spawn(convertCmd, [], { shell: true });

      await new Promise((resolveConvert, rejectConvert) => {
        convertProcess.on('exit', (convertCode) => {
          if (convertCode === 0 || convertCode === null) {
            console.log(`  ✓ Conversion successful`);
            resolveConvert();
          } else {
            console.log(`  ✗ Conversion failed with code ${convertCode}`);
            rejectConvert(new Error('Conversion failed'));
          }
        });

        convertProcess.stderr.on('data', (data) => {
          console.log(`  [SOX convert stderr]: ${data.toString().trim()}`);
        });
      });
    } catch (convertError) {
      console.log(`  ⚠ Conversion error: ${convertError.message}`);
      // Continue anyway - file might still work
    }
  }

  /**
   * Stop recording
   * @returns {Promise<Object>} Result object with success status and file path
   */
  async stop() {
    if (!this.isRecording || !this.recordProcess) {
      return {
        success: false,
        error: 'Not recording or no active recording process'
      };
    }

    return new Promise((resolve) => {
      // Kill the process (defaults to SIGTERM, like node-record-lpcm16)
      this.recordProcess.kill();

      // Wait for process to exit
      const timeout = setTimeout(async () => {
        this.isRecording = false;
        this.recordProcess = null;

        // If process didn't exit, try SIGKILL as fallback
        if (this.recordProcess && !this.recordProcess.killed) {
          console.log(`  Trying SIGKILL as fallback...`);
          this.recordProcess.kill('SIGKILL');

          setTimeout(() => {
            this.isRecording = false;
            this.recordProcess = null;
            resolve({
              success: false,
              error: 'Process did not terminate'
            });
          }, 1000);
        } else {
          // Fix audio - convert raw audio to WAV format
          await this.fixAudio(this.currentOutputFile);

          resolve({
            success: true,
            outputFile: 'to-transcribe.wav',
            message: 'Recording stopped successfully'
          });
        }
      }, 2000); // 2 second timeout

      this.recordProcess.on('exit', async (code) => {
        clearTimeout(timeout);
        this.isRecording = false;
        this.recordProcess = null;

        // Process exited successfully if code is 0 or null
        if (code === 0 || code === null) {
          console.log(`  ✓ Recording stopped`);

          // Fix audio - convert raw audio to WAV format
          await this.fixAudio(this.currentOutputFile);

          resolve({
            success: true,
            outputFile: 'to-transcribe.wav',
            message: 'Recording stopped successfully'
          });
        } else {
          console.log(`  ✗ Recording exited with code ${code}`);
          resolve({
            success: false,
            error: `Recording stopped with exit code ${code}`
          });
        }
      });

      this.recordProcess.stderr.on('data', (data) => {
        console.log(`  [SOX stderr]: ${data.toString().trim()}`);
      });
    });
  }

  /**
   * Check if currently recording
   * @returns {boolean} True if recording
   */
  isRecordingActive() {
    return this.isRecording;
  }
}

module.exports = RecordAudio;