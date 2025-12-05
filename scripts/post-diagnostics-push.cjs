const { execSync } = require('child_process');

function sh(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

if (!process.env.ALLOW_DIAG_PUSH) {
  console.log('[diag] Skipping auto-push: ALLOW_DIAG_PUSH not set');
  process.exit(0);
}

try {
  sh('git config user.name "lovable-ci"');
  sh('git config user.email "lovable-ci@lovable.dev"');
  // Stage diagnostics and any updated reports
  sh('git add reports/diagnostics/*.json');
  sh('git add reports');
  sh('git commit -m "chore: diagnostics: update report"');
} catch (e) {
  // nothing to commit
}

// Merge-only, non-interactive sync with origin/main
try { sh('git fetch origin'); } catch {}
try {
  sh('git merge --ff-only origin/main');
} catch (e) {
  // Fall back to a no-edit merge if fast-forward isn't possible
  try { sh('git merge --no-edit origin/main'); } catch {}
}

// Push
sh('git push origin main');
