#!/bin/bash
# Quick script to switch Ignite Zero to cloud development mode

set -e

echo "☁️  Configuring Ignite Zero for CLOUD development..."

if [ -z "$SUPABASE_PROJECT_URL" ]; then
    echo "❌ SUPABASE_PROJECT_URL environment variable not set"
    echo "   Example: export SUPABASE_PROJECT_URL=https://your-project.supabase.co"
    exit 1
fi

if [ -z "$SUPABASE_ANON_KEY" ]; then
    echo "❌ SUPABASE_ANON_KEY environment variable not set"
    exit 1
fi

# Create/update .env.local files for cloud
cat > .env.local << EOF
# Cloud Development Configuration
VITE_SUPABASE_URL=$SUPABASE_PROJECT_URL
VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
VITE_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_ANON_KEY
VITE_ENABLE_DEV=false
EOF

cat > lms-mcp/.env.local << EOF
# Cloud MCP Server Configuration
SUPABASE_URL=$SUPABASE_PROJECT_URL
SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
AGENT_TOKEN=\${AGENT_TOKEN}
MCP_AUTH_TOKEN=\${MCP_AUTH_TOKEN}
USE_LOCAL_RUNNER=false
OPENAI_API_KEY=\${OPENAI_API_KEY:-}
ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY:-}
EOF

echo ""
echo "✅ Configuration files updated for cloud"
echo "   - .env.local (frontend)"
echo "   - lms-mcp/.env.local (MCP server)"
echo ""
echo "🚀 Next steps:"
echo "   1. Deploy Edge Functions: ./scripts/ci/deploy-functions.ps1"
echo "   2. Verify deployment: npx tsx scripts/verify-live-deployment.ts"
echo "   3. Start MCP server: cd lms-mcp && npm run dev"
echo "   4. Start frontend: npm run dev"
echo ""
echo "💡 To switch back to local, use: ./scripts/dev-local.sh"
