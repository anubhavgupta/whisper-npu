# Whisper NPU 
Brings speech-to-text to any app at cursor via global hotkey.

- Converts spoken words to text and puts that text at your current keyboard's cursor location.
- Runs completely locally.
- Keeps your GPU and CPU free by using Intel's NPU for running Speech to text conversion.

# How to install
1. Download the latest release from here: https://github.com/anubhavgupta/whisper-npu/releases/download/v1/whisper-npu.zip
2. Extract the zip
3. Start the whisper-npu.exe. (this auto downloads and uses the whisper-small model for you, model can be changed later)

# How to use
1. Hitting `win + /` keys would start capturing your audio
2. Speak something 
3. Pressing the same keys again to stop capturing your audio
4. The app **puts the converted/transcribed text to the current focused input.**


**Please check Troubleshooting section in case if you face any issue**

## Configuration

Edit `config.json` to configure your setup:

```json
{
  "sourceModel": "anubhav200/openai-whisper-tiny-openvino-int4", // check list of supported models below
  "modelRepositoryPath": "./downloaded-whisper-npu-models", // directory where models would be downloaded and stored
  "restPort": 8000, // port on which transciption server would run.
  "temperature": "0", // 0 to 1, can be adjusted to improve accuracy
  "language": "en", // set this to your speaking lang, this again will help improve accuracy
  "ovmsDirectoryPath": "./external/ovms",
  "soxDirectoryPath": "./external/sox/bin",
  "task": "speech2text",
  "targetDevice": "NPU" // models supports NPU only at the moment
}
```
# Supported Models for NPU:
Following models are support to run on NPU, I will add more models soon. Change the value of `sourceModel` in config file to one of the following:

- `anubhav200/openai-whisper-tiny-openvino-int4`
- `anubhav200/openai-whisper-small-openvino-int4`
- `anubhav200/openai-whisper-large-v3-turbo-openvino-int4` (takes very long time to start)


## Manual Build from source

## Requirements

- **Node.js** (v24 or higher)
- **Windows** (for Windows Forms clipboard integration)
- **Machine with Intel NPU**

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate Executable

```bash
npm run release
```
This will build and generate a `./pack/whisper-npu.zip` file, extract it and run `whisper-npu.exe` to use the application.


## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

## Troubleshooting

1. Make sure you have installed the latest Intel's NPU drivers by following the guide here: https://www.intel.com/content/www/us/en/support/articles/000099083/processors/intel-core-ultra-processors.html

## License

MPL 2.0

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
