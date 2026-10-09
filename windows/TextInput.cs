using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

// Loaded in an STA PowerShell process. Clipboard data never crosses stdout or disk.
public static class WhisperTextInput
{
    const string OwnerFormat = "WhisperNpu.TranscriptionOwner";
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int count);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);

    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION data; }
    [StructLayout(LayoutKind.Explicit)] struct INPUTUNION
    {
        [FieldOffset(0)] public KEYBDINPUT keyboard;
        [FieldOffset(0)] public MOUSEINPUT mouse;
    }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT
    {
        public ushort vk, scan;
        public uint flags, time;
        public UIntPtr extra;
    }
    // The union must include MOUSEINPUT to give INPUT its correct x86/x64 size.
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT
    {
        public int x, y;
        public uint mouseData, flags, time;
        public UIntPtr extra;
    }

    public static string SelectMethod(string method, string processName, string windowClass)
    {
        if (method != "auto") return method;
        if (String.Equals(processName, "WindowsTerminal", StringComparison.OrdinalIgnoreCase) ||
            String.Equals(windowClass, "CASCADIA_HOSTING_WINDOW_CLASS", StringComparison.OrdinalIgnoreCase))
            return "ctrl-shift-v";
        if (String.Equals(windowClass, "ConsoleWindowClass", StringComparison.OrdinalIgnoreCase))
            return "shift-insert";
        return "ctrl-v";
    }

    public static string DirectText(string text)
    {
        return text.Replace("\r\n", " ").Replace('\r', ' ').Replace('\n', ' ').Replace('\t', ' ');
    }

    static void CheckFocus(IntPtr target)
    {
        if (target == IntPtr.Zero || GetForegroundWindow() != target)
            throw new InvalidOperationException("Foreground window changed; insertion stopped.");
    }

    static bool ModifiersDown()
    {
        foreach (int key in new int[] { 0x10, 0x11, 0x12, 0x5B, 0x5C })
            if ((GetAsyncKeyState(key) & 0x8000) != 0) return true;
        return false;
    }

    static void WaitForModifiers(IntPtr target)
    {
        Stopwatch timer = Stopwatch.StartNew();
        while (ModifiersDown())
        {
            CheckFocus(target);
            if (timer.ElapsedMilliseconds >= 5000)
                throw new InvalidOperationException("Release modifier keys before inserting text.");
            Thread.Sleep(20);
        }
        CheckFocus(target);
    }

    static INPUT Key(ushort key, bool up, bool unicode)
    {
        INPUT input = new INPUT();
        input.type = 1;
        input.data.keyboard.vk = unicode ? (ushort)0 : key;
        input.data.keyboard.scan = unicode ? key : (ushort)0;
        input.data.keyboard.flags = (up ? 2u : 0u) | (unicode ? 4u : 0u);
        // Insert is an extended key.
        if (!unicode && key == 0x2D) input.data.keyboard.flags |= 1;
        return input;
    }

    static void Send(INPUT[] inputs, IntPtr target)
    {
        CheckFocus(target);
        uint count = SendInput((uint)inputs.Length, inputs, Marshal.SizeOf(typeof(INPUT)));
        if (count != inputs.Length)
            throw new InvalidOperationException("Windows could not inject all input events (" + count + "/" + inputs.Length +
                "). Check whether the target runs as administrator. Text will not be retried automatically.");
    }

    static void Paste(string method, IntPtr target)
    {
        ushort[] keys;
        if (method == "ctrl-v") keys = new ushort[] { 0x11, 0x56 };
        else if (method == "ctrl-shift-v") keys = new ushort[] { 0x11, 0x10, 0x56 };
        else if (method == "shift-insert") keys = new ushort[] { 0x10, 0x2D };
        else throw new ArgumentException("Unknown paste method: " + method);
        var inputs = new List<INPUT>();
        foreach (ushort key in keys) inputs.Add(Key(key, false, false));
        for (int i = keys.Length - 1; i >= 0; i--) inputs.Add(Key(keys[i], true, false));
        try { Send(inputs.ToArray(), target); }
        catch
        {
            // A partial SendInput must not leave our simulated modifiers pressed.
            var release = new List<INPUT>();
            for (int i = keys.Length - 1; i >= 0; i--) release.Add(Key(keys[i], true, false));
            SendInput((uint)release.Count, release.ToArray(), Marshal.SizeOf(typeof(INPUT)));
            throw;
        }
    }

    static object CloneClipboardValue(object value)
    {
        if (value is string) return value;
        if (value is string[]) return ((string[])value).Clone();
        if (value is byte[]) return ((byte[])value).Clone();
        if (value is Image) return ((Image)value).Clone();
        if (value is MemoryStream) return new MemoryStream(((MemoryStream)value).ToArray());
        // Do not silently discard an opaque application-specific format.
        throw new InvalidOperationException("A clipboard format cannot be preserved. Use pasteMethod 'direct' or copy plain text first.");
    }

    static DataObject SnapshotClipboard(List<IDisposable> owned, out uint sequence)
    {
        sequence = GetClipboardSequenceNumber();
        if (sequence == 0) throw new InvalidOperationException("Cannot access clipboard sequence number.");
        IDataObject source = Clipboard.GetDataObject();
        DataObject snapshot = new DataObject();
        if (source != null)
        {
            foreach (string format in source.GetFormats(false))
            {
                object value = CloneClipboardValue(source.GetData(format, false));
                IDisposable disposable = value as IDisposable;
                if (disposable != null) owned.Add(disposable);
                snapshot.SetData(format, false, value);
            }
        }
        if (GetClipboardSequenceNumber() != sequence)
            throw new InvalidOperationException("Clipboard changed while saving it; insertion cancelled.");
        return snapshot;
    }

    static void Restore(DataObject snapshot, uint ourSequence)
    {
        // Check again on every retry so a new user copy always takes precedence.
        for (int attempt = 0; attempt < 10; attempt++)
        {
            if (GetClipboardSequenceNumber() != ourSequence) return;
            try
            {
                if (snapshot.GetFormats(false).Length == 0) Clipboard.Clear();
                else Clipboard.SetDataObject(snapshot, true, 0, 0);
                return;
            }
            catch (ExternalException)
            {
                if (attempt == 9) throw;
                Thread.Sleep(50);
            }
        }
    }

    static uint OwnedSequence(string token)
    {
        uint sequence = GetClipboardSequenceNumber();
        if (!Object.Equals(Clipboard.GetData(OwnerFormat), token)) return 0;
        return GetClipboardSequenceNumber() == sequence ? sequence : 0;
    }

    public static void Insert(string text, string method, int restoreDelayMs)
    {
        if (String.IsNullOrWhiteSpace(text)) return;
        if (restoreDelayMs < 0 || restoreDelayMs > 30000) throw new ArgumentOutOfRangeException("restoreDelayMs");
        // Resolve the target before potentially expensive clipboard operations.
        IntPtr target = GetForegroundWindow();
        WaitForModifiers(target);
        uint pid;
        GetWindowThreadProcessId(target, out pid);
        StringBuilder className = new StringBuilder(256);
        GetClassName(target, className, className.Capacity);
        string processName = "";
        try { using (Process process = Process.GetProcessById((int)pid)) processName = process.ProcessName; }
        catch (ArgumentException) { CheckFocus(target); }
        method = SelectMethod(method, processName, className.ToString());
        if (method == "direct")
        {
            text = DirectText(text);
            // Small batches keep focus checks responsive and preserve surrogate pairs.
            for (int i = 0; i < text.Length;)
            {
                WaitForModifiers(target);
                var inputs = new List<INPUT>();
                int end = Math.Min(i + 16, text.Length);
                if (end < text.Length && Char.IsHighSurrogate(text[end - 1])) end++;
                for (; i < end; i++)
                {
                    if (Char.IsControl(text[i])) continue;
                    inputs.Add(Key(text[i], false, true));
                    inputs.Add(Key(text[i], true, true));
                }
                if (inputs.Count > 0) Send(inputs.ToArray(), target);
                Thread.Sleep(5);
            }
            return;
        }
        if (method != "ctrl-v" && method != "ctrl-shift-v" && method != "shift-insert")
            throw new ArgumentException("Unknown paste method: " + method);

        var owned = new List<IDisposable>();
        DataObject snapshot = null;
        uint ourSequence = 0;
        bool wroteClipboard = false;
        string token = Guid.NewGuid().ToString();
        try
        {
            uint previousSequence;
            snapshot = SnapshotClipboard(owned, out previousSequence);
            WaitForModifiers(target);
            if (GetClipboardSequenceNumber() != previousSequence)
                throw new InvalidOperationException("Clipboard changed before paste; insertion cancelled.");
            var payload = new DataObject(DataFormats.UnicodeText, text);
            payload.SetData(OwnerFormat, false, token);
            // SetDataObject can fail after changing the clipboard (e.g. while flushing).
            // The ownership marker lets finally restore only our own partial write.
            wroteClipboard = true;
            Clipboard.SetDataObject(payload, true, 0, 0);
            ourSequence = OwnedSequence(token);
            if (ourSequence == 0) throw new InvalidOperationException("Clipboard changed before paste; insertion cancelled.");
            Thread.Sleep(60);
            WaitForModifiers(target);
            if (OwnedSequence(token) != ourSequence)
                throw new InvalidOperationException("Clipboard changed before paste; insertion cancelled.");
            Paste(method, target);
        }
        finally
        {
            try
            {
                if (wroteClipboard)
                {
                    Thread.Sleep(restoreDelayMs);
                    if (ourSequence == 0) ourSequence = OwnedSequence(token);
                    if (ourSequence != 0 && OwnedSequence(token) == ourSequence) Restore(snapshot, ourSequence);
                }
            }
            finally { foreach (IDisposable value in owned) value.Dispose(); }
        }
    }
}
