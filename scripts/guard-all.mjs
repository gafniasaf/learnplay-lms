import { spawnSync } from 'node:child_process';

const steps = [
  { name: 'mcp:check-auth-health', cmd: ['npm', ['run', 'mcp:check-auth-health']] },
  { name: 'mcp:edge-smoke', cmd: ['npm', ['run', 'mcp:edge-smoke']] },
  { name: 'mcp:jobs-health', cmd: ['npm', ['run', 'mcp:jobs-health']] },
  { name: 'ui:audit', cmd: ['npm', ['run', 'ui:audit']] },
  { name: 'ui:dead-cta-report:ci', cmd: ['npm', ['run', 'ui:dead-cta-report:ci']] },
  { name: 'mcp:templates-check', cmd: ['npm', ['run', 'mcp:templates-check']] },
  { name: 'mcp:pr-preview-smoke', cmd: ['npm', ['run', 'mcp:pr-preview-smoke']] },
  { name: 'test', cmd: ['npm', ['test', '--silent', '--', '--ci', '--reporters=default', '--color']] },
  { name: 'e2e:proxy', cmd: ['npm', ['run', 'e2e:proxy']] },
];

const results = [];
for (const s of steps) {
  console.log(`\n[guard:all] Running ${s.name}...`);
  const r = spawnSync(s.cmd[0], s.cmd[1], { stdio: 'inherit', shell: process.platform === 'win32' });
  results.push({ name: s.name, status: r.status === 0 ? 'ok' : 'fail', code: r.status ?? -1 });
}

const summary = {
  ok: results.every(r => r.status === 'ok'),
  results,
};

console.log('\n[guard:all] Summary:\n' + JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);


