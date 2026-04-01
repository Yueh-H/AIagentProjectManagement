const fs = require('fs');
const path = require('path');
const pty = require('node-pty');
const os = require('os');

function createPtyManager({
  fsImpl = fs,
  pathImpl = path,
  ptyImpl = pty,
  osImpl = os,
  processImpl = process,
  resolveImpl = require.resolve,
  warnImpl = console.warn,
} = {}) {
  const ptys = new Map();

  function ensureSpawnHelperExecutable() {
    if (processImpl.platform === 'win32') return;

    const packageRoot = pathImpl.dirname(resolveImpl('node-pty/package.json'));
    const helperPath = pathImpl.join(packageRoot, 'prebuilds', `${processImpl.platform}-${processImpl.arch}`, 'spawn-helper');

    try {
      const stats = fsImpl.statSync(helperPath);

      if ((stats.mode & 0o111) !== 0o111) {
        fsImpl.chmodSync(helperPath, stats.mode | 0o755);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        warnImpl(`Failed to prepare node-pty spawn helper: ${error.message}`);
      }
    }
  }

  function createPty(paneId, cols, rows) {
    ensureSpawnHelperExecutable();

    const isWindows = osImpl.platform() === 'win32';
    const shell = processImpl.env.SHELL || (isWindows ? 'powershell.exe' : '/bin/zsh');
    const args = isWindows ? [] : ['-i'];
    const ptyProcess = ptyImpl.spawn(shell, args, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: processImpl.env.HOME,
      env: processImpl.env,
    });
    ptys.set(paneId, ptyProcess);
    return ptyProcess;
  }

  function resizePty(paneId, cols, rows) {
    const p = ptys.get(paneId);
    if (p) {
      try { p.resize(cols, rows); } catch (e) { /* pane may have exited */ }
    }
  }

  function writeToPty(paneId, data) {
    const p = ptys.get(paneId);
    if (p) p.write(data);
  }

  function destroyPty(paneId) {
    const p = ptys.get(paneId);
    if (p) {
      try { p.kill(); } catch (e) { /* already dead */ }
      ptys.delete(paneId);
    }
  }

  function destroyAll() {
    for (const [id] of ptys) {
      destroyPty(id);
    }
  }

  return { createPty, resizePty, writeToPty, destroyPty, destroyAll };
}

const manager = createPtyManager();

module.exports = {
  ...manager,
  createPtyManager,
};
