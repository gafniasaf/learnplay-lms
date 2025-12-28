#!/usr/bin/env node
/**
 * Manual test script for Docker auto-start functionality
 * 
 * This script tests the Docker auto-start feature by:
 * 1. Checking current Docker status
 * 2. Testing the auto-start functionality
 * 3. Verifying Docker becomes ready
 * 
 * Usage: node scripts/test-docker-auto-start.mjs
 */

import { ensureDockerRunning, isDockerRunning } from './utils/docker-starter.mjs';

const COLORS = {
  RESET: '\x1b[0m',
  BRIGHT: '\x1b[1m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  CYAN: '\x1b[36m',
};

function log(message, color = COLORS.RESET) {
  console.log(`${color}${message}${COLORS.RESET}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(` ${title}`, COLORS.BRIGHT + COLORS.CYAN);
  console.log('='.repeat(60) + '\n');
}

async function runTests() {
  log('🐳 Docker Auto-Start Test Suite', COLORS.BRIGHT + COLORS.CYAN);
  log('Testing Docker auto-start functionality...\n', COLORS.CYAN);

  // Test 1: Check current status
  section('Test 1: Check Current Docker Status');
  const initialStatus = isDockerRunning();
  if (initialStatus) {
    log('✅ Docker is currently running', COLORS.GREEN);
  } else {
    log('❌ Docker is NOT currently running', COLORS.YELLOW);
    log('   This is expected if you manually stopped Docker for testing', COLORS.YELLOW);
  }

  // Test 2: Test isDockerRunning function
  section('Test 2: Test isDockerRunning() Function');
  try {
    const status = isDockerRunning();
    log(`✅ isDockerRunning() returned: ${status}`, COLORS.GREEN);
  } catch (error) {
    log(`❌ isDockerRunning() failed: ${error.message}`, COLORS.RED);
  }

  // Test 3: Test ensureDockerRunning with autoStart disabled
  section('Test 3: Test ensureDockerRunning() - Check Only');
  try {
    const ready = await ensureDockerRunning({ autoStart: false, silent: false });
    if (ready) {
      log('✅ Docker is ready (no auto-start needed)', COLORS.GREEN);
    } else {
      log('⚠️  Docker is not ready (auto-start was disabled)', COLORS.YELLOW);
    }
  } catch (error) {
    log(`❌ ensureDockerRunning() failed: ${error.message}`, COLORS.RED);
  }

  // Test 4: Test ensureDockerRunning with autoStart enabled
  section('Test 4: Test ensureDockerRunning() - Auto-Start Enabled');
  log('This will auto-start Docker if it\'s not running...', COLORS.CYAN);
  try {
    const ready = await ensureDockerRunning({ autoStart: true, silent: false });
    if (ready) {
      log('✅ Docker is ready!', COLORS.GREEN);
    } else {
      log('❌ Docker could not be started', COLORS.RED);
    }
  } catch (error) {
    log(`❌ ensureDockerRunning() failed: ${error.message}`, COLORS.RED);
  }

  // Test 5: Verify Docker is actually running
  section('Test 5: Verify Docker Daemon');
  const finalStatus = isDockerRunning();
  if (finalStatus) {
    log('✅ Docker daemon is confirmed running', COLORS.GREEN);
  } else {
    log('❌ Docker daemon is NOT running', COLORS.RED);
  }

  // Test 6: Test silent mode
  section('Test 6: Test Silent Mode');
  try {
    log('Testing silent mode (should see minimal output)...', COLORS.CYAN);
    const ready = await ensureDockerRunning({ autoStart: true, silent: true });
    log(`✅ Silent mode completed: ${ready}`, COLORS.GREEN);
  } catch (error) {
    log(`❌ Silent mode failed: ${error.message}`, COLORS.RED);
  }

  // Summary
  section('Test Summary');
  const finalCheck = isDockerRunning();
  if (finalCheck) {
    log('✅ ALL TESTS PASSED - Docker is running', COLORS.BRIGHT + COLORS.GREEN);
    log('\nDocker auto-start functionality is working correctly!', COLORS.GREEN);
  } else {
    log('❌ TESTS FAILED - Docker is not running', COLORS.BRIGHT + COLORS.RED);
    log('\nPlease check the errors above for details.', COLORS.RED);
  }

  // Platform info
  console.log('\n' + '─'.repeat(60));
  log('Platform Information:', COLORS.CYAN);
  log(`  OS: ${process.platform}`, COLORS.RESET);
  log(`  Node: ${process.version}`, COLORS.RESET);
  log(`  Arch: ${process.arch}`, COLORS.RESET);
  console.log('─'.repeat(60) + '\n');
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Test suite failed: ${error.message}`, COLORS.RED);
  console.error(error);
  process.exit(1);
});

