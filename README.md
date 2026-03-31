# Whisper NPU with OpenVINO

A Node.js application that uses OpenVINO OpenVINO Model Server (OVMS) for speech recognition and transcribes audio to text using a global hotkey.

## Features

- 🎤 **Global hotkey recording** - Press `Win + /` to start/stop recording
- 🔄 **Auto-transcription** - Automatically transcribes audio to text
- 📋 **Auto-copy to clipboard** - Copies transcribed text to clipboard and triggers paste
- ⚡ **Fast performance** - Uses OpenVINO with NPU for efficient inference
- 🔧 **Configurable** - Easy configuration via JSON file
- 🛠️ **TypeScript** - Fully typed codebase for better developer experience

## Requirements

- **Node.js** (v14 or higher)
- **Windows** (for Windows Forms clipboard integration)
- **SOX** (Sound eXchange) - For audio recording
- **OpenVINO** - For model inference
- **OVMS** (OpenVINO Model Server) - For running the Whisper model

## Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Install SOX

Download and install SOX from the official website:
- Windows: https://sox.sourceforge.net/

### 3. Setup OVMS

1. Download OVMS from GitHub releases:
```bash
# Download the Windows package
curl -L https://github.com/openvinotoolkit/model_server/releases/download/v2026.0/ovms_windows_python_on.zip -o ovms_windows_python_on.zip

# Unzip the package
unzip ovms_windows_python_on.zip -d ovms_windows_python_on
```

2. Update `openvino-config.json` with the correct path to the OVMS directory

## Configuration

Edit `openvino-config.json` to configure your OpenVINO setup:

```json
{
  "ovmsDirectoryPath": "C:\\projects\\ovms_windows_python_on_2026\\ovms",
  "sourceModel": "openai/whisper-tiny",
  "modelRepositoryPath": "C:\\projects\\vino-models",
  "restPort": 8000,
  "task": "speech2text",
  "targetDevice": "NPU",
  "temperature": "0",
  "language": "en"
}
```

### Configuration Options

- `ovmsDirectoryPath` - Path to the directory containing `ovms.exe`
- `sourceModel` - Model to use for transcription
- `modelRepositoryPath` - Path to the model repository
- `restPort` - Port on which OVMS server will run
- `task` - Task type (usually "speech2text")
- `targetDevice` - Target device (usually "NPU")
- `temperature` - Sampling temperature for generation
- `language` - Language code for transcription

## Usage

### First Time Setup

Build the project before running:

```bash
npm run build
```

### Starting the Application

```bash
npm run start
```

This will:
1. Start the OpenVINO server (runs `setupvars.ps1` and `ovms.exe`)
2. Wait for the server to be ready
3. Register the global hotkey (`Win + /`)
4. Display the prompt to press `Ctrl+C` to exit

### Recording and Transcribing

1. Press `Win + /` to start recording
2. Speak into your microphone
3. Press `Win + /` again to stop recording
4. The application will:
   - Stop recording
   - Convert raw audio to WAV format
   - Transcribe the audio using the OpenVINO server
   - Copy to clipboard and paste to the focused input

### Stopping the Application

Press `Ctrl+C` to stop the application. This will:
- Unregister the hotkey
- Stop the OpenVINO server
- Exit gracefully

## Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm run start` - Start the hotkey recorder
- `npm run dev` - Development mode with ts-node

## Project Structure

```
src/
├── index.ts         # Main entry point (transcription CLI)
├── main.ts          # Main entry point (hotkey recorder)
├── recordAudio.ts   # Audio recording functionality
├── transcribeAudio.ts  # Transcription API client
├── ovmsManager.ts   # OpenVINO Model Server manager
├── hotkeyRecorder.ts # Global hotkey management
└── types.ts         # Shared TypeScript types
```

## Troubleshooting

### SOX not found

If you get an error like `sox: not found`:

1. Make sure SOX is installed
2. Ensure SOX is in your PATH environment variable
3. Try running `sox --version` in your terminal

### OVMS server doesn't start

1. Make sure `setupvars.ps1` is in the `ovmsDirectoryPath`
2. Check that all required dependencies are installed
3. Verify the configuration in `openvino-config.json`
4. Check the console output for detailed error messages

### Transcription fails with "invalid wav nor mp3 audio file"

1. The raw audio file needs to be converted to WAV format
2. This is handled automatically by the application
3. If it still fails, check that the recording was successful

### Hotkey not working

1. Make sure the application is running as an administrator
2. Verify the hotkey is registered in the console output
3. Try a different hotkey combination

### Clipboard not working

1. The application uses PowerShell to interact with Windows Forms
2. Make sure PowerShell is available on your system
3. Check that you have the latest version of Windows

## Dependencies

- `axios` - HTTP client for API calls
- `clipboardy` - Clipboard operations
- `global-hotkey` - Windows global hotkey registration

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
