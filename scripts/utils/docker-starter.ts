/**
 * Docker Desktop Auto-Starter for Windows (TypeScript version)
 * 
 * Automatically detects if Docker Desktop is running and starts it if needed.
 * Works on Windows, macOS, and Linux.
 */

import { spawnSync, execSync } from 'child_process';
import { existsSync } from 'fs';

const DOCKER_STARTUP_TIMEOUT_MS = 120000; // 2 minutes
const DOCKER_CHECK_INTERVAL_MS = 2000; // 2 seconds

/**
 * Check if Docker daemon is running
 */
export function isDockerRunning(): boolean {
  try {
    execSync('docker ps', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker Desktop process is running (Windows)
 */
function isDockerDesktopProcessRunning(): boolean {
  if (process.platform !== 'win32') return false;
  
  try {
    const result = spawnSync('powershell', [
      '-Command',
      'Get-Process "Docker Desktop" -ErrorAction SilentlyContinue | Select-Object -First 1'
    ], { encoding: 'utf8' });
    
    return result.stdout && result.stdout.includes('Docker Desktop');
  } catch {
    return false;
  }
}

/**
 * Find Docker Desktop executable path
 */
function findDockerDesktopPath(): string | null {
  const possiblePaths = [
    'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe',
    `${process.env.PROGRAMFILES}\\Docker\\Docker\\Docker Desktop.exe`,
    `${process.env.LOCALAPPDATA}\\Docker\\Docker Desktop.exe`,
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Start Docker Desktop on Windows
 */
function startDockerDesktopWindows(): boolean {
  console.log('[docker-starter] Starting Docker Desktop...');
  
  const dockerPath = findDockerDesktopPath();
  if (!dockerPath) {
    console.error('[docker-starter] ❌ Docker Desktop executable not found.');
    console.error('   Expected at: C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe');
    return false;
  }

  try {
    // Start Docker Desktop using PowerShell Start-Process (handles paths with spaces correctly)
    const result = spawnSync('powershell', [
      '-Command',
      `Start-Process -FilePath "${dockerPath}"`
    ], {
      stdio: 'pipe',
      shell: false,
    });
    
    if (result.status !== 0) {
      const stderr = (result.stderr || '').toString();
      console.error('[docker-starter] Failed to start Docker Desktop:', stderr);
      return false;
    }
    
    console.log('[docker-starter] Docker Desktop starting... (this may take 1-2 minutes)');
    return true;
  } catch (error: any) {
    console.error('[docker-starter] Failed to start Docker Desktop:', error.message);
    return false;
  }
}

/**
 * Start Docker Desktop on macOS
 */
function startDockerDesktopMac(): boolean {
  console.log('[docker-starter] Starting Docker Desktop...');
  
  try {
    spawnSync('open', ['-a', 'Docker'], {
      detached: true,
      stdio: 'ignore',
    });
    
    console.log('[docker-starter] Docker Desktop starting... (this may take 1-2 minutes)');
    return true;
  } catch (error: any) {
    console.error('[docker-starter] Failed to start Docker Desktop:', error.message);
    return false;
  }
}

/**
 * Wait for Docker daemon to become available
 */
async function waitForDocker(timeoutMs: number): Promise<boolean> {
  const startTime = Date.now();
  let attempts = 0;
  
  while (Date.now() - startTime < timeoutMs) {
    attempts++;
    
    if (isDockerRunning()) {
      console.log(`[docker-starter] ✅ Docker daemon is ready! (took ${attempts * DOCKER_CHECK_INTERVAL_MS / 1000}s)`);
      return true;
    }
    
    // Show progress every 10 seconds
    if (attempts % 5 === 0) {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`[docker-starter] Still waiting for Docker daemon... (${elapsed}s elapsed)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, DOCKER_CHECK_INTERVAL_MS));
  }
  
  return false;
}

export interface EnsureDockerOptions {
  autoStart?: boolean;
  silent?: boolean;
}

/**
 * Ensure Docker Desktop is running, starting it automatically if needed
 */
export async function ensureDockerRunning(options: EnsureDockerOptions = {}): Promise<boolean> {
  const { autoStart = true, silent = false } = options;
  
  // First check if already running
  if (isDockerRunning()) {
    if (!silent) {
      console.log('[docker-starter] ✅ Docker daemon is already running');
    }
    return true;
  }

  if (!silent) {
    console.log('[docker-starter] Docker daemon is not running');
  }

  if (!autoStart) {
    return false;
  }

  // Check platform support
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    console.error('[docker-starter] ❌ Auto-start only supported on Windows and macOS');
    console.error('   On Linux, please start Docker manually: sudo systemctl start docker');
    return false;
  }

  // Check if Docker Desktop process is already running but daemon isn't ready yet
  if (process.platform === 'win32' && isDockerDesktopProcessRunning()) {
    if (!silent) {
      console.log('[docker-starter] Docker Desktop process detected, waiting for daemon...');
    }
    return await waitForDocker(DOCKER_STARTUP_TIMEOUT_MS);
  }

  // Start Docker Desktop
  let started = false;
  if (process.platform === 'win32') {
    started = startDockerDesktopWindows();
  } else if (process.platform === 'darwin') {
    started = startDockerDesktopMac();
  }

  if (!started) {
    return false;
  }

  // Wait for Docker daemon to become available
  const ready = await waitForDocker(DOCKER_STARTUP_TIMEOUT_MS);
  
  if (!ready) {
    console.error('[docker-starter] ❌ Docker daemon did not start within timeout');
    console.error('   Please start Docker Desktop manually and try again');
    return false;
  }

  return true;
}

