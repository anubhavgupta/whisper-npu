const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

class TranscribeAudio {
  constructor(apiUrl = 'http://localhost:8000/v3/audio/translations') {
    this.apiUrl = apiUrl;
  }

  /**
   * Transcribes an audio file to text
   * @param {string} filePath - Path to the audio file
   * @param {string} model - Model to use for transcription (default: 'openai/whisper-tiny')
   * @param {string} responseFormat - Response format (default: 'verbose_json')
   * @returns {Promise<Object>} The transcription result
   */
  async transcribe(filePath, model = 'openai/whisper-tiny', responseFormat = 'verbose_json') {
    console.log(filePath, model, responseFormat);
    try {
      // Read the audio file
      const fileBuffer = fs.readFileSync(filePath);

      // Create form data
      const formData = new FormData();
      formData.append('model', model);
      formData.append('file', fileBuffer, filePath);
      formData.append('response_format', responseFormat);

      // Send POST request
      const response = await axios.post(this.apiUrl, formData, {
        headers: formData.getHeaders()
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        throw new Error(`API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        throw new Error(`Network Error: Could not connect to ${this.apiUrl}`);
      } else {
        throw new Error(`Error: ${error.message}`);
      }
    }
  }
}

module.exports = TranscribeAudio;