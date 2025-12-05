#!/bin/bash
# run-phase1-tests.sh
# Script to run Phase 1 edge function integration tests

set -e

echo "🧪 Running Phase 1 Edge Function Integration Tests"
echo "=================================================="
echo ""

# Check for required environment variables
if [ -z "$SUPABASE_URL" ]; then
  echo "❌ Error: SUPABASE_URL not set"
  exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Error: SUPABASE_SERVICE_ROLE_KEY not set"
  exit 1
fi

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "⚠️  Warning: ANTHROPIC_API_KEY not set - tests will be skipped"
fi

echo "✓ Environment variables configured"
echo "  SUPABASE_URL: $SUPABASE_URL"
echo "  API keys: $([ -n "$ANTHROPIC_API_KEY" ] && echo "✓ Anthropic" || echo "✗ Anthropic")"
echo ""

# Run the tests
echo "Running integration tests..."
echo ""

deno test \
  --allow-net \
  --allow-env \
  tests/integration/phase1-edge-functions.test.ts \
  "$@"

echo ""
echo "=================================================="
echo "✅ Tests completed"
