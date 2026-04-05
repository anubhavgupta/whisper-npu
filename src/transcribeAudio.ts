import * as fs from 'fs';
import FormData from 'form-data';
import axios, { AxiosResponse } from 'axios';
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
      formData.append('file', fileBuffer, filePath);
      formData.append('response_format', responseFormat);
      formData.append('temperature', this.config.temperature ?? "0");
      formData.append('language', this.config.language ?? "en");

      // Send POST request
      const response: AxiosResponse = await axios.post(this.apiUrl, formData, {
        headers: formData.getHeaders()
      });

      return response.data;
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'response' in error) {
        const err = error as { response?: { status: number; data: unknown }; request?: unknown; message: string };
        if (err.response) {
          throw new Error(`API Error: ${err.response.status} - ${JSON.stringify(err.response.data)}`);
        } else if (err.request) {
          throw new Error(`Network Error: Could not connect to ${this.apiUrl}`);
        } else {
          throw new Error(`Error: ${err.message}`);
        }
      }
      throw error;
    }
  }
}

export default TranscribeAudio;
