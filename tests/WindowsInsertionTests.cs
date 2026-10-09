using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class WindowsInsertionTests
{
    [DllImport("user32.dll")] static extern uint GetClipboardSequenceNumber();
    static Type helper;
    static object Call(string method, params object[] args)
    {
        return helper.GetMethod(method, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic).Invoke(null, args);
    }
    static void Equal(object expected, object actual)
    {
        if (!Object.Equals(expected, actual)) throw new Exception("Expected " + expected + ", got " + actual);
    }
    static DataObject Snapshot(List<IDisposable> owned)
    {
        return (DataObject)Call("SnapshotClipboard", owned, (uint)0);
    }
    public static void Run(Type inputHelper)
    {
        helper = inputHelper;
        Equal(IntPtr.Size == 8 ? 40 : 28, Marshal.SizeOf(helper.GetNestedType("INPUT", BindingFlags.NonPublic)));
        Equal("ctrl-shift-v", Call("SelectMethod", "auto", "WindowsTerminal", ""));
        Equal("ctrl-shift-v", Call("SelectMethod", "auto", "", "CASCADIA_HOSTING_WINDOW_CLASS"));
        Equal("shift-insert", Call("SelectMethod", "auto", "conhost", "ConsoleWindowClass"));
        Equal("ctrl-v", Call("SelectMethod", "auto", "notepad", "Notepad"));
        Equal("direct", Call("SelectMethod", "direct", "WindowsTerminal", ""));
        Equal("ctrl-v", Call("SelectMethod", "ctrl-v", "WindowsTerminal", ""));
        Equal("a b c d", Call("DirectText", "a\r\nb\tc\nd"));
        string special = "Quotes: \" ' ` $() ; & | \\ — தமிழ் 😀";
        Equal(special, Call("DirectText", special));
        Equal(special, Call("CloneClipboardValue", special));
        try
        {
            Call("CloneClipboardValue", new object());
            throw new Exception("Opaque clipboard data was accepted");
        }
        catch (TargetInvocationException error)
        {
            if (!(error.InnerException is InvalidOperationException)) throw;
        }

        var owned = new List<IDisposable>();
        DataObject original = Snapshot(owned); // Fail before modifying anything if preservation is impossible.
        try
        {
            var tagged = new DataObject(DataFormats.UnicodeText, "dictation");
            tagged.SetData("WhisperNpu.TranscriptionOwner", false, "test-owner");
            Clipboard.SetDataObject(tagged, true);
            uint ownedSequence = (uint)Call("OwnedSequence", "test-owner");
            if (ownedSequence == 0) throw new Exception("Clipboard ownership was not detected");
            Equal((uint)0, Call("OwnedSequence", "another-owner"));
            Clipboard.SetText("a newer copy");
            Equal((uint)0, Call("OwnedSequence", "test-owner"));

            Clipboard.SetText("before dictation");
            DataObject saved = Snapshot(owned);
            Clipboard.SetText(special);
            Call("Restore", saved, GetClipboardSequenceNumber());
            Equal("before dictation", Clipboard.GetText());

            Clipboard.SetText("dictation");
            uint dictationSequence = GetClipboardSequenceNumber();
            Clipboard.SetText("new user copy");
            Call("Restore", saved, dictationSequence);
            Equal("new user copy", Clipboard.GetText());

            Clipboard.Clear();
            saved = Snapshot(owned);
            Clipboard.SetText("dictation");
            Call("Restore", saved, GetClipboardSequenceNumber());
            IDataObject empty = Clipboard.GetDataObject();
            Equal(0, empty == null ? 0 : empty.GetFormats(false).Length);

            var rich = new DataObject();
            rich.SetData(DataFormats.UnicodeText, false, "rich text");
            rich.SetData(DataFormats.Html, false, "<b>rich text</b>");
            rich.SetData(DataFormats.Rtf, false, @"{\rtf1 rich text}");
            rich.SetData(DataFormats.FileDrop, false, new string[] { @"C:\example.txt" });
            Clipboard.SetDataObject(rich, true);
            saved = Snapshot(owned);
            Clipboard.SetText("dictation");
            Call("Restore", saved, GetClipboardSequenceNumber());
            Equal("rich text", Clipboard.GetText());
            Equal("<b>rich text</b>", Clipboard.GetData(DataFormats.Html));
            Equal(@"{\rtf1 rich text}", Clipboard.GetData(DataFormats.Rtf));
            Equal(@"C:\example.txt", Clipboard.GetFileDropList()[0]);

            using (var bitmap = new Bitmap(2, 2))
            {
                bitmap.SetPixel(0, 0, Color.Red);
                Clipboard.SetImage(bitmap);
                saved = Snapshot(owned);
                Clipboard.SetText("dictation");
                Call("Restore", saved, GetClipboardSequenceNumber());
                using (var restored = new Bitmap(Clipboard.GetImage()))
                    Equal(Color.Red.ToArgb(), restored.GetPixel(0, 0).ToArgb());
            }
            Console.WriteLine("Windows helper: selection, Unicode, clipboard formats, empty clipboard, concurrent copy and restoration passed.");
        }
        finally
        {
            if (original.GetFormats(false).Length == 0) Clipboard.Clear();
            else Clipboard.SetDataObject(original, true);
            foreach (IDisposable value in owned) value.Dispose();
        }
    }
}
