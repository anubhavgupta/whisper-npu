import * as fs from 'fs';
import fetch, { FormData, File } from "node-fetch";
import { AppConfig } from './types';

interface Config {
  restPort: number;
  sourceModel: string;
  temperature?: string;
  language?: string;
}

class TranscribeAudio {
  private apiUrl: string;
  private config: Config;

  constructor(configPath: string = 'config.json') {
    // Load configuration from JSON file
    const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const restPort = configData.restPort || 8000;
    this.apiUrl = `http://localhost:${restPort}/v3/audio/translations`;
    this.config = configData;
  }

  /**
   * Transcribes an audio file to text
   * @param filePath - Path to the audio file
   * @param responseFormat - Response format (default: 'verbose_json')
   * @returns {Promise<Object>} The transcription result
   */
  async transcribe(filePath: string, responseFormat: string = 'verbose_json'): Promise<Record<string, unknown>> {
    const model = this.config.sourceModel;
    console.log(filePath, model, responseFormat);
    try {
      // Read the audio file
      const fileBuffer = fs.readFileSync(filePath);

      // Create form data
      const formData = new FormData();
      formData.append('model', model);
      formData.append('file', new File([fileBuffer], filePath, { type: 'audio/wav' }));
      formData.append('response_format', responseFormat);
      formData.append('temperature', this.config.temperature ?? '0');
      formData.append('language', this.config.language ?? 'en');
      // Send POST request using node-fetch
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} - ${await response.text()}`);
      }

      return await response.json() as Record<string, string>;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Error: ${String(error)}`);
    }
  }
}

export default TranscribeAudio;
