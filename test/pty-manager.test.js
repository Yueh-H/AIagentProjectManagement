const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { createPtyManager } = require('../server/pty-manager');

test('createPty prepares spawn-helper permissions and wires pane lifecycle on unix', () => {
  const calls = {
    chmod: null,
    spawn: null,
    resize: [],
    write: [],
    kill: 0,
    statPath: null,
  };

  const fakePtyProcess = {
    resize: (cols, rows) => calls.resize.push([cols, rows]),
    write: (data) => calls.write.push(data),
    kill: () => { calls.kill += 1; },
  };

  const manager = createPtyManager({
    fsImpl: {
      statSync: (targetPath) => {
        calls.statPath = targetPath;
        return { mode: 0o644 };
      },
      chmodSync: (targetPath, mode) => {
        calls.chmod = [targetPath, mode];
      },
    },
    pathImpl: path,
    ptyImpl: {
      spawn: (shell, args, options) => {
        calls.spawn = { shell, args, options };
        return fakePtyProcess;
      },
    },
    osImpl: {
      platform: () => 'darwin',
    },
    processImpl: {
      platform: 'darwin',
      arch: 'arm64',
      env: {
        SHELL: '/bin/zsh',
        HOME: '/Users/tester',
      },
    },
    resolveImpl: () => '/tmp/node-pty/package.json',
    warnImpl: () => {},
  });

  const created = manager.createPty('pane-1', 120, 48);

  assert.equal(created, fakePtyProcess);
  assert.equal(calls.spawn.shell, '/bin/zsh');
  assert.deepEqual(calls.spawn.args, ['-i']);
  assert.equal(calls.spawn.options.cwd, '/Users/tester');
  assert.equal(calls.spawn.options.cols, 120);
  assert.equal(calls.spawn.options.rows, 48);
  assert.ok(calls.statPath.endsWith(path.join('prebuilds', 'darwin-arm64', 'spawn-helper')));
  assert.deepEqual(calls.chmod, [calls.statPath, 0o755]);

  manager.resizePty('pane-1', 90, 30);
  manager.writeToPty('pane-1', 'echo ok\r');
  manager.destroyPty('pane-1');

  assert.deepEqual(calls.resize, [[90, 30]]);
  assert.deepEqual(calls.write, ['echo ok\r']);
  assert.equal(calls.kill, 1);
});
