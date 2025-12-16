# How to Run - LearnPlay Platform

**Last Updated:** 2025-10-25  
**Version:** 2.0 (Multi-Tenant)

---

## Prerequisites

### Required Software
- **Node.js** 18.x or higher
- **npm** 9.x or higher (or bun 1.x)
- **Git** for version control
- **Supabase CLI** 1.50+ (for local development)

### Optional Tools
- **Docker** (for local Supabase)
- **PostgreSQL** client (for direct DB access)

---

## Quick Start (Development)

### 1. Clone Repository
```bash
git clone https://github.com/gafniasaf/dawn-react-starter.git
cd dawn-react-starter
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
```bash
# Copy example environment file
cp .env.example .env

# Edit .env and add your Supabase credentials
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key  # For scripts/migrations
```

Required environment variables:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` - Public publishable key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (for admin operations)

Optional:
- `VITE_ENABLE_DEV` - Set to `true` to enable dev tools (access via `?dev=1`)

See [ENV_SETUP.md](ENV_SETUP.md) for complete environment configuration.

### 4. Apply Database Migrations
```bash
# Login to Supabase CLI
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Apply all migrations
supabase db push
```

### 5. Run Backfill (First Time Only)
```bash
# Populate course_metadata from existing courses
npm run backfill:metadata

# Check report
cat reports/backfill-metadata-*.md
```

### 6. Start Development Server
```bash
npm run dev
```

Open [http://localhost:8080](http://localhost:8080) in your browser.

---

## Running Tests

### Unit Tests (Jest)
```bash
# Run all unit tests
npm run test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

Coverage report: `reports/coverage/index.html`

### E2E Tests (Playwright)
```bash
# Run all E2E tests
npm run e2e

# Run with UI (headed mode)
npm run e2e:headed

# View test report
npm run e2e:report
```

Test reports:
- HTML: `reports/playwright-html/index.html`
- JUnit: `reports/playwright-junit.xml`

### Type Checking
```bash
npm run typecheck
```

### Linting
```bash
npm run lint
```

---

## Building for Production

### Build
```bash
npm run build
```

Build output: `dist/` directory

### Preview Production Build
```bash
npm run preview
```

Serves production build at [http://localhost:8080](http://localhost:8080)

---

## Database Operations

### Apply Migrations
```bash
# Apply all pending migrations
supabase db push

# Create new migration
supabase migration new migration_name

# Reset database (DESTRUCTIVE - dev only)
supabase db reset
```

### Backfill Course Metadata
```bash
# Run backfill script
npm run backfill:metadata

# Check results
cat reports/backfill-metadata-*.md
cat artifacts/backfill-results-*.json
```

### Query Database
```bash
# Open psql shell
supabase db shell

# Run SQL file
supabase db execute --file path/to/query.sql
```

---

## Edge Functions

### Deploy All Functions
```bash
supabase functions deploy
```

### Deploy Single Function
```bash
supabase functions deploy org-config
supabase functions deploy list-courses-filtered
supabase functions deploy publish-course
supabase functions deploy restore-course-version
```

### View Function Logs
```bash
supabase functions logs org-config
supabase functions logs --tail  # Stream all logs
```

### Test Edge Function Locally
```bash
# Start local Supabase
supabase start

# Serve function locally
supabase functions serve org-config --env-file .env

# Call function
curl http://localhost:54321/functions/v1/org-config \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Development Workflows

### Adding a New Feature
1. Create feature branch: `git checkout -b feature/my-feature`
2. Write tests first (TDD)
3. Implement feature
4. Run tests: `npm run test && npm run e2e`
5. Type check: `npm run typecheck`
6. Lint: `npm run lint`
7. Build: `npm run build`
8. Commit and push
9. Create PR

### Creating a New Migration
1. Create migration file:
   ```bash
   supabase migration new my_feature
   ```
2. Write SQL in `supabase/migrations/YYYYMMDDHHMMSS_my_feature.sql`
3. Test locally:
   ```bash
   supabase db reset  # Apply all migrations fresh
   ```
4. Commit migration file

### Debugging Edge Functions
1. Check function logs:
   ```bash
   supabase functions logs function-name --tail
   ```
2. Add console.log statements in function code
3. Redeploy: `supabase functions deploy function-name`
4. Call function and check logs

---

## Common Issues & Solutions

### Issue: "Missing SUPABASE_URL"
**Solution:** Ensure `.env` file exists with correct variables.

### Issue: Migration Failed
**Solution:**
```bash
# Check migration status
supabase migration list

# Repair migration history
supabase migration repair --status applied 20251025200000

# Reset and reapply (dev only)
supabase db reset
```

### Issue: Edge Function Returns 500
**Solution:**
- Check function logs: `supabase functions logs function-name`
- Verify environment variables in Supabase dashboard
- Ensure RLS policies allow access

### Issue: Tests Failing
**Solution:**
```bash
# Clear Jest cache
npm run test -- --clearCache

# Install Playwright browsers
npx playwright install

# Check for type errors
npm run typecheck
```

### Issue: Port 5173 Already in Use
**Solution:**
```bash
# Kill existing process
lsof -ti:5173 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :5173   # Windows (find PID, then taskkill /PID <pid> /F)

# Or use different port
vite --port 3000
```

---

## Environment Modes

### Live Mode (Only Supported Mode)

IgniteZero runs **live-only** against Supabase Edge Functions and real data.

- `VITE_USE_MOCK=true` is **forbidden** and should hard-fail.
- Do not use URL overrides like `?live=0` / `?live=1`.

### Dev Mode
```bash
# Set in .env
VITE_ENABLE_DEV=true

# Or use URL parameter
# Visit: http://localhost:8080?dev=1
```

Enables:
- `/dev/diagnostics` page
- Additional logging
- Dev-only routes

---

## Project Structure

```
dawn-react-starter/
├── src/
│   ├── components/       # Reusable UI components
│   ├── pages/            # Route pages
│   ├── hooks/            # Custom React hooks
│   ├── lib/              # Utilities and API clients
│   ├── store/            # Zustand stores
│   └── integrations/     # Supabase client
├── supabase/
│   ├── functions/        # Edge functions
│   └── migrations/       # Database migrations
├── tests/
│   ├── e2e/              # Playwright E2E tests
│   ├── hooks/            # Hook tests
│   └── migrations/       # Migration tests
├── public/               # Static assets
├── scripts/              # Automation scripts
├── reports/              # Test reports and coverage
└── artifacts/            # Debug artifacts
```

---

## Scripts Reference

| Command | Description |
|---------|-------------|
|| `npm run dev` | Start dev server (port 8080) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run test` | Run Jest unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Generate coverage report |
| `npm run typecheck` | Type check with TypeScript |
| `npm run lint` | Run ESLint |
| `npm run e2e` | Run Playwright E2E tests |
| `npm run e2e:headed` | Run E2E with browser UI |
| `npm run e2e:report` | Open E2E test report |
| `npm run backfill:metadata` | Backfill course metadata |

---

## Deployment

### Deploy to Staging
```bash
# Build
npm run build

# Deploy edge functions
supabase functions deploy

# Apply migrations
supabase db push --linked

# Upload static files to hosting (Vercel, Netlify, etc.)
# ... follow your hosting provider's instructions
```

### Deploy to Production
See [docs/GO_LIVE_CHECKLIST.md](docs/GO_LIVE_CHECKLIST.md) for complete deployment checklist.

---

## Multi-Tenant Setup

### Create New Organization
```sql
INSERT INTO organizations (name, slug, branding, settings)
VALUES (
  'School A',
  'school-a',
  '{"logoUrl": "/logo.png", "primaryColor": "#1E40AF"}',
  '{}'
);
```

### Assign User to Organization
```sql
INSERT INTO user_roles (user_id, organization_id, role)
VALUES (
  'user-uuid',
  'org-uuid',
  'org_admin'  -- or 'editor', 'viewer'
);
```

### Create Superadmin
```sql
INSERT INTO user_roles (user_id, organization_id, role)
VALUES (
  'user-uuid',
  NULL,  -- NULL = superadmin
  'superadmin'
);
```

---

## Monitoring & Debugging

### Check Application Logs
- Browser console (F12)
- Sentry dashboard (if configured)

### Check Edge Function Logs
```bash
supabase functions logs --tail
```

### Check Database
```bash
supabase db shell
```

### Export Diagnostics
```bash
npm run diag
```

Generates diagnostics in `reports/diagnostics/`.

---

## Resources

- **Architecture:** [docs/MULTI_TENANT_ARCHITECTURE.md](docs/MULTI_TENANT_ARCHITECTURE.md)
- **API Reference:** [docs/API_REFERENCE.md](docs/API_REFERENCE.md)
- **Environment Config:** [ENV_SETUP.md](ENV_SETUP.md)
- **Technical Info:** [TECHNICAL_INFO.md](TECHNICAL_INFO.md)
- **Deployment:** [docs/GO_LIVE_CHECKLIST.md](docs/GO_LIVE_CHECKLIST.md)

---

## Getting Help

- **Documentation:** Check `docs/` directory
- **Issues:** Create GitHub issue
- **Security:** See [SECURITY.md](SECURITY.md)

---

**Document Version:** 2.0  
**Last Updated:** 2025-10-25

