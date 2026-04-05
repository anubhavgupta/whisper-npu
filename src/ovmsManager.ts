import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfig } from './types';

class OVMSManager {
  private configPath: string;
  private config: AppConfig | null = null;
  private ovmsProcess: ChildProcess | null = null;
  private isStarted: boolean = false;

  constructor(configPath: string = './config.json') {
    this.configPath = configPath;
  }

  /**
   * Load OpenVINO configuration
   * @returns AppConfig - Configuration object
   */
  loadConfig(): AppConfig {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Config file not found: ${this.configPath}`);
    }

    this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf8')) as AppConfig;
    return this.config;
  }

  /**
   * Start OpenVINO server
   * @returns Promise<ChildProcess> - OVMS process
   */
  async start(): Promise<ChildProcess> {
    // Load config if not already loaded
    if (!this.config) {
      this.loadConfig();
    }

    if (!this.config) {
      throw new Error('Configuration not loaded');
    }

    const { ovmsDirectoryPath, sourceModel, modelRepositoryPath, restPort, task, targetDevice } = this.config;

    // Build the OVMS command
    const ovmsDirectoryPathAbs = path.resolve(ovmsDirectoryPath);
    const ovmsPath = path.join(ovmsDirectoryPathAbs, 'ovms.exe');
    const args = [
      '--source_model', sourceModel,
      '--model_repository_path', path.resolve(modelRepositoryPath),
      '--rest_port', restPort.toString(),
      '--task', task,
      '--target_device', targetDevice
    ];

    console.log('Starting OpenVINO server...');
    console.log(`Command: powershell -Command "Set-Location '${ovmsDirectoryPathAbs}'; .\\setupvars.ps1; .\\${path.basename(ovmsPath)} ${args.join(' ')}"`);

    // Chain setup and OVMS in one command
    const command = `powershell -ExecutionPolicy Bypass -Command "Set-Location '${ovmsDirectoryPathAbs}'; .\\setupvars.ps1; .\\${path.basename(ovmsPath)} ${args.join(' ')}"`;

    const process = spawn('powershell', ['-Command', command], {
      cwd: ovmsDirectoryPathAbs,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.ovmsProcess = process;

    process.stdout.on('data', (data: Buffer) => {
      console.log(`[OVMS stdout] ${data.toString()}`);
    });

    process.stderr.on('data', (data: Buffer) => {
      console.log(`[OVMS stderr] ${data.toString()}`);
    });

    process.on('error', (error: Error) => {
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
        if (!this.ovmsProcess || this.ovmsProcess.killed) {
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
      if (this.ovmsProcess) {
        this.ovmsProcess.on('close', () => {
          clearInterval(checkIntervalId);
        });
      }
    });
  }

  /**
   * Stop OpenVINO server
   * @returns Promise<void>
   */
  async stop(): Promise<void> {
    // Kill OVMS server
    if (this.ovmsProcess && !this.ovmsProcess.killed) {
      console.log('Stopping OpenVINO server...');
      this.ovmsProcess.kill('SIGTERM');
    }

    this.ovmsProcess = null;
  }

  /**
   * Check if server is running
   * @returns boolean
   */
  isRunning(): boolean {
    return this.ovmsProcess !== null && !this.ovmsProcess.killed;
  }

  /**
   * Get the OVMS process
   * @returns ChildProcess|null
   */
  getProcess(): ChildProcess | null {
    return this.ovmsProcess;
  }
}

export default OVMSManager;
