using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace WhisperTray
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            string name = @"Local\WhisperNpu-" + WindowsIdentity.GetCurrent().User.Value;
            using (var show = new EventWaitHandle(false, EventResetMode.AutoReset, name + "-Show"))
            using (var mutex = new Mutex(false, name))
            {
                bool owner;
                try { owner = mutex.WaitOne(0); }
                catch (AbandonedMutexException) { owner = true; }
                if (!owner) { show.Set(); return; }
                try { using (var tray = new TrayContext(show)) Application.Run(tray); }
                catch (Exception error) { MessageBox.Show(error.Message, "Whisper NPU could not start", MessageBoxButtons.OK, MessageBoxIcon.Error); }
                finally { mutex.ReleaseMutex(); }
            }
        }
    }

    sealed class TrayContext : ApplicationContext
    {
        readonly BoundedLog log = new BoundedLog();
        readonly EventWaitHandle showRequest;
        readonly Form window;
        readonly RichTextBox viewer;
        readonly NotifyIcon tray;
        readonly Icon icon;
        readonly ToolStripMenuItem quit;
        readonly System.Windows.Forms.Timer timer;
        Process engine;
        ProcessJob job;
        Task outputReader, errorReader;
        bool started, quitting, failed, exiting;
        DateTime quitDeadline;
        long shownVersion = -1;

        public TrayContext(EventWaitHandle showRequest)
        {
            this.showRequest = showRequest;
            using (Stream stream = typeof(TrayContext).Assembly.GetManifestResourceStream("WhisperTray.tray.ico"))
                icon = new Icon(stream);
            window = new Form { Text = "Whisper NPU — logs", Size = new Size(900, 580), Icon = icon, StartPosition = FormStartPosition.CenterScreen };
            viewer = new RichTextBox {
                Dock = DockStyle.Fill, ReadOnly = true, DetectUrls = false, WordWrap = false,
                BackColor = Color.FromArgb(24, 27, 33), ForeColor = Color.Gainsboro,
                Font = new Font(FontFamily.GenericMonospace, 10), BorderStyle = BorderStyle.None
            };
            window.Controls.Add(viewer);
            window.FormClosing += (sender, args) => {
                if (args.CloseReason == CloseReason.UserClosing && !exiting) { args.Cancel = true; window.Hide(); }
                else if (!exiting) BeginQuit();
            };
            window.Resize += (sender, args) => { if (window.WindowState == FormWindowState.Minimized) window.Hide(); };
            var menu = new ContextMenuStrip();
            menu.Items.Add("Show logs", null, (sender, args) => ShowLogs());
            menu.Items.Add(new ToolStripSeparator());
            quit = new ToolStripMenuItem("Quit", null, (sender, args) => BeginQuit());
            menu.Items.Add(quit);
            tray = new NotifyIcon { Icon = icon, Text = "Whisper NPU — starting", ContextMenuStrip = menu, Visible = true };
            tray.MouseClick += (sender, args) => { if (args.Button == MouseButtons.Left) ShowLogs(); };
            timer = new System.Windows.Forms.Timer { Interval = 150 };
            timer.Tick += Tick;
            timer.Start();
        }

        void ShowLogs()
        {
            RenderLogs(true);
            window.Show();
            window.WindowState = FormWindowState.Normal;
            window.Activate();
        }
        void RenderLogs(bool force = false)
        {
            if (!force && !window.Visible) return;
            long version;
            string text = log.Snapshot(out version);
            if (version == shownVersion) return;
            bool follow = viewer.SelectionLength == 0 && viewer.SelectionStart >= viewer.TextLength;
            int start = viewer.SelectionStart, length = viewer.SelectionLength;
            viewer.Text = text;
            if (follow) { viewer.Select(viewer.TextLength, 0); viewer.ScrollToCaret(); }
            else viewer.Select(Math.Min(start, viewer.TextLength), Math.Min(length, Math.Max(0, viewer.TextLength - start)));
            shownVersion = version;
        }
        async Task ReadLog(StreamReader reader, string label)
        {
            try {
                char[] buffer = new char[4096];
                int count;
                while ((count = await reader.ReadAsync(buffer, 0, buffer.Length).ConfigureAwait(false)) > 0)
                    log.Append((label.Length > 0 ? label : "") + new string(buffer, 0, count));
            }
            catch (Exception error) { log.Append("\nLog stream closed: " + error.Message + "\n"); }
        }
        void StartEngine()
        {
            try {
                string directory = AppDomain.CurrentDomain.BaseDirectory;
                job = new ProcessJob();
                engine = new Process { StartInfo = new ProcessStartInfo {
                    FileName = Path.Combine(directory, "whisper-npu-engine.exe"), Arguments = "--tray-engine",
                    WorkingDirectory = directory, UseShellExecute = false, CreateNoWindow = true,
                    RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
                    StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
                }};
                engine.Start();
                // The engine waits for this handshake before spawning any children.
                job.Add(engine);
                outputReader = ReadLog(engine.StandardOutput, "");
                errorReader = ReadLog(engine.StandardError, "[stderr] ");
                engine.StandardInput.WriteLine("start");
                engine.StandardInput.Flush();
                tray.Text = "Whisper NPU — running";
                log.Append("Whisper NPU started. Use the recording shortcut; close this window to return to the tray.\n");
            }
            catch (Exception error) {
                try { if (engine != null && !engine.HasExited) engine.Kill(); } catch { }
                job?.Dispose(); job = null;
                Fail("Could not start dictation: " + error.Message);
            }
        }
        void Fail(string message)
        {
            failed = true;
            log.Append("\n" + message + "\n");
            tray.Text = "Whisper NPU — stopped (see logs)";
            ShowLogs();
        }
        bool EngineExited()
        {
            try { return engine == null || engine.HasExited; }
            catch (InvalidOperationException) { return true; }
        }
        void Tick(object sender, EventArgs args)
        {
            if (!started) { started = true; if (!quitting) StartEngine(); }
            if (showRequest.WaitOne(0)) ShowLogs();
            if (quitting) {
                if (EngineExited() || DateTime.UtcNow >= quitDeadline) { FinishQuit(); return; }
            }
            else if (!failed && EngineExited()) {
                job?.Dispose(); job = null;
                Fail("Dictation exited unexpectedly (code " + (engine == null ? "unknown" : engine.ExitCode.ToString()) + "). Quit and reopen the app to retry.");
            }
            RenderLogs();
        }
        void BeginQuit()
        {
            if (quitting) return;
            quitting = true;
            quit.Enabled = false;
            tray.Text = "Whisper NPU — stopping";
            log.Append("\nStopping dictation and restoring clipboard if needed…\n");
            quitDeadline = DateTime.UtcNow.AddSeconds(45);
            try {
                if (!EngineExited()) { engine.StandardInput.WriteLine("quit"); engine.StandardInput.Flush(); }
            }
            catch (IOException) { /* A closed control pipe means the engine is exiting. */ }
        }
        void FinishQuit()
        {
            exiting = true;
            timer.Stop();
            job?.Dispose(); job = null;
            tray.Visible = false;
            window.Close();
            ExitThread();
        }
        protected override void Dispose(bool disposing)
        {
            if (disposing) {
                timer.Stop(); timer.Dispose();
                job?.Dispose();
                engine?.Dispose();
                tray.Visible = false; tray.ContextMenuStrip.Dispose(); tray.Dispose();
                window.Dispose(); icon.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
