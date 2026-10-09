const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');
const { waitForTray } = require('../dist/engineControl');

test('engine waits for job assignment handshake, then accepts quit once', async () => {
  const input = new PassThrough(); let quits = 0; let started = false;
  const ready = waitForTray(input, () => quits++).then(() => { started = true; });
  input.write('unknown\n'); await new Promise(r => setImmediate(r));
  assert.equal(started, false);
  input.write('sta'); input.write('rt\n'); await ready;
  assert.equal(started, true);
  input.write('quit\nquit\n'); input.end();
  await new Promise(r => setImmediate(r)); assert.equal(quits, 1);
});
test('launcher disconnect after startup requests shutdown', async () => {
  const input = new PassThrough(); let quits = 0;
  const ready = waitForTray(input, () => quits++);
  input.write('start\n'); await ready; input.end();
  await new Promise(r => setImmediate(r)); assert.equal(quits, 1);
});
test('launcher disconnect before startup rejects and requests shutdown', async () => {
  const input = new PassThrough(); let quits = 0;
  const ready = waitForTray(input, () => quits++); input.end();
  await assert.rejects(ready, /disconnected before startup/); assert.equal(quits, 1);
});
test('missing handshake fails instead of running an unmanaged engine', async () => {
  const input = new PassThrough();
  await assert.rejects(waitForTray(input, () => {}, 10), /startup handshake/);
  input.destroy();
});
test('quit before start cancels startup', async () => {
  const input = new PassThrough(); let quits = 0;
  const ready = waitForTray(input, () => quits++); input.write('quit\n');
  await assert.rejects(ready, /Startup cancelled/); assert.equal(quits, 1); input.end();
});

test('OpenVINO launch is hidden, rejects spawn errors, and reports unexpected exit', async t => {
  const { EventEmitter } = require('node:events');
  const childProcess = require('node:child_process');
  const OVMSManager = require('../dist/ovmsManager').default;
  const children = [];
  t.mock.method(childProcess, 'spawn', (command, args, options) => {
    assert.equal(command, 'powershell.exe');
    assert.equal(options.windowsHide, true);
    assert.equal(args.includes('-NonInteractive'), true);
    assert.deepEqual(args.slice(args.indexOf('-ExecutionPolicy'), args.indexOf('-ExecutionPolicy') + 2), ['-ExecutionPolicy', 'Bypass']);
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.exitCode = null; child.signalCode = null;
    children.push(child);
    queueMicrotask(() => children.length === 1 ? child.emit('error', Error('missing powershell')) : child.emit('spawn'));
    return child;
  });
  const errors = [];
  const manager = new OVMSManager('./config.json', error => errors.push(error.message));
  await assert.rejects(manager.start(), /missing powershell/);
  await manager.start(); children[1].emit('exit', 7, null);
  assert.match(errors[0], /code 7/);
});

test('OpenVINO shutdown terminates its Windows child process tree', async t => {
  const { EventEmitter } = require('node:events');
  const childProcess = require('node:child_process');
  const OVMSManager = require('../dist/ovmsManager').default;
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  t.after(() => Object.defineProperty(process, 'platform', originalPlatform));
  const errors = []; const commands = [];
  t.mock.method(childProcess, 'spawn', (command, args, options) => {
    commands.push([command, args]); assert.equal(options.windowsHide, true);
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.pid = 123; child.exitCode = null; child.signalCode = null;
    queueMicrotask(() => command === 'taskkill.exe' ? child.emit('close', 0) : child.emit('spawn'));
    return child;
  });
  const manager = new OVMSManager('./config.json', error => errors.push(error));
  const child = await manager.start(); await manager.stop(); child.emit('exit', 1, null);
  assert.deepEqual(commands[1], ['taskkill.exe', ['/PID', '123', '/T', '/F']]);
  assert.deepEqual(errors, []); assert.equal(manager.isRunning(), false);
});
