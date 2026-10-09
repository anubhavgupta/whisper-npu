using System;
using System.Threading.Tasks;
using WhisperTray;

static class Tests
{
    static void Check(bool condition, string name) { if (!condition) throw new Exception(name); Console.WriteLine("PASS " + name); }
    static string Text(BoundedLog log) { long version; return log.Snapshot(out version); }
    static void Main()
    {
        var log = new BoundedLog(3, 100);
        log.Append("one\ntwo\nthree\nfour\n");
        Check(Text(log) == "two\nthree\nfour\n", "oldest lines evicted");
        log.Append("par"); log.Append("tial");
        Check(Text(log) == "three\nfour\npartial", "partial lines retained across pipe reads");
        log = new BoundedLog(100, 10);
        log.Append(new string('x', 1000));
        Check(Text(log).Length == 10, "unterminated output bounded");
        log.Append("\nnew\n");
        Check(Text(log) == "new\n", "oversized old line evicted");
        log = new BoundedLog();
        Parallel.For(0, 10000, i => log.Append("entry\n"));
        Check(Text(log).Length == 60000, "concurrent stdout and stderr retained");
        log.Append("Unicode: தமிழ் 😀\r\n");
        Check(Text(log).EndsWith("Unicode: தமிழ் 😀\n"), "Unicode and Windows line endings");
        log = new BoundedLog();
        Parallel.For(0, 1000, i => log.Append(new string('z', 4096)));
        Check(Text(log).Length <= 1024 * 1024, "two megabyte UTF-16 budget");
    }
}
