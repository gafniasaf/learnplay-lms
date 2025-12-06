/**
 * Fix Admin Organization ID Script
 * 
 * Ensures the admin user has organization_id set in their metadata.
 * This is required for Edge Functions to authenticate properly.
 * 
 * Usage: npx tsx scripts/fix-admin-org.ts <email>
 * 
 * Example: npx tsx scripts/fix-admin-org.ts admin@learnplay.dev
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read from learnplay.env if not in process.env
const envFile = path.resolve(__dirname, '../learnplay.env');
let SUPABASE_URL = process.env.SUPABASE_URL;
let SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  try {
    const envContent = readFileSync(envFile, 'utf-8');
    const lines = envContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.includes('Project url') && i + 1 < lines.length) {
        SUPABASE_URL = lines[i + 1].trim();
      }
      if (line.includes('service role key') && i + 1 < lines.length) {
        SUPABASE_SERVICE_ROLE_KEY = lines[i + 1].trim();
      }
    }
  } catch (error) {
    console.warn('Could not read learnplay.env, using environment variables');
  }
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or ensure learnplay.env exists.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const DEFAULT_ORG_ID = process.env.ORGANIZATION_ID || '4d7b0a5c-3cf1-49e5-9ad7-bf6c1f8a2f58';

async function fixAdminOrg(email: string) {
  console.log(`\n🔧 Fixing organization_id for admin: ${email}`);

  try {
    // Step 1: Find the user
    console.log('📝 Finding user...');
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) {
      throw usersError;
    }
    
    const user = usersData.users.find(u => u.email === email);
    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }
    
    console.log(`✅ Found user: ${user.id}`);
    
    // Step 2: Check current metadata
    const currentOrgId = user.app_metadata?.organization_id || user.user_metadata?.organization_id;
    console.log(`📋 Current organization_id: ${currentOrgId || 'NOT SET'}`);
    
    if (currentOrgId === DEFAULT_ORG_ID) {
      console.log('✅ Organization ID is already set correctly!');
      console.log('\n💡 If you\'re still getting 401 errors, try logging out and logging back in to refresh your session token.');
      return;
    }
    
    // Step 3: Ensure organization exists
    console.log(`🏢 Ensuring organization exists: ${DEFAULT_ORG_ID}...`);
    const { error: orgError } = await supabase
      .from('organizations')
      .upsert({ 
        id: DEFAULT_ORG_ID, 
        name: 'Default Organization',
        slug: 'default-org'
      }, { onConflict: 'id' });
    
    if (orgError) {
      console.warn('⚠️  Could not ensure organization exists:', orgError.message);
    } else {
      console.log('✅ Organization exists');
    }
    
    // Step 4: Update user metadata with organization_id
    console.log('🔗 Setting organization_id in user metadata...');
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...user.app_metadata,
        organization_id: DEFAULT_ORG_ID,
      },
      user_metadata: {
        ...user.user_metadata,
        organization_id: DEFAULT_ORG_ID,
      },
    });
    
    if (updateError) {
      throw updateError;
    }
    
    console.log('✅ Organization ID set in metadata');
    
    // Step 5: Verify the update
    console.log('🔍 Verifying update...');
    const { data: updatedUsers } = await supabase.auth.admin.listUsers();
    const updatedUser = updatedUsers?.users.find(u => u.id === user.id);
    
    const verifiedOrgId = updatedUser?.app_metadata?.organization_id || updatedUser?.user_metadata?.organization_id;
    if (verifiedOrgId === DEFAULT_ORG_ID) {
      console.log('✅ Verification successful!');
    } else {
      console.warn('⚠️  Verification failed - organization_id may not be set correctly');
    }
    
    console.log(`\n🎉 Admin account fixed!`);
    console.log(`   Email: ${email}`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Organization ID: ${DEFAULT_ORG_ID}`);
    console.log(`\n⚠️  IMPORTANT: You must log out and log back in for the changes to take effect!`);
    console.log(`   The session token needs to be refreshed to include the new organization_id.`);
    
  } catch (error) {
    console.error('\n❌ Error fixing admin organization:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 1) {
  console.error('Usage: npx tsx scripts/fix-admin-org.ts <email>');
  console.error('\nExample:');
  console.error('  npx tsx scripts/fix-admin-org.ts admin@learnplay.dev');
  process.exit(1);
}

const [email] = args;

// Validate email
if (!email.includes('@')) {
  console.error('❌ Invalid email address');
  process.exit(1);
}

fixAdminOrg(email);

