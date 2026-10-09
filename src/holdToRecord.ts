/** Serializes one press/release cycle, including release during async startup. */
export class HoldToRecord {
  private held = false;
  private closing = false;
  private release: (() => void) | undefined;
  private pending: Promise<void> | undefined;
  private recording = false;

  constructor(private readonly actions: {
    start: () => Promise<void>;
    stop: () => Promise<string>;
    transcribe: (file: string) => Promise<void>;
    report: (error: unknown) => void;
  }) {}

  press(): void {
    if (this.held || this.closing) return;
    this.held = true;
    // A press while processing is discarded, not queued for later recording.
    if (this.pending) return;
    const released = new Promise<void>(resolve => { this.release = resolve; });
    this.pending = this.run(released).finally(() => { this.pending = undefined; });
  }

  releaseKey(): void {
    this.held = false;
    this.release?.();
    this.release = undefined;
  }

  private async run(released: Promise<void>): Promise<void> {
    try {
      await this.actions.start();
      this.recording = true;
      await released;
      const file = await this.actions.stop();
      this.recording = false;
      if (!this.closing) await this.actions.transcribe(file);
    } catch (error) {
      this.recording = false;
      this.actions.report(error);
    }
  }

  isRecording(): boolean { return this.recording; }
  isClosing(): boolean { return this.closing; }
  async idle(): Promise<void> { await this.pending; }

  async close(): Promise<void> {
    this.closing = true;
    this.releaseKey();
    await this.idle();
  }
}
