export const TUNING_SCENARIOS = {
  purist: {
    name: 'The Purist (Text Only)',
    input: `Build a SaaS dashboard for project management.

## Dashboard Screen
The main dashboard shows active projects, task completion rates, and team activity. Include:
- Project cards with progress bars
- Task list with filters
- Team member avatars

## Authentication
Login and signup screens with email/password and social auth options.

## Billing Portal
Subscription management screen with plan selection, payment history, and invoice downloads.

## Settings Panel
User profile settings, notification preferences, and account management.`,
    expectations: {
      minLanes: 3,
      maxLanes: 4,
      providedCount: 0,
      generatedCount: 'all',
      forbiddenTitles: ['Introduction', 'Overview', 'Requirements', 'User Roles', 'Core Requirements'],
      requiredKeywords: ['Dashboard', 'Auth', 'Billing', 'Settings'],
    },
  },

  designer: {
    name: 'The Designer (Full HTML)',
    input: `# Medical Training Platform

## Welcome Screen

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Welcome - Medical Training</title>
  <style>
    body { background: #f5f5f5; font-family: sans-serif; padding: 2rem; }
    h1 { color: #0082c6; }
  </style>
</head>
<body>
  <h1>Welcome to Medical Training</h1>
  <button>Start Simulation</button>
</body>
</html>
\`\`\`

## Admin Login

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Admin Login</title>
  <style>
    body { background: #fff; padding: 2rem; }
    .card { max-width: 400px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Admin Login</h2>
    <form>
      <input type="email" placeholder="Email" />
      <input type="password" placeholder="Password" />
      <button type="submit">Login</button>
    </form>
  </div>
</body>
</html>
\`\`\`

## Simulation Interface

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Simulation</title>
  <style>
    body { display: flex; height: 100vh; margin: 0; }
    .sidebar { width: 300px; background: #f0f0f0; }
    .main { flex: 1; padding: 2rem; }
  </style>
</head>
<body>
  <div class="sidebar">
    <h3>Progress Tracker</h3>
  </div>
  <div class="main">
    <h1>Case Simulation</h1>
    <div class="chat">Chat interface here</div>
  </div>
</body>
</html>
\`\`\``,
    expectations: {
      minLanes: 3,
      maxLanes: 3,
      providedCount: 3,
      generatedCount: 0,
      requiredTitles: ['Welcome Screen', 'Admin Login', 'Simulation Interface'],
      forbiddenTitles: ['Medical Training Platform'],
    },
  },

  hybrid: {
    name: 'The Hybrid (Mixed)',
    input: `## Login Screen

\`\`\`html
<!DOCTYPE html>
<html>
<head><title>Login</title></head>
<body>
  <h1>Login</h1>
  <form>
    <input type="email" />
    <input type="password" />
    <button>Sign In</button>
  </form>
</body>
</html>
\`\`\`

## Analytics Dashboard

This screen shows revenue charts, user growth metrics, and conversion funnels. Include:
- Date range selector
- Revenue chart (line graph)
- User growth chart (bar graph)
- Key metrics cards (MRR, Active Users, Churn Rate)`,
    expectations: {
      minLanes: 2,
      maxLanes: 2,
      providedCount: 1,
      generatedCount: 1,
      requiredTitles: ['Login Screen', 'Analytics Dashboard'],
    },
  },

  messyPaste: {
    name: 'The Messy Paste (Raw HTML)',
    input: `Some intro text about the project.

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Home Page</title>
  <style>
    body { margin: 0; padding: 2rem; }
  </style>
</head>
<body>
  <h1>Home</h1>
  <p>Welcome to our platform</p>
</body>
</html>

More text in between.

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Settings</title>
</head>
<body>
  <h1>Settings</h1>
  <form>
    <input type="text" placeholder="Username" />
    <button>Save</button>
  </form>
</body>
</html>

Final notes here.

<!DOCTYPE html>
<html>
<head><title>404 Error</title></head>
<body><h1>404 - Not Found</h1></body>
</html>`,
    expectations: {
      minLanes: 3,
      maxLanes: 3,
      providedCount: 3,
      generatedCount: 0,
      requiredTitles: ['Home Page', 'Settings', '404 Error'],
    },
  },

  marathon: {
    name: 'The Marathon Plan (Many Headings)',
    input: Array.from({ length: 24 })
      .map((_, idx) => {
        const num = idx + 1;
        const label =
          num % 4 === 0
            ? `## Phase ${num}: Operational Rituals\nThis is a checklist for the ops team.`
            : `## ${['Client Health Dashboard', 'Deal Room View', 'Revenue Console', 'Onboarding Wizard', 'Billing Portal'][idx % 5]} ${num}\nDescribe UI lane ${num} with components, cards, and CTA buttons.`;
        return label;
      })
      .join('\n\n'),
    expectations: {
      minLanes: 4,
      maxLanes: 10,
      providedCount: 0,
      generatedCount: 'all',
      forbiddenTitles: ['Phase'],
    },
  },

  fallbackResilience: {
    name: 'The Resilient Fallback',
    input: `## Blueprint Snapshot
Render the main Blueprint Dashboard with hero, metrics, and CTA.

## Experiments Panel
List current experiments with status chips.

## Error Console
Table of recent errors with retry buttons.`,
    expectations: {
      minLanes: 3,
      maxLanes: 3,
      providedCount: 0,
      generatedCount: 'all',
    },
    forceMockFailure: true,
  },

  fallbackGuard: {
    name: 'The Pragmatist (Forced Fallback)',
    input: `## Overview
High-level recap of the system goals and backlog. This is documentation only.

## Team Handoffs
Notes about how engineering will split work. Still documentation, no UI instructions.`,
    expectations: {
      minLanes: 2,
      maxLanes: 2,
      providedCount: 0,
      generatedCount: 'all',
      requiredTitles: ['Overview', 'Team Handoffs'],
    },
    invokeMode: 'forceDocumentation',
  },
};

export type TuningScenario = typeof TUNING_SCENARIOS[keyof typeof TUNING_SCENARIOS] & {
  invokeMode?: 'live' | 'forceDocumentation';
  forceMockFailure?: boolean;
};

