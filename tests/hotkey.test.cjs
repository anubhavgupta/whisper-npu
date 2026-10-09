const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { HoldToRecord } = require('../dist/holdToRecord');
const { HotkeyBinding } = require('../dist/hotkeyBinding');
const HotkeyRecorder = require('../dist/hotkeyRecorder').default;
const { insertionOptions } = require('../dist/textInsertion');

const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const keys = { Slash: 53, Meta: 3675, MetaRight: 3676, Ctrl: 29, CtrlRight: 3613,
  Alt: 56, AltRight: 3640, Shift: 42, ShiftRight: 54, Equal: 13, A: 30 };
const event = (keycode, modifiers = {}) => ({ keycode, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...modifiers });
function fixture(overrides = {}) {
  const calls = [];
  const cycle = new HoldToRecord({
    start: async () => { calls.push('start'); },
    stop: async () => { calls.push('stop'); return 'recording.wav'; },
    transcribe: async file => { calls.push(['transcribe', file]); },
    report: error => { calls.push(['error', error.message]); },
    ...overrides
  });
  return { cycle, calls };
}

test('press and release records and transcribes exactly once', async () => {
  const { cycle, calls } = fixture();
  cycle.press(); await tick();
  assert.equal(cycle.isRecording(), true);
  cycle.releaseKey(); cycle.releaseKey(); await cycle.idle();
  assert.deepEqual(calls, ['start', 'stop', ['transcribe', 'recording.wav']]);
});

test('release before startup finishes stops as soon as it is ready', async () => {
  const ready = deferred();
  const { cycle, calls } = fixture({ start: () => ready.promise });
  cycle.press(); cycle.releaseKey(); await tick();
  assert.deepEqual(calls, []);
  ready.resolve(); await cycle.idle();
  assert.deepEqual(calls, ['stop', ['transcribe', 'recording.wav']]);
});

test('keydown repeat cannot start a second recording', async () => {
  const { cycle, calls } = fixture();
  for (let i = 0; i < 20; i++) cycle.press();
  cycle.releaseKey(); await cycle.idle();
  assert.equal(calls.filter(x => x === 'start').length, 1);
});

test('press while transcribing is discarded and does not restart on repeat', async () => {
  const done = deferred();
  const { cycle, calls } = fixture({ transcribe: () => done.promise });
  cycle.press(); cycle.releaseKey(); await tick();
  cycle.press(); done.resolve(); await cycle.idle(); cycle.press();
  assert.deepEqual(calls, ['start', 'stop']);
  cycle.releaseKey(); cycle.press(); cycle.releaseKey(); await cycle.idle();
  assert.deepEqual(calls, ['start', 'stop', 'start', 'stop']);
});

test('startup failure is reported and a later press can retry', async () => {
  let attempts = 0;
  const { cycle, calls } = fixture({ start: async () => { if (++attempts === 1) throw Error('no microphone'); } });
  cycle.press(); cycle.releaseKey(); await cycle.idle();
  assert.deepEqual(calls, [['error', 'no microphone']]);
  cycle.press(); cycle.releaseKey(); await cycle.idle();
  assert.deepEqual(calls.slice(1), ['stop', ['transcribe', 'recording.wav']]);
});

test('shutdown during startup waits, stops, and skips transcription', async () => {
  const ready = deferred();
  const { cycle, calls } = fixture({ start: () => ready.promise });
  cycle.press(); const closing = cycle.close(); ready.resolve(); await closing;
  cycle.press(); await tick();
  assert.deepEqual(calls, ['stop']);
});

for (const released of [keys.Slash, keys.Meta, keys.MetaRight]) {
  test(`release of key ${released} stops the active combination`, async () => {
    const { cycle, calls } = fixture();
    const binding = new HotkeyBinding('win+/', keys, () => cycle.press(), () => cycle.releaseKey());
    binding.keydown(event(keys.Slash, { metaKey: true }));
    binding.keyup(event(released)); await cycle.idle();
    assert.deepEqual(calls, ['start', 'stop', ['transcribe', 'recording.wav']]);
  });
}

test('modifier release does not rearm a still-held slash key', () => {
  let presses = 0;
  const binding = new HotkeyBinding('win+/', keys, () => presses++, () => {});
  binding.keydown(event(keys.Slash, { metaKey: true }));
  binding.keyup(event(keys.Meta));
  binding.keydown(event(keys.Meta, { metaKey: true }));
  binding.keydown(event(keys.Slash, { metaKey: true }));
  assert.equal(presses, 1);
  binding.keyup(event(keys.Slash)); binding.keydown(event(keys.Slash, { metaKey: true }));
  assert.equal(presses, 2);
});

test('unrelated keys or wrong modifiers do not activate the shortcut', () => {
  let presses = 0;
  const binding = new HotkeyBinding('win+/', keys, () => presses++, () => {});
  binding.keydown(event(keys.A, { metaKey: true }));
  binding.keydown(event(keys.Slash)); binding.keyup(event(keys.Slash));
  binding.keydown(event(keys.Slash, { metaKey: true, ctrlKey: true }));
  assert.equal(presses, 0);
});

test('shifted punctuation requires Shift; invalid shortcut fails before hooks start', () => {
  let presses = 0;
  const binding = new HotkeyBinding('ctrl++', keys, () => presses++, () => {});
  binding.keydown(event(keys.Equal, { ctrlKey: true, shiftKey: true }));
  assert.equal(presses, 1);
  assert.throws(() => new HotkeyBinding('win+not-a-key', keys, () => {}, () => {}));
});

test('native startup error propagates and listeners are removed', async () => {
  const hook = new EventEmitter(); let stopped = false;
  hook.start = () => { throw Error('hook failed'); }; hook.stop = () => { stopped = true; };
  const recorder = new HotkeyRecorder({ hook, keys, recordAudio: {}, transcriber: {}, insertion: {} });
  await assert.rejects(recorder.start(), /hook failed/);
  assert.equal(hook.listenerCount('keydown'), 0);
  assert.equal(hook.listenerCount('keyup'), 0);
  assert.equal(stopped, true);
  await recorder.unregister();
});

test('unregister cleans listeners even when no recording happened', async () => {
  const hook = new EventEmitter(); let stops = 0;
  hook.start = () => {}; hook.stop = () => { stops++; };
  const recorder = new HotkeyRecorder({ hook, keys, recordAudio: {}, transcriber: {}, insertion: {} });
  await recorder.start(); await recorder.start();
  assert.equal(hook.listenerCount('keyup'), 1);
  await recorder.unregister(); await recorder.unregister();
  assert.equal(stops, 1);
  assert.equal(hook.listenerCount('keyup'), 0);
});

test('insertion configuration defaults and validation', () => {
  assert.deepEqual(insertionOptions({}), { method: 'auto', restoreDelayMs: 500 });
  assert.deepEqual(insertionOptions({ pasteMethod: 'direct', clipboardRestoreDelayMs: 0 }), { method: 'direct', restoreDelayMs: 0 });
  assert.throws(() => insertionOptions({ pasteMethod: 'typo' }), /pasteMethod/);
  for (const value of [-1, 30001, 1.5, '500', NaN]) {
    assert.throws(() => insertionOptions({ clipboardRestoreDelayMs: value }), /clipboardRestoreDelayMs/);
  }
});

test('insertion passes Unicode and shell characters as data, never as command text', async t => {
  const childProcess = require('node:child_process');
  const { PassThrough } = require('node:stream');
  const TextInsertion = require('../dist/textInsertion').default;
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  t.after(() => Object.defineProperty(process, 'platform', originalPlatform));
  const text = 'தமிழ் 😀 "quotes" ` $() & | ; \\ \n';
  let received;
  t.mock.method(childProcess, 'spawn', (command, args, options) => {
    assert.equal(command, 'powershell.exe');
    assert.equal(args.includes('-STA'), true);
    assert.equal(args.some(arg => arg.includes(text)), false);
    assert.equal(options.shell, undefined);
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    let input = '';
    child.stdin.on('data', chunk => { input += chunk.toString(); });
    child.stdin.on('finish', () => {
      received = JSON.parse(Buffer.from(input, 'base64').toString('utf8'));
      child.emit('close', 0);
    });
    return child;
  });
  await new TextInsertion({}).insert(text);
  assert.deepEqual(received, { text, method: 'auto', restoreDelayMs: 500 });
});

test('failed helper reports an error without trying another insertion method', async t => {
  const childProcess = require('node:child_process');
  const { PassThrough } = require('node:stream');
  const TextInsertion = require('../dist/textInsertion').default;
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  t.after(() => Object.defineProperty(process, 'platform', originalPlatform));
  let calls = 0;
  t.mock.method(childProcess, 'spawn', () => {
    calls++;
    const child = new EventEmitter();
    child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.stdin.on('finish', () => { child.stderr.write('Clipboard cannot be preserved'); child.emit('close', 1); });
    return child;
  });
  await assert.rejects(new TextInsertion({}).insert('hello'), /Clipboard cannot be preserved/);
  assert.equal(calls, 1);
});

test('shutdown during transcription aborts the request and does not insert', async t => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const file = path.join(dir, 'audio.wav'); fs.writeFileSync(file, 'audio');
  const entered = deferred(); let inserted = false; let aborted = false;
  const hook = new EventEmitter(); hook.start = () => {}; hook.stop = () => {};
  const recorder = new HotkeyRecorder({ hook, keys,
    recordAudio: { start: async () => ({ success: true }), stop: async () => ({ success: true, outputFile: file }) },
    transcriber: { transcribe: async (_file, _format, signal) => {
      entered.resolve();
      await new Promise(resolve => signal.addEventListener('abort', () => { aborted = true; resolve(); }, { once: true }));
      return { text: 'hello' };
    } },
    insertion: { insert: async () => { inserted = true; } }
  });
  await recorder.start();
  hook.emit('keydown', event(keys.Slash, { metaKey: true })); hook.emit('keyup', event(keys.Slash));
  await entered.promise; await recorder.unregister();
  assert.equal(aborted, true); assert.equal(inserted, false);
});

test('audio process exiting during startup is a failure, even with exit code zero', async t => {
  const childProcess = require('node:child_process');
  const { PassThrough } = require('node:stream');
  const RecordAudio = require('../dist/recordAudio').default;
  t.mock.method(childProcess, 'spawn', () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    queueMicrotask(() => { child.emit('spawn'); child.emit('exit', 0); });
    return child;
  });
  const recorder = new RecordAudio();
  const result = await recorder.start({});
  assert.equal(result.success, false);
  assert.match(result.error, /before it was ready/);
  assert.equal(recorder.isRecordingActive(), false);
});

test('missing audio executable fails without leaving recording active', async t => {
  const childProcess = require('node:child_process');
  const { PassThrough } = require('node:stream');
  const RecordAudio = require('../dist/recordAudio').default;
  t.mock.method(childProcess, 'spawn', () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough();
    queueMicrotask(() => child.emit('error', Error('ENOENT')));
    return child;
  });
  const recorder = new RecordAudio();
  assert.deepEqual(await recorder.start({}), { success: false, error: 'ENOENT' });
  assert.equal(recorder.isRecordingActive(), false);
});

for (const scenario of [
  { name: 'config selects Ctrl+Space', config: { hotkey: ' Ctrl + Space ' }, key: 57, modifiers: { ctrlKey: true } },
  { name: 'missing config keeps Win+/', config: {}, key: keys.Slash, modifiers: { metaKey: true } },
  { name: 'explicit argument overrides config', config: { hotkey: 'ctrl+space' }, override: 'alt+a', key: keys.A, modifiers: { altKey: true } }
]) {
  test(scenario.name, async () => {
    const hook = new EventEmitter(); hook.start = () => {}; hook.stop = () => {};
    let recordings = 0;
    const recorder = new HotkeyRecorder({ hook, keys: { ...keys, Space: 57 }, config: scenario.config,
      recordAudio: { start: async () => { recordings++; return { success: true }; }, stop: async () => ({ success: true, outputFile: 'unused.wav' }) },
      transcriber: {}, insertion: {}
    });
    await recorder.start(scenario.override);
    hook.emit('keydown', event(scenario.key, scenario.modifiers));
    await tick();
    assert.equal(recordings, 1);
    await recorder.unregister();
  });
}

test('invalid configured shortcuts fail before starting the native hook', async () => {
  for (const hotkey of ['', '  ', 42, 'ctrl+not-a-key']) {
    const hook = new EventEmitter(); let started = false;
    hook.start = () => { started = true; }; hook.stop = () => {};
    const recorder = new HotkeyRecorder({ hook, keys, config: { hotkey }, recordAudio: {}, transcriber: {}, insertion: {} });
    await assert.rejects(recorder.start(), /hotkey|shortcut/i);
    assert.equal(started, false); assert.equal(hook.listenerCount('keydown'), 0);
    await recorder.unregister();
  }
});
