import { spawn } from 'node:child_process';

const run = (command: string, args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: true });
    child.on('close', (code) => (code === 0 ? resolve() : reject(code)));
  });

async function main() {
  const bucket = process.env.VITE_PLAN_BUCKET || 'plans';
  console.log(`Ensuring Supabase bucket "${bucket}" exists and is public...`);

  try {
    await run('supabase', [
      'storage',
      'create-bucket',
      bucket,
      '--public',
      '--if-not-exists',
    ]);
    console.log(`✅ Bucket "${bucket}" ready.`);
  } catch (error) {
    console.error(
      'Supabase CLI command failed. Make sure you ran `supabase login` and try again.',
    );
    process.exit(1);
  }
}

main();

