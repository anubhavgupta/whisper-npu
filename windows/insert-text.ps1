$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    Add-Type -Path (Join-Path $PSScriptRoot 'TextInput.cs') -ReferencedAssemblies System.Windows.Forms,System.Drawing
    $encoded = [Console]::In.ReadToEnd()
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded))
    $request = $json | ConvertFrom-Json
    [WhisperTextInput]::Insert([string]$request.text, [string]$request.method, [int]$request.restoreDelayMs)
} catch {
    [Console]::Error.WriteLine($_.Exception.ToString())
    exit 1
}
