#!/usr/bin/env tsx
/**
 * MES Migration Monitor - Local Web Dashboard
 * 
 * Provides a beautiful web UI to monitor and control the migration.
 * 
 * Usage:
 *   npx tsx scripts/mes-migration-monitor.ts
 *   
 * Then open: http://localhost:3847
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';

const PORT = 3847;
const ARTIFACTS_DIR = path.resolve(process.cwd(), 'artifacts');
const STATUS_FILE = path.join(ARTIFACTS_DIR, 'mes-migration-status.json');
const CHECKPOINT_FILE = path.join(ARTIFACTS_DIR, 'mes-migration-checkpoint.json');
const LOCK_FILE = path.join(ARTIFACTS_DIR, 'mes-migration.lock');
const LOG_FILE = path.join(ARTIFACTS_DIR, 'mes-migration.log');

let workerProcess: ChildProcess | null = null;

// Ensure artifacts directory exists
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

interface MigrationStatus {
  version: 1;
  state: 'idle' | 'running' | 'paused' | 'completed' | 'error';
  pid: number | null;
  started_at: string | null;
  last_heartbeat: string;
  current_course_id: number | null;
  current_course_name: string | null;
  total_courses: number;
  processed: number;
  successful: number;
  failed: number;
  groups_imported: number;
  items_imported: number;
  study_texts_imported: number;
  images_migrated: number;
  images_failed: number;
  eta_seconds: number | null;
  avg_course_time_ms: number | null;
  errors: Array<{ courseId: number; name: string; error: string; at: string }>;
  last_error: string | null;
}

function readStatus(): MigrationStatus | null {
  if (fs.existsSync(STATUS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    } catch { /* ignore */ }
  }
  return null;
}

function readCheckpoint(): any {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
    } catch { /* ignore */ }
  }
  return null;
}

function readLogs(lines = 50): string[] {
  if (fs.existsSync(LOG_FILE)) {
    try {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      return content.split('\n').slice(-lines).filter(l => l.trim());
    } catch { /* ignore */ }
  }
  return [];
}

function isWorkerRunning(): boolean {
  // Check lock file first
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      const age = Date.now() - new Date(lock.timestamp).getTime();
      if (age < 120000) return true; // 2 minutes
    } catch { /* ignore */ }
  }
  
  // Also check status file heartbeat as backup
  if (fs.existsSync(STATUS_FILE)) {
    try {
      const status = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
      if (status.state === 'running' && status.last_heartbeat) {
        const age = Date.now() - new Date(status.last_heartbeat).getTime();
        if (age < 120000) return true; // 2 minutes
      }
    } catch { /* ignore */ }
  }
  
  return false;
}

function startWorker(migrateImages = false): { success: boolean; message: string } {
  if (isWorkerRunning() || workerProcess) {
    return { success: false, message: 'Worker already running' };
  }

  const workerScript = path.join(process.cwd(), 'scripts', 'mes-migration-worker.ts');
  const args = ['tsx', workerScript];
  if (migrateImages) args.push('--migrate-images');

  try {
    workerProcess = spawn('npx', args, {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      shell: true,
    });

    workerProcess.stdout?.on('data', (data) => {
      const line = `[${new Date().toISOString()}] ${data.toString().trim()}`;
      fs.appendFileSync(LOG_FILE, line + '\n');
    });

    workerProcess.stderr?.on('data', (data) => {
      const line = `[${new Date().toISOString()}] ERROR: ${data.toString().trim()}`;
      fs.appendFileSync(LOG_FILE, line + '\n');
    });

    workerProcess.on('exit', (code) => {
      const line = `[${new Date().toISOString()}] Worker exited with code ${code}`;
      fs.appendFileSync(LOG_FILE, line + '\n');
      workerProcess = null;
    });

    return { success: true, message: `Worker started (PID: ${workerProcess.pid})` };
  } catch (err) {
    return { success: false, message: `Failed to start: ${err}` };
  }
}

function stopWorker(): { success: boolean; message: string } {
  if (workerProcess) {
    try {
      workerProcess.kill('SIGTERM');
      workerProcess = null;
      if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
      return { success: true, message: 'Worker stopped' };
    } catch (err) {
      return { success: false, message: `Failed to stop: ${err}` };
    }
  }
  
  // Try to kill by lock file PID
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const lock = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      process.kill(lock.pid, 'SIGTERM');
      fs.unlinkSync(LOCK_FILE);
      return { success: true, message: 'Worker stopped' };
    } catch { /* ignore */ }
  }
  
  return { success: false, message: 'No worker running' };
}

function resetMigration(): { success: boolean; message: string } {
  stopWorker();
  try {
    if (fs.existsSync(STATUS_FILE)) fs.unlinkSync(STATUS_FILE);
    if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
    if (fs.existsSync(LOG_FILE)) fs.unlinkSync(LOG_FILE);
    return { success: true, message: 'Migration reset' };
  } catch (err) {
    return { success: false, message: `Failed to reset: ${err}` };
  }
}

function pauseMigration(): { success: boolean; message: string } {
  // Stop the worker but keep checkpoint
  const result = stopWorker();
  if (result.success) {
    // Update status to paused
    const status = readStatus();
    if (status) {
      status.state = 'paused';
      fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));
    }
    return { success: true, message: 'Migration paused. Use Resume to continue.' };
  }
  return result;
}

function resumeMigration(migrateImages = false): { success: boolean; message: string } {
  const checkpoint = readCheckpoint();
  if (!checkpoint) {
    return { success: false, message: 'No checkpoint found. Use Start instead.' };
  }
  if (isWorkerRunning() || workerProcess) {
    return { success: false, message: 'Worker already running' };
  }
  return startWorker(migrateImages);
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MES Migration Monitor</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');
    
    :root {
      --bg-dark: #0a0a0f;
      --bg-card: #12121a;
      --bg-card-hover: #1a1a25;
      --border: #2a2a3a;
      --text: #e0e0e8;
      --text-dim: #8888a0;
      --accent: #00d4aa;
      --accent-glow: rgba(0, 212, 170, 0.3);
      --success: #22c55e;
      --warning: #f59e0b;
      --error: #ef4444;
      --info: #3b82f6;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-dark);
      color: var(--text);
      min-height: 100vh;
      background-image: 
        radial-gradient(ellipse at 20% 0%, rgba(0, 212, 170, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 100%, rgba(59, 130, 246, 0.08) 0%, transparent 50%);
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }
    
    header {
      text-align: center;
      margin-bottom: 2rem;
    }
    
    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      background: linear-gradient(135deg, var(--accent), var(--info));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 0.5rem;
    }
    
    .subtitle {
      color: var(--text-dim);
      font-size: 1rem;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 1.5rem;
      transition: all 0.3s ease;
    }
    
    .card:hover {
      background: var(--bg-card-hover);
      border-color: var(--accent);
      box-shadow: 0 0 30px var(--accent-glow);
    }
    
    .card-title {
      font-size: 0.9rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 1rem;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border-radius: 999px;
      font-weight: 600;
      font-size: 0.9rem;
      text-transform: uppercase;
    }
    
    .status-idle { background: rgba(136, 136, 160, 0.2); color: var(--text-dim); }
    .status-running { background: rgba(34, 197, 94, 0.2); color: var(--success); }
    .status-paused { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
    .status-completed { background: rgba(59, 130, 246, 0.2); color: var(--info); }
    .status-error { background: rgba(239, 68, 68, 0.2); color: var(--error); }
    .status-hung { background: rgba(239, 68, 68, 0.2); color: var(--error); }
    
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: currentColor;
    }
    
    .status-running .status-dot {
      animation: pulse 1.5s ease-in-out infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.2); }
    }
    
    .progress-container {
      margin: 1.5rem 0;
    }
    
    .progress-bar {
      height: 24px;
      background: var(--border);
      border-radius: 12px;
      overflow: hidden;
      position: relative;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--info));
      border-radius: 12px;
      transition: width 0.5s ease;
      position: relative;
    }
    
    .progress-fill::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
      animation: shimmer 2s infinite;
    }
    
    @keyframes shimmer {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(100%); }
    }
    
    .progress-text {
      display: flex;
      justify-content: space-between;
      margin-top: 0.5rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.9rem;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
    }
    
    .stats-grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.75rem;
    }
    
    .stat-item {
      text-align: center;
      padding: 0.75rem;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 12px;
    }
    
    .stat-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--accent);
    }
    
    .stat-label {
      font-size: 0.75rem;
      color: var(--text-dim);
      margin-top: 0.25rem;
    }
    
    .time-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }
    
    .time-item {
      text-align: center;
      padding: 0.75rem;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
    }
    
    .time-label {
      font-size: 0.7rem;
      color: var(--text-dim);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .time-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--accent);
      margin-top: 0.25rem;
    }
    
    .recent-list {
      max-height: 200px;
      overflow-y: auto;
    }
    
    .recent-item {
      padding: 0.5rem 0.75rem;
      background: rgba(34, 197, 94, 0.1);
      border-left: 3px solid var(--success);
      border-radius: 0 8px 8px 0;
      margin-bottom: 0.4rem;
      font-size: 0.8rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .recent-id {
      font-family: 'JetBrains Mono', monospace;
      color: var(--success);
      font-weight: 600;
    }
    
    .recent-name {
      color: var(--text);
      flex: 1;
      margin-left: 0.5rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .recent-time {
      color: var(--text-dim);
      font-size: 0.7rem;
      margin-left: 0.5rem;
    }
    
    .controls {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      justify-content: center;
      margin: 2rem 0;
    }
    
    button {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1rem;
      font-weight: 600;
      padding: 0.75rem 2rem;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .btn-start {
      background: linear-gradient(135deg, var(--success), #16a34a);
      color: white;
    }
    
    .btn-start:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(34, 197, 94, 0.3);
    }
    
    .btn-stop {
      background: linear-gradient(135deg, var(--error), #dc2626);
      color: white;
    }
    
    .btn-stop:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(239, 68, 68, 0.3);
    }
    
    .btn-reset {
      background: var(--border);
      color: var(--text);
    }
    
    .btn-reset:hover {
      background: var(--bg-card-hover);
      transform: translateY(-2px);
    }
    
    .btn-images {
      background: linear-gradient(135deg, var(--info), #2563eb);
      color: white;
    }
    
    .btn-images:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(59, 130, 246, 0.3);
    }
    
    .btn-resume {
      background: linear-gradient(135deg, var(--warning), #d97706);
      color: white;
    }
    
    .btn-resume:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(245, 158, 11, 0.3);
    }
    
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none !important;
    }
    
    .logs {
      background: #0d0d12;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem;
      max-height: 300px;
      overflow-y: auto;
      color: var(--text-dim);
    }
    
    .log-line {
      padding: 0.25rem 0;
      border-bottom: 1px solid rgba(42, 42, 58, 0.5);
    }
    
    .log-line:last-child {
      border-bottom: none;
    }
    
    .error-list {
      max-height: 200px;
      overflow-y: auto;
    }
    
    .error-item {
      padding: 0.75rem;
      background: rgba(239, 68, 68, 0.1);
      border-left: 3px solid var(--error);
      border-radius: 0 8px 8px 0;
      margin-bottom: 0.5rem;
      font-size: 0.85rem;
    }
    
    .error-course {
      font-weight: 600;
      color: var(--error);
    }
    
    .current-course {
      font-family: 'JetBrains Mono', monospace;
      padding: 1rem;
      background: rgba(0, 212, 170, 0.1);
      border-radius: 8px;
      text-align: center;
    }
    
    .current-id {
      color: var(--accent);
      font-weight: 600;
    }
    
    .eta {
      font-family: 'JetBrains Mono', monospace;
      font-size: 1.5rem;
      color: var(--accent);
      text-align: center;
      margin-top: 1rem;
    }
    
    .toast {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      color: white;
      font-weight: 500;
      animation: slideIn 0.3s ease;
      z-index: 1000;
    }
    
    .toast-success { background: var(--success); }
    .toast-error { background: var(--error); }
    
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      cursor: pointer;
      font-size: 0.9rem;
      color: var(--text-dim);
    }
    
    .checkbox-label input {
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🚀 MES Migration Monitor</h1>
      <p class="subtitle">ExpertCollege Content → LearnPlay</p>
    </header>
    
    <div class="grid">
      <div class="card">
        <div class="card-title">Status</div>
        <div id="status-badge" class="status-badge status-idle">
          <span class="status-dot"></span>
          <span id="status-text">IDLE</span>
        </div>
        <div id="current-course" class="current-course" style="margin-top: 1rem; display: none;">
          Processing: <span class="current-id" id="current-id"></span>
          <div id="current-name" style="font-size: 0.85rem; color: var(--text-dim);"></div>
        </div>
      </div>
      
      <div class="card">
        <div class="card-title">Progress</div>
        <div class="progress-container">
          <div class="progress-bar">
            <div id="progress-fill" class="progress-fill" style="width: 0%"></div>
          </div>
          <div class="progress-text">
            <span id="progress-percent">0%</span>
            <span><span id="processed">0</span> / <span id="total">0</span> courses</span>
          </div>
        </div>
      </div>
      
      <div class="card">
        <div class="card-title">⏱️ Time</div>
        <div class="time-grid">
          <div class="time-item">
            <div class="time-label">Elapsed</div>
            <div class="time-value" id="elapsed">--:--:--</div>
          </div>
          <div class="time-item">
            <div class="time-label">Remaining</div>
            <div class="time-value" id="remaining">--:--:--</div>
          </div>
          <div class="time-item">
            <div class="time-label">ETA</div>
            <div class="time-value" id="eta-time">--:--</div>
          </div>
          <div class="time-item">
            <div class="time-label">Speed</div>
            <div class="time-value" id="speed">-- c/hr</div>
          </div>
        </div>
      </div>
    </div>
    
    <div class="grid">
      <div class="card">
        <div class="card-title">📊 Content Synced</div>
        <div class="stats-grid-3">
          <div class="stat-item">
            <div class="stat-value" id="successful">0</div>
            <div class="stat-label">✅ Courses</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="failed" style="color: var(--error);">0</div>
            <div class="stat-label">❌ Failed</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="groups">0</div>
            <div class="stat-label">📁 Groups</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="items">0</div>
            <div class="stat-label">📝 Exercises</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="texts">0</div>
            <div class="stat-label">📖 Study Texts</div>
          </div>
          <div class="stat-item">
            <div class="stat-value" id="images">0</div>
            <div class="stat-label">🖼️ Images</div>
          </div>
        </div>
      </div>
      
      <div class="card">
        <div class="card-title">✅ Recently Synced</div>
        <div id="recent-synced" class="recent-list">
          <div style="color: var(--text-dim); text-align: center; padding: 1rem;">No courses synced yet</div>
        </div>
      </div>
      
      <div class="card">
        <div class="card-title">⚠️ Recent Errors</div>
        <div id="errors" class="error-list">
          <div style="color: var(--text-dim); text-align: center; padding: 1rem;">No errors</div>
        </div>
      </div>
    </div>
    
    <div class="controls">
      <button id="btn-start" class="btn-start">
        <span>▶</span> Start
      </button>
      <button id="btn-start-images" class="btn-images">
        <span>🖼</span> Start + Images
      </button>
      <button id="btn-pause" class="btn-stop" disabled>
        <span>⏸</span> Pause
      </button>
      <button id="btn-resume" class="btn-resume" disabled>
        <span>↻</span> Resume
      </button>
      <button id="btn-reset" class="btn-reset">
        <span>🗑</span> Reset
      </button>
    </div>
    
    <div class="card">
      <div class="card-title">Live Logs</div>
      <div id="logs" class="logs">
        <div style="color: var(--text-dim);">Waiting for logs...</div>
      </div>
    </div>
  </div>
  
  <div id="toast" class="toast" style="display: none;"></div>
  
  <script>
    const elements = {
      statusBadge: document.getElementById('status-badge'),
      statusText: document.getElementById('status-text'),
      progressFill: document.getElementById('progress-fill'),
      progressPercent: document.getElementById('progress-percent'),
      processed: document.getElementById('processed'),
      total: document.getElementById('total'),
      successful: document.getElementById('successful'),
      failed: document.getElementById('failed'),
      groups: document.getElementById('groups'),
      items: document.getElementById('items'),
      texts: document.getElementById('texts'),
      images: document.getElementById('images'),
      currentCourse: document.getElementById('current-course'),
      currentId: document.getElementById('current-id'),
      currentName: document.getElementById('current-name'),
      elapsed: document.getElementById('elapsed'),
      remaining: document.getElementById('remaining'),
      etaTime: document.getElementById('eta-time'),
      speed: document.getElementById('speed'),
      recentSynced: document.getElementById('recent-synced'),
      errors: document.getElementById('errors'),
      logs: document.getElementById('logs'),
      btnStart: document.getElementById('btn-start'),
      btnStartImages: document.getElementById('btn-start-images'),
      btnPause: document.getElementById('btn-pause'),
      btnResume: document.getElementById('btn-resume'),
      btnReset: document.getElementById('btn-reset'),
      toast: document.getElementById('toast'),
    };
    
    function showToast(message, type = 'success') {
      elements.toast.textContent = message;
      elements.toast.className = 'toast toast-' + type;
      elements.toast.style.display = 'block';
      setTimeout(() => { elements.toast.style.display = 'none'; }, 3000);
    }
    
    function formatDuration(seconds) {
      if (!seconds) return '--:--:--';
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = seconds % 60;
      return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
    }
    
    async function fetchStatus() {
      try {
        const res = await fetch('/api/status');
        const data = await res.json();
        updateUI(data);
      } catch (err) {
        console.error('Failed to fetch status:', err);
      }
    }
    
    function updateUI(data) {
      const status = data.status;
      const isRunning = data.isRunning;
      
      // Status badge
      let state = status?.state || 'idle';
      if (state === 'running' && !isRunning) state = 'hung';
      
      elements.statusBadge.className = 'status-badge status-' + state;
      elements.statusText.textContent = state.toUpperCase();
      
      // Progress
      const progress = status?.total_courses > 0 
        ? Math.round((status.processed / status.total_courses) * 100) 
        : 0;
      elements.progressFill.style.width = progress + '%';
      elements.progressPercent.textContent = progress + '%';
      elements.processed.textContent = status?.processed || 0;
      elements.total.textContent = status?.total_courses || 0;
      
      // Stats
      elements.successful.textContent = status?.successful || 0;
      elements.failed.textContent = status?.failed || 0;
      elements.groups.textContent = status?.groups_imported || 0;
      elements.items.textContent = status?.items_imported || 0;
      elements.texts.textContent = status?.study_texts_imported || 0;
      elements.images.textContent = status?.images_migrated || 0;
      
      // Current course
      if (status?.current_course_id && state === 'running') {
        elements.currentCourse.style.display = 'block';
        elements.currentId.textContent = '#' + status.current_course_id;
        elements.currentName.textContent = status.current_course_name || '';
      } else {
        elements.currentCourse.style.display = 'none';
      }
      
      // Time calculations
      if (status?.started_at) {
        const startTime = new Date(status.started_at).getTime();
        const now = Date.now();
        const elapsedMs = now - startTime;
        elements.elapsed.textContent = formatDuration(Math.floor(elapsedMs / 1000));
        
        // Calculate remaining time based on average
        if (status.processed > 0 && status.total_courses > status.processed) {
          const avgTimePerCourse = elapsedMs / status.processed;
          const remainingCourses = status.total_courses - status.processed;
          const remainingMs = avgTimePerCourse * remainingCourses;
          elements.remaining.textContent = formatDuration(Math.floor(remainingMs / 1000));
          
          // ETA (completion time)
          const etaDate = new Date(now + remainingMs);
          elements.etaTime.textContent = etaDate.toLocaleTimeString('en-US', { 
            hour: '2-digit', minute: '2-digit' 
          });
          
          // Speed (courses per hour)
          const coursesPerHour = (status.processed / (elapsedMs / 3600000)).toFixed(1);
          elements.speed.textContent = coursesPerHour + ' c/hr';
        } else {
          elements.remaining.textContent = '--:--:--';
          elements.etaTime.textContent = '--:--';
          elements.speed.textContent = '-- c/hr';
        }
      } else {
        elements.elapsed.textContent = '--:--:--';
        elements.remaining.textContent = '--:--:--';
        elements.etaTime.textContent = '--:--';
        elements.speed.textContent = '-- c/hr';
      }
      
      // Recently synced courses
      if (data.recentCourses?.length > 0) {
        elements.recentSynced.innerHTML = data.recentCourses.slice(0, 8).map(c => 
          '<div class="recent-item">' +
            '<span class="recent-id">#' + c.id + '</span>' +
            '<span class="recent-name">' + (c.name || '').slice(0, 30) + '</span>' +
            '<span class="recent-time">' + c.time + '</span>' +
          '</div>'
        ).join('');
      } else if (status?.successful > 0) {
        elements.recentSynced.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 1rem;">' + 
          status.successful + ' courses synced</div>';
      } else {
        elements.recentSynced.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 1rem;">No courses synced yet</div>';
      }
      
      // Errors
      if (status?.errors?.length > 0) {
        elements.errors.innerHTML = status.errors.slice(-8).reverse().map(e => 
          '<div class="error-item"><span class="error-course">[' + e.courseId + ']</span> ' + 
          (e.error || '').slice(0, 80) + '</div>'
        ).join('');
      } else {
        elements.errors.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 1rem;">No errors</div>';
      }
      
      // Logs
      if (data.logs?.length > 0) {
        elements.logs.innerHTML = data.logs.map(l => 
          '<div class="log-line">' + escapeHtml(l) + '</div>'
        ).join('');
        elements.logs.scrollTop = elements.logs.scrollHeight;
      }
      
      // Buttons
      const isPaused = state === 'paused';
      const hasCheckpoint = data.hasCheckpoint || status?.processed > 0;
      
      elements.btnStart.disabled = isRunning;
      elements.btnStartImages.disabled = isRunning;
      elements.btnPause.disabled = !isRunning;
      elements.btnResume.disabled = isRunning || (!isPaused && !hasCheckpoint);
    }
    
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    async function apiCall(action, body = {}) {
      try {
        const res = await fetch('/api/' + action, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        showToast(data.message, data.success ? 'success' : 'error');
        fetchStatus();
      } catch (err) {
        showToast('Request failed: ' + err, 'error');
      }
    }
    
    elements.btnStart.onclick = () => apiCall('start');
    elements.btnStartImages.onclick = () => apiCall('start', { migrateImages: true });
    elements.btnPause.onclick = () => apiCall('pause');
    elements.btnResume.onclick = () => apiCall('resume');
    elements.btnReset.onclick = () => {
      if (confirm('Reset all migration progress?')) {
        apiCall('reset');
      }
    };
    
    // Initial fetch and polling
    fetchStatus();
    setInterval(fetchStatus, 2000);
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  
  // API endpoints
  if (url.pathname === '/api/status') {
    const status = readStatus();
    const logs = readLogs(30);
    const running = isWorkerRunning() || workerProcess !== null;
    const checkpoint = readCheckpoint();
    
    // Extract recently synced courses from logs
    const recentCourses: Array<{id: string; name: string; time: string}> = [];
    for (const log of logs.slice().reverse()) {
      const match = log.match(/✅.*?#(\d+)\s*[-–]\s*(.+?)(?:\s+\(|$)/);
      if (match) {
        const timeMatch = log.match(/\[([^\]]+)\]/);
        recentCourses.push({
          id: match[1],
          name: match[2].trim(),
          time: timeMatch ? new Date(timeMatch[1]).toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'}) : ''
        });
        if (recentCourses.length >= 10) break;
      }
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status, 
      logs, 
      isRunning: running,
      hasCheckpoint: checkpoint !== null,
      recentCourses
    }));
    return;
  }
  
  if (url.pathname === '/api/start' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let migrateImages = false;
      try {
        const parsed = JSON.parse(body);
        migrateImages = parsed.migrateImages === true;
      } catch { /* ignore */ }
      
      const result = startWorker(migrateImages);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }
  
  if (url.pathname === '/api/stop' && req.method === 'POST') {
    const result = stopWorker();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }
  
  if (url.pathname === '/api/reset' && req.method === 'POST') {
    const result = resetMigration();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }
  
  if (url.pathname === '/api/pause' && req.method === 'POST') {
    const result = pauseMigration();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }
  
  if (url.pathname === '/api/resume' && req.method === 'POST') {
    let migrateImages = false;
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        migrateImages = parsed.migrateImages === true;
      } catch { /* ignore */ }
      
      const result = resumeMigration(migrateImages);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    });
    return;
  }
  
  // Serve HTML
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(HTML);
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         MES MIGRATION MONITOR                            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  🌐 Open in browser: http://localhost:${PORT}`);
  console.log('');
  console.log('  Features:');
  console.log('    • Real-time progress tracking');
  console.log('    • Start/Stop/Reset buttons');
  console.log('    • Live log viewer');
  console.log('    • Error tracking');
  console.log('');
  console.log('  Press Ctrl+C to stop the monitor');
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n  Shutting down monitor...');
  if (workerProcess) {
    console.log('  Note: Migration worker is still running in background');
  }
  server.close();
  process.exit(0);
});

