# Whisper NPU 
Brings speech-to-text to any app at cursor via global hotkey.

- Converts spoken words to text and puts that text at your current keyboard's cursor location.
- Runs completely locally.
- Keeps your GPU and CPU free by using Intel's NPU for running Speech to text conversion.

# How to install
1. Download the latest release from here: https://github.com/anubhavgupta/whisper-npu/releases/download/V1.0.1/whisper-npu.zip
2. Extract the zip
3. Start `whisper-npu.exe`. It runs in the Windows notification area (system tray). (this auto downloads and uses the whisper-small model for you, model can be changed later)

# How to use
1. Hold `Win + /` to start capturing audio.
2. Speak while holding the shortcut.
3. Release `/` or the Windows key to stop and transcribe.
4. The app inserts the transcription into the currently focused application. Shortcuts pressed while transcription or insertion is in progress are ignored.

The keyboard hook observes global key events; unlike the previous library, it does not suppress the shortcut from reaching Windows or the focused application.


**Please check Troubleshooting section in case if you face any issue**

## Tray and logs

The release starts in the Windows tray with no terminal window. Click the microphone icon to show recent logs, or right-click it for **Show logs** and **Quit**. Windows may initially put the icon in the tray overflow menu.

Closing or minimizing the log window hides it; dictation continues. **Quit** shuts down recording, waits for any pending clipboard restoration, and stops the OpenVINO process tree. If shutdown stalls, remaining processes are terminated after 45 seconds. Launching the app again opens the existing log window instead of starting another tray instance for the same user/session.

Logs remain in memory while hidden, capped at 10,000 lines or 2 MB of text. No log or transcript file is created. Startup failures and unexpected engine exits open the log window automatically; quit and relaunch to retry. As with any forced termination, a launcher crash or shutdown timeout can interrupt clipboard restoration.

Keep `whisper-npu-engine.exe`, `whisper-npu.exe.config`, `config.json`, `windows/`, and `external/` beside the launcher. The launcher always uses its own folder as the working directory. The desktop requires .NET Framework 4.8 and Windows PowerShell 5.1. Do not launch the engine separately while the tray app is running.

For foreground debugging from source, `npm start` still prints to the terminal and exits with Ctrl+C.

## Configuration

Edit `config.json` to configure your setup:

```json
{
  "sourceModel": "anubhav200/openai-whisper-tiny-openvino-int4", // check list of supported models below
  "modelRepositoryPath": "./downloaded-whisper-npu-models", // directory where models would be downloaded and stored
  "restPort": 19812, // port on which transciption server would run.
  "temperature": "0", // 0 to 1, can be adjusted to improve accuracy
  "language": "en", // set this to your speaking lang, this again will help improve accuracy
  "ovmsDirectoryPath": "./external/ovms",
  "soxDirectoryPath": "./external/sox/bin",
  "task": "speech2text",
  "targetDevice": "NPU", // models support NPU only at the moment
  "hotkey": "win+/",
  "pasteMethod": "auto",
  "clipboardRestoreDelayMs": 500
}
```
### Recording shortcut

Set `hotkey` in `config.json`, then quit the app from its tray menu and reopen it. No rebuild is needed. For example:

```json
"hotkey": "ctrl+space"
```

The default is `win+/` when the setting is omitted. Supported modifiers are `win` (or `meta`), `ctrl`, `alt`, and `shift`; combine one or more with a key such as `space`, `a`, `f8`, or `/`. Examples: `ctrl+space`, `ctrl+alt+space`, and `alt+f8`. Names are case-insensitive. Hold the shortcut to record and release a required key to stop. Invalid shortcuts are reported in the log window at startup. The shortcut also reaches the focused application, so avoid combinations that conflict with it.

### Text insertion

`pasteMethod` defaults to `auto`:

| Value | Behavior |
| --- | --- |
| `auto` | Ctrl+Shift+V in Windows Terminal (including WSL); Shift+Insert in classic console windows; Ctrl+V elsewhere. |
| `ctrl-v` | Always send Ctrl+V. |
| `ctrl-shift-v` | Always send Ctrl+Shift+V. |
| `shift-insert` | Always send Shift+Insert. |
| `direct` | Type Unicode text without accessing the clipboard. Line breaks and tabs become spaces; other control characters are omitted. |

Use an explicit method for customized shortcuts or embedded terminals (such as VS Code), which cannot reliably be distinguished from their host editor by foreground process alone. Direct mode avoids keyboard-layout character mapping, but applications must support Windows Unicode input; automatic clipboard paste remains the recommended terminal default. No mode appends Enter or submits your text. Clipboard mode preserves existing line breaks, so terminal-specific multiline paste behavior still applies.

Clipboard paste saves existing formats (including text, HTML/RTF, images, and file lists) in memory and restores them after `clipboardRestoreDelayMs` (default 500; range 0–30000). Increase the delay if a slow application pastes your old clipboard contents. If you copy something else meanwhile, your newer clipboard contents take precedence. Unknown formats that cannot be preserved cause insertion to abort before overwriting the clipboard; use direct mode in that case. Clipboard history is not managed, and a forced process termination can prevent restoration.

Keep the target application focused during insertion. The helper waits up to five seconds for modifier keys to be released and stops if focus changes. Input failures are reported without automatically trying another method, which could duplicate partially inserted text. The transcription stays visible in the console. An elevated/admin application requires the dictation app to have matching privileges.

# Supported Models for NPU:
Following models are support to run on NPU, I will add more models soon. Change the value of `sourceModel` in config file to one of the following:

- `anubhav200/openai-whisper-tiny-openvino-int4`
- `anubhav200/openai-whisper-small-openvino-int4`
- `anubhav200/openai-whisper-large-v3-turbo-openvino-int4` (takes very long time to start)


## Manual Build from source

## Requirements

- **Node.js** (v24 or higher)
- **.NET SDK 8 or newer** to build the tray launcher (set `DOTNET` to its executable path if it is not on PATH). `npm run test:tray` uses the .NET 8 runtime.
- Internet access on the first build for the packaged Node runtime and .NET Framework reference assemblies.
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
This generates `./pack/whisper-npu.zip` for Windows x64. Extract the entire ZIP and run `whisper-npu.exe` from that directory. Keep both executables, the `.exe.config` file, and the included `windows/` helper directory together; it uses Windows PowerShell 5.1 and .NET Framework. The release includes the Windows native keyboard-hook binary.


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

## Validation

- `npm run test:tray`: tests bounded log buffering with .NET 8; runs on Windows or Linux.
- `npm test`: builds TypeScript and tests shortcut handling, quick releases, repeated keys, startup/shutdown failures, serialization, and configuration.
- `npm run test:windows`: on a Windows desktop, compiles the insertion helper and tests shortcut selection and clipboard restoration, including rich text, images, file lists, and a newer clipboard copy. Temporarily exercises the clipboard and restores its original contents; do not copy other content during this test.
- Manual Windows release check: test hold/release in both orders, quick taps, a long hold, and Ctrl+C shutdown. Dictate into Notepad and Windows Terminal running WSL/CLI tools; verify exactly one insertion and restored clipboard. Repeat with `pasteMethod: "direct"`, Unicode/emoji, and quotes. Check focus changes, modifier keys held during insertion, and custom shortcut overrides. Repeat using the extracted release ZIP, not only `npm start`.

Linux builds and unit tests do not verify Windows keyboard hooks, clipboard APIs, native-module loading, or actual input delivery.

### Tray release verification on Windows

1. Extract the release into a path containing spaces and double-click `whisper-npu.exe`. Confirm a tray icon appears with no terminal, including during model startup and recording.
2. Click the icon and verify logs are selectable and update. Close and minimize the window; dictation must continue. Reopen it and confirm earlier logs remain visible.
3. Launch again and confirm the existing log window opens without another engine or server process.
4. Quit while idle, recording, transcribing, and restoring the clipboard. Verify the tray icon disappears and no engine, audio recorder, or OpenVINO child remains.
5. In a separate test copy, temporarily rename the engine executable or use an invalid OpenVINO path. Confirm errors open the log window and Quit remains available.
6. Terminate the engine in Task Manager and confirm the tray reports the exit. Terminate the launcher and confirm its job object removes descendants (clipboard restoration cannot be guaranteed after forced termination).

Building the .NET Framework launcher from Linux is supported; the build machine needs the .NET SDK, not a Windows desktop. Live tray, input, and process-job behavior still require Windows testing.
