const { spawn } = require('child_process');
const crypto = require('crypto');

/**
 * ClaudeRunner — manages Claude Code CLI sessions with structured JSON output.
 *
 * Uses -p (print) mode with session persistence.
 * Limits concurrent processes to avoid rate limit exhaustion.
 */

function createClaudeRunner({
  spawnImpl = spawn,
  claudeBin = 'claude',
  maxConcurrent = 5,
} = {}) {
  const knownSessions = new Set();
  const activeProcesses = new Map(); // sessionId → proc
  const waitQueue = [];              // queued exec requests

  function generateSessionId() {
    return crypto.randomUUID();
  }

  function _tryDequeue() {
    while (waitQueue.length > 0 && activeProcesses.size < maxConcurrent) {
      const next = waitQueue.shift();
      _spawn(next);
    }
  }

  function _spawn(request) {
    const { sessionId, prompt, workDir, model, permissionMode, effort, onData, onError, onClose } = request;

    const args = [];

    if (knownSessions.has(sessionId)) {
      args.push('-r', sessionId);
    } else {
      args.push('--session-id', sessionId);
    }

    if (model) args.push('--model', model);
    if (effort) args.push('--effort', effort);
    if (permissionMode) args.push('--permission-mode', permissionMode);

    args.push('--output-format', 'stream-json', '--verbose', '-p', prompt);

    const cwd = workDir || process.env.HOME || '/';

    let proc;
    try {
      proc = spawnImpl(claudeBin, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env },
      });
    } catch (err) {
      if (onError) onError(`Failed to spawn claude: ${err.message}`);
      if (onClose) onClose({ code: 1, signal: null });
      _tryDequeue();
      return;
    }

    activeProcesses.set(sessionId, proc);
    knownSessions.add(sessionId);

    let stdoutBuffer = '';

    proc.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          if (onData) onData(obj);
        } catch {
          if (onData) onData({ type: 'raw', text: trimmed });
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString().trim();
      if (text && onError) onError(text);
    });

    proc.on('close', (code, signal) => {
      activeProcesses.delete(sessionId);
      if (stdoutBuffer.trim()) {
        try {
          const obj = JSON.parse(stdoutBuffer.trim());
          if (onData) onData(obj);
        } catch {
          if (onData) onData({ type: 'raw', text: stdoutBuffer.trim() });
        }
      }
      if (onClose) onClose({ code, signal });
      _tryDequeue();
    });

    proc.on('error', (err) => {
      activeProcesses.delete(sessionId);
      if (onError) onError(`Process error: ${err.message}`);
      if (onClose) onClose({ code: 1, signal: null });
      _tryDequeue();
    });
  }

  function exec(request) {
    const { sessionId, prompt, onError, onClose, onData } = request;

    if (!sessionId || !prompt) {
      if (onError) onError('sessionId and prompt are required');
      if (onClose) onClose({ code: 1, signal: null });
      return { kill() {} };
    }

    // If this session already has a running process, queue it
    if (activeProcesses.has(sessionId)) {
      if (onError) onError('Session is busy — queued');
      if (onClose) onClose({ code: 1, signal: null });
      return { kill() {} };
    }

    // If at capacity, queue the request
    if (activeProcesses.size >= maxConcurrent) {
      waitQueue.push(request);
      if (onData) onData({ type: 'system', subtype: 'queued', message: `Queued (${waitQueue.length} waiting, ${activeProcesses.size} running)` });
      return {
        kill() {
          const idx = waitQueue.indexOf(request);
          if (idx >= 0) waitQueue.splice(idx, 1);
        },
      };
    }

    _spawn(request);

    return {
      kill() {
        const proc = activeProcesses.get(sessionId);
        if (proc && !proc.killed) {
          proc.kill('SIGTERM');
          setTimeout(() => { if (!proc.killed) proc.kill('SIGKILL'); }, 3000);
        }
        // Also remove from queue if queued
        const idx = waitQueue.findIndex(r => r.sessionId === sessionId);
        if (idx >= 0) waitQueue.splice(idx, 1);
      },
    };
  }

  function isActive(sessionId) {
    return activeProcesses.has(sessionId);
  }

  function killSession(sessionId) {
    const proc = activeProcesses.get(sessionId);
    if (proc && !proc.killed) proc.kill('SIGTERM');
    activeProcesses.delete(sessionId);
    // Remove from queue
    const idx = waitQueue.findIndex(r => r.sessionId === sessionId);
    if (idx >= 0) waitQueue.splice(idx, 1);
    _tryDequeue();
  }

  function killAll() {
    for (const [id] of activeProcesses) {
      killSession(id);
    }
    waitQueue.length = 0;
  }

  function getStatus() {
    return {
      active: activeProcesses.size,
      queued: waitQueue.length,
      maxConcurrent,
    };
  }

  return { exec, isActive, killSession, killAll, generateSessionId, getStatus };
}

const runner = createClaudeRunner();

module.exports = {
  ...runner,
  createClaudeRunner,
};
