#!/bin/bash
# Quick script to switch Ignite Zero to local development mode

set -e

echo "🔧 Configuring Ignite Zero for LOCAL development..."

# Get local Supabase credentials
LOCAL_URL="http://localhost:54321"
LOCAL_ANON_KEY=$(supabase status --output json 2>/dev/null | jq -r '.DB.anon_key' || echo "")

if [ -z "$LOCAL_ANON_KEY" ]; then
    echo "⚠️  Supabase not running locally. Starting it..."
    supabase start
    LOCAL_ANON_KEY=$(supabase status --output json | jq -r '.DB.anon_key')
fi

LOCAL_SERVICE_KEY=$(supabase status --output json | jq -r '.DB.service_role_key')

echo "✅ Local Supabase running at $LOCAL_URL"

# Create/update .env.local files
cat > .env.local << EOF
# Local Development Configuration
VITE_SUPABASE_URL=$LOCAL_URL
VITE_SUPABASE_ANON_KEY=$LOCAL_ANON_KEY
VITE_SUPABASE_PUBLISHABLE_KEY=$LOCAL_ANON_KEY
VITE_ENABLE_DEV=true
EOF

cat > lms-mcp/.env.local << EOF
# Local MCP Server Configuration
SUPABASE_URL=$LOCAL_URL
SUPABASE_ANON_KEY=$LOCAL_ANON_KEY
AGENT_TOKEN=dev-local-token-$(openssl rand -hex 8)
MCP_AUTH_TOKEN=dev-local-mcp-$(openssl rand -hex 8)
USE_LOCAL_RUNNER=true
OPENAI_API_KEY=\${OPENAI_API_KEY:-}
ANTHROPIC_API_KEY=\${ANTHROPIC_API_KEY:-}
EOF

cat > supabase/.env.local << EOF
# Local Edge Functions (if needed)
SUPABASE_URL=$LOCAL_URL
SUPABASE_ANON_KEY=$LOCAL_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$LOCAL_SERVICE_KEY
EOF

echo ""
echo "✅ Configuration files created:"
echo "   - .env.local (frontend)"
echo "   - lms-mcp/.env.local (MCP server)"
echo "   - supabase/.env.local (Edge Functions)"
echo ""
echo "🚀 Next steps:"
echo "   1. Start MCP server: cd lms-mcp && npm run dev"
echo "   2. Start frontend: npm run dev"
echo "   3. Use local Supabase at: $LOCAL_URL"
echo ""
echo "💡 To switch back to cloud, use: ./scripts/dev-cloud.sh"
