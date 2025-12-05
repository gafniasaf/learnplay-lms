#!/bin/bash

# Script to update the Supabase Storage catalog.json with correct item counts

SUPABASE_URL="${VITE_SUPABASE_URL}"
ADMIN_KEY="${ADMIN_UPLOAD_KEY}"

if [ -z "$SUPABASE_URL" ]; then
  echo "Error: VITE_SUPABASE_URL not set"
  exit 1
fi

if [ -z "$ADMIN_KEY" ]; then
  echo "Error: ADMIN_UPLOAD_KEY not set"
  exit 1
fi

echo "Updating catalog in Supabase Storage..."

curl -X POST "${SUPABASE_URL}/functions/v1/update-catalog" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: ${ADMIN_KEY}" \
  | jq '.'

echo ""
echo "Catalog update complete!"
echo "Please refresh your browser and clear localStorage to see the changes."
