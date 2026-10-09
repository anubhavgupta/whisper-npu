using System;
using System.Collections.Generic;
using System.Text;

namespace WhisperTray
{
    // Both pipe readers may append concurrently. The UI only takes bounded snapshots.
    public sealed class BoundedLog
    {
        readonly object gate = new object();
        readonly Queue<string> lines = new Queue<string>();
        readonly StringBuilder partial = new StringBuilder();
        readonly int maxLines, maxCharacters;
        int characters;
        public long Version { get; private set; }
        public BoundedLog(int maxLines = 10000, int maxCharacters = 1024 * 1024)
        {
            if (maxLines < 1 || maxCharacters < 1) throw new ArgumentOutOfRangeException();
            this.maxLines = maxLines;
            this.maxCharacters = maxCharacters;
        }
        public void Append(string text)
        {
            if (String.IsNullOrEmpty(text)) return;
            lock (gate)
            {
                foreach (char c in text)
                {
                    if (c == '\r') continue;
                    partial.Append(c);
                    characters++;
                    if (c == '\n') { lines.Enqueue(partial.ToString()); partial.Clear(); }
                }
                while (lines.Count > 0 && (lines.Count + (partial.Length > 0 ? 1 : 0) > maxLines || characters > maxCharacters))
                    characters -= lines.Dequeue().Length;
                if (characters > maxCharacters)
                {
                    partial.Remove(0, characters - maxCharacters);
                    characters = maxCharacters;
                }
                Version++;
            }
        }
        public string Snapshot(out long version)
        {
            lock (gate)
            {
                version = Version;
                return String.Concat(lines) + partial.ToString();
            }
        }
    }
}
