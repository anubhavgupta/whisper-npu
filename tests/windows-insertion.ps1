# Run from a Windows desktop: npm run test:windows.
# Saves/restores the current clipboard; does not send keystrokes to other apps.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot '../windows/TextInput.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing
Add-Type -Path (Join-Path $PSScriptRoot 'WindowsInsertionTests.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing
[WindowsInsertionTests]::Run([WhisperTextInput])
