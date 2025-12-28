
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { ensureDockerRunning } from './utils/docker-starter.js';

// --- Colors for Console Output ---
const RESET = "\x1b[0m";
const BRIGHT = "\x1b[1m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";

function log(message: string, color: string = RESET) {
  console.log(`${color}${message}${RESET}`);
}

function success(message: string) {
  log(`✅ ${message}`, GREEN);
}

function warn(message: string) {
  log(`⚠️  ${message}`, YELLOW);
}

function error(message: string) {
  log(`❌ ${message}`, RED);
}

function section(title: string) {
  console.log('\n' + '='.repeat(50));
  log(` ${title}`, BRIGHT + CYAN);
  console.log('='.repeat(50) + '\n');
}

// --- Helper Functions ---

function checkCommand(command: string): boolean {
  try {
    execSync(process.platform === 'win32' ? `where ${command}` : `which ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => rl.question(`${BRIGHT}${query} ${RESET}`, ans => {
    rl.close();
    resolve(ans.trim());
  }));
}

function runCmd(command: string, args: string[], cwd: string = process.cwd(), ignoreError = false): boolean {
  log(`> ${command} ${args.join(' ')}`, "\x1b[2m");
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true, cwd });
  if (result.status !== 0 && !ignoreError) {
    error(`Command failed with exit code ${result.status}`);
    return false;
  }
  return true;
}

// --- Steps ---

async function checkPrerequisites() {
  section("1. Checking Prerequisites");

  // Node.js
  const nodeVersion = process.version;
  if (parseInt(nodeVersion.slice(1).split('.')[0]) < 18) {
    error(`Node.js version ${nodeVersion} is too old. Please install Node.js 18+`);
    process.exit(1);
  }
  success(`Node.js ${nodeVersion} detected`);

  // Docker
  if (!checkCommand('docker')) {
    error("Docker is not installed or not in PATH.");
    log("Please install Docker Desktop: https://www.docker.com/products/docker-desktop/");
    process.exit(1);
  }
  
  // Check if docker daemon is running, auto-start if needed
  const dockerReady = await ensureDockerRunning({ autoStart: true, silent: false });
  if (!dockerReady) {
    error("Docker daemon could not be started.");
    process.exit(1);
  }
  success("Docker is running");

  // Supabase CLI
  if (!checkCommand('supabase')) {
    warn("Supabase CLI not found.");
    const install = await askQuestion("Do you want to try installing it via npm? (y/n) ");
    if (install.toLowerCase() === 'y') {
        runCmd('npm', ['install', '-g', 'supabase']);
        if(!checkCommand('supabase')) {
             error("Failed to install Supabase CLI automatically. Please install manually: https://supabase.com/docs/guides/cli");
             process.exit(1);
        }
    } else {
      error("Supabase CLI is required. Please install: https://supabase.com/docs/guides/cli");
      process.exit(1);
    }
  }
  success("Supabase CLI detected");
}

async function setupSupabase() {
  section("2. Supabase Setup");

  if (fs.existsSync('supabase/config.toml')) {
    success("Supabase project already initialized (config.toml found).");
  } else {
    warn("No Supabase project found locally.");
    runCmd('supabase', ['init']);
  }

  const login = await askQuestion("Have you logged in to Supabase CLI yet? (y/n) ");
  if (login.toLowerCase() !== 'y') {
    log("Please log in now. A browser window will open.");
    runCmd('supabase', ['login']);
  }

  const connect = await askQuestion("Do you want to link a remote Supabase project? (Required for deployment, optional for local dev) (y/n) ");
  if (connect.toLowerCase() === 'y') {
    const projectId = await askQuestion("Enter your Supabase Project ID: ");
    const password = await askQuestion("Enter your Database Password: ");
    runCmd('supabase', ['link', '--project-ref', projectId, '--password', password]);
  }
  
  log("\nStarting local Supabase stack (this might take a minute)...", CYAN);
  // Try to start; if it fails, we prompt the user (might be the storage image issue again, but hopefully fixed by then)
  if (!runCmd('supabase', ['start'])) {
      warn("Supabase start failed. Check logs above.");
      const cont = await askQuestion("Continue setup anyway? (y/n) ");
      if (cont.toLowerCase() !== 'y') process.exit(1);
  } else {
      success("Supabase stack is up and running!");
  }
}

async function setupMCP() {
  section("3. MCP Server Configuration");

  const envPath = path.join(process.cwd(), 'lms-mcp', '.env');
  const envLocalPath = path.join(process.cwd(), 'lms-mcp', '.env.local');

  if (fs.existsSync(envLocalPath) || fs.existsSync(envPath)) {
    success("MCP environment config found.");
  } else {
    warn("MCP environment config missing. Creating template...");
    // Per IgniteZero rules: No working defaults - require explicit configuration
    const templateEnv = `# ⚠️ REQUIRED: Set real values before running - no defaults work
MCP_AUTH_TOKEN=CHANGE_ME_REQUIRED
AGENT_TOKEN=CHANGE_ME_REQUIRED
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ACCESS_TOKEN=CHANGE_ME_REQUIRED
HOST=127.0.0.1
PORT=4000
ALLOW_SERVICE_ROLE=false
MCP_TRACE=0
TRACE_DIR=traces
`;
    fs.writeFileSync(envLocalPath, templateEnv);
    warn(`Created ${envLocalPath} - YOU MUST SET REAL VALUES before running!`);
  }

  log("Installing MCP dependencies...", CYAN);
  runCmd('npm', ['install'], path.join(process.cwd(), 'lms-mcp'));
}

async function finalSteps() {
  section("4. Finalizing");

  log("Installing root dependencies...", CYAN);
  runCmd('npm', ['install']);

  success("\n🎉 SETUP COMPLETE! 🎉");
  log("\nTo start the system:", BRIGHT);
  log("  1. npm run dev:up   (Starts everything: MCP + Frontend)", CYAN);
  log("\nHappy coding!", YELLOW);
  
  // Mark setup as complete
  fs.writeFileSync('.setup_complete', new Date().toISOString());
}

// --- Main ---

(async () => {
  console.clear();
  log(BRIGHT + `
   ___  _____  _   _  ____  _____  ____    _____  ____  ____   ___  
  |_ _||  __ \\| \\ | ||_  _||_   _||  __|  |__  / |  __||  _ \\ / _ \\ 
   | | | |  \\/|  \\| |  | |    | |  | |_       / /  | |_  | |_| | | | |
   | | | | __ | .   |  | |    | |  |  _|     / /_  |  _| |  _ <| |_| |
  |___||_|__\\_|_|\\__| |____|  |_|  |____|   /____| |____||_| \\_\\\\___/ 
  ` + RESET);
  log("Welcome to Ignite Zero! Let's get your environment ready.\n", CYAN);

  try {
    await checkPrerequisites();
    await setupMCP();
    await setupSupabase();
    await finalSteps();
  } catch (e) {
    error(`Unexpected error: ${e}`);
  }
})();

