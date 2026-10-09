import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { AppConfig } from './types';

class OVMSManager {
  private config: AppConfig | null = null;
  private ovmsProcess: ChildProcess | null = null;
  private stopping = false;

  constructor(private configPath = './config.json', private onFailure: (error: Error) => void = console.error) {}

  loadConfig(): AppConfig {
    if (!fs.existsSync(this.configPath)) throw new Error(`Config file not found: ${this.configPath}`);
    this.config = JSON.parse(fs.readFileSync(this.configPath, 'utf8')) as AppConfig;
    return this.config;
  }

  async start(): Promise<ChildProcess> {
    const config = this.config ?? this.loadConfig();
    const directory = path.resolve(config.ovmsDirectoryPath);
    const quote = (value: string) => "'" + value.replace(/'/g, "''") + "'";
    const args = [
      '--source_model', config.sourceModel, '--model_repository_path', path.resolve(config.modelRepositoryPath),
      '--rest_port', (config.restPort ?? 19812).toString(), '--task', config.task, '--target_device', config.targetDevice
    ];
    const command = "$ErrorActionPreference = 'Stop'; . " + quote(path.join(directory, 'setupvars.ps1')) +
      '; & ' + quote(path.join(directory, 'ovms.exe')) + ' ' + args.map(quote).join(' ') + '; exit $LASTEXITCODE';
    console.log('Starting OpenVINO server...');
    this.stopping = false;
    // The bundled setup script may retain Windows' downloaded-file marker.
    // Apply the policy only to this child process, not the user's machine.
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    this.ovmsProcess = child;
    child.stdout?.on('data', data => console.log(`[OVMS stdout] ${data.toString()}`));
    child.stderr?.on('data', data => console.error(`[OVMS stderr] ${data.toString()}`));
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    child.on('error', error => { if (!this.stopping) this.onFailure(error); });
    child.once('exit', (code, signal) => {
      if (!this.stopping) this.onFailure(new Error(`OpenVINO exited (code ${code}, signal ${signal})`));
    });
    console.log('OpenVINO process started; model loading may take a while.');
    return child;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.ovmsProcess;
    this.ovmsProcess = null;
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
    console.log('Stopping OpenVINO server...');
    if (process.platform === 'win32') {
      // PowerShell owns the actual OVMS process. Kill its tree, not just the shell.
      await new Promise<void>((resolve, reject) => {
        const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        const timer = setTimeout(() => { killer.kill(); reject(new Error('Server cleanup timed out')); }, 5000);
        killer.once('error', error => { clearTimeout(timer); reject(error); });
        killer.once('close', code => {
          clearTimeout(timer);
          if (code === 0 || child.exitCode !== null || child.signalCode !== null) resolve();
          else reject(new Error(`Server cleanup failed (taskkill code ${code})`));
        });
      });
    } else child.kill('SIGTERM');
  }

  isRunning(): boolean { return !!this.ovmsProcess && this.ovmsProcess.exitCode === null && this.ovmsProcess.signalCode === null; }
  getProcess(): ChildProcess | null { return this.ovmsProcess; }
}
export default OVMSManager;
