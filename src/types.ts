// Configuration interface for config.json
export interface AppConfig {
  ovmsDirectoryPath: string;
  soxDirectoryPath: string;
  sourceModel: string;
  modelRepositoryPath: string;
  restPort: number;
  task: string;
  targetDevice: string;
  temperature?: string;
  language?: string;
}

// Recording options interface
export interface RecordingOptions {
  outputFile: string;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  encoding: string;
}

// Recording result interface
export interface RecordingResult {
  success: boolean;
  outputFile?: string;
  message?: string;
  error?: string;
}

// Hotkey event interface
export interface HotkeyEvent {
  [key: string]: boolean | number;
}

// Transcribe response interface
export interface TranscribeResponse {
  text: string;
  [key: string]: unknown;
}
