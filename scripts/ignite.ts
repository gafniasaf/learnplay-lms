#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { styleText } from 'node:util';
import { verifySystem } from './lib/verify-system.js';
import { scaffoldManifest } from './lib/scaffold-system.js';
import { scaffoldCtas } from './lib/scaffold-ctas.js';

const COMMANDS: Record<string, string> = {
  verify: 'Run full system verification',
  scaffold: 'Regenerate contracts and UI',
  test: 'Run tests',
  deploy: 'Deploy Edge Functions',
};

function run(cmd: string, args: string[]) {
  console.log(styleText('dim', `> ${cmd} ${args.join(' ')}`));
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help') {
    console.log(`\n${styleText('bold', '🔥 Ignite Zero CLI')}\n`);
    Object.entries(COMMANDS).forEach(([c, d]) => console.log(`  ${styleText('cyan', c.padEnd(12))} ${d}`));
    return;
  }

  try {
    if (command === 'verify') {
      await verifySystem();
    } else if (command === 'scaffold') {
      await scaffoldManifest();
      await scaffoldCtas();
    } else if (command === 'test') {
      run('npm', ['run', 'test']);
      run('npm', ['run', 'test:contracts']);
    } else if (command === 'deploy') {
      run('npm', ['run', 'deploy']);
    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
  } catch (error) {
    console.error(styleText('red', '\n❌ Command failed'));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
