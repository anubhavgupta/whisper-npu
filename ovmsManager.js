const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class OVMSManager {
  constructor(configPath = './openvino-config.json') {
    this.configPath = configPath;
    this.config = null;
    this.ovmsProcess = null;
    this.isStarted = false;
  }

  /**
   * Load OpenVINO configuration
   * @returns {Object} Configuration object
   */
  loadConfig() {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Config file not found: ${this.configPath}`);
    }

    this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
    return this.config;
  }

  /**
   * Start OpenVINO server
   * @returns {Promise<ChildProcess>} OVMS process
   */
  async start() {
    // Load config if not already loaded
    if (!this.config) {
      this.loadConfig();
    }

    const { ovmsDirectoryPath, sourceModel, modelRepositoryPath, restPort, task, targetDevice } = this.config;

    // Build the OVMS command
    const ovmsPath = path.join(ovmsDirectoryPath, 'ovms.exe');
    const args = [
      '--source_model', sourceModel,
      '--model_repository_path', modelRepositoryPath,
      '--rest_port', restPort.toString(),
      '--task', task,
      '--target_device', targetDevice
    ];

    console.log('Starting OpenVINO server...');
    console.log(`Command: powershell -Command "Set-Location '${ovmsDirectoryPath}'; .\\setupvars.ps1; .\\${path.basename(ovmsPath)} ${args.join(' ')}"`);

    // Chain setup and OVMS in one command
    const command = `powershell -ExecutionPolicy Bypass -Command "Set-Location '${ovmsDirectoryPath}'; .\\setupvars.ps1; .\\${path.basename(ovmsPath)} ${args.join(' ')}"`;

    this.ovmsProcess = spawn('powershell', ['-Command', command], {
      cwd: ovmsDirectoryPath,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.ovmsProcess.stdout.on('data', (data) => {
      console.log(`[OVMS stdout] ${data.toString()}`);
    });

    this.ovmsProcess.stderr.on('data', (data) => {
      console.log(`[OVMS stderr] ${data.toString()}`);
    });

    this.ovmsProcess.on('error', (error) => {
      throw new Error(`Failed to start OVMS: ${error.message}`);
    });

    // Wait for server to be ready
    return new Promise((resolve, reject) => {
      const maxWaitTime = 60000; // 1 minute timeout
      const checkInterval = 2000; // Check every 2 seconds
      const startTime = Date.now();
      let resolved = false;

      const checkServerReady = () => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= maxWaitTime) {
          reject(new Error('OVMS server did not start within 1 minute'));
          return;
        }

        // Check if process is still running
        if (this.ovmsProcess.killed) {
          reject(new Error('OVMS process exited unexpectedly'));
          return;
        }

        // If process is running, assume it's ready (only resolve once)
        if (!resolved) {
          resolved = true;
          console.log('OVMS server started successfully');
          resolve(this.ovmsProcess);
        }
      };

      // Check immediately, then retry
      checkServerReady();
      const checkIntervalId = setInterval(checkServerReady, checkInterval);

      // Clean up interval on resolve
      this.ovmsProcess.on('close', () => {
        clearInterval(checkIntervalId);
      });
    });
  }

  /**
   * Stop OpenVINO server
   * @returns {Promise<void>}
   */
  async stop() {
    // Kill OVMS server
    if (this.ovmsProcess && !this.ovmsProcess.killed) {
      console.log('Stopping OpenVINO server...');
      this.ovmsProcess.kill('SIGTERM');
    }

    this.ovmsProcess = null;
  }

  /**
   * Check if server is running
   * @returns {boolean}
   */
  isRunning() {
    return this.ovmsProcess !== null && !this.ovmsProcess.killed;
  }

  /**
   * Get the OVMS process
   * @returns {ChildProcess|null}
   */
  getProcess() {
    return this.ovmsProcess;
  }
}

module.exports = OVMSManager;