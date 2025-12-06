/**
 * Verify Admin Authorization Script
 * 
 * Verifies that an admin user has all required metadata and permissions.
 * 
 * Usage: npx tsx scripts/verify-admin-auth.ts <email>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Per IgniteZero rules: No fallbacks - fail loudly if ORGANIZATION_ID is not set
const DEFAULT_ORG_ID = process.env.ORGANIZATION_ID;
if (!DEFAULT_ORG_ID) {
  console.error('❌ ORGANIZATION_ID environment variable is REQUIRED');
  console.error('   Set ORGANIZATION_ID before running this script.');
  process.exit(1);
}

async function verifyAdminAuth(email: string) {
  console.log(`\n🔍 Verifying admin authorization for: ${email}\n`);

  try {
    // Step 1: Find the user
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) {
      throw usersError;
    }
    
    const user = usersData.users.find(u => u.email === email);
    if (!user) {
      console.error(`❌ User not found: ${email}`);
      process.exit(1);
    }
    
    console.log(`✅ User found: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Email confirmed: ${user.email_confirmed_at ? 'Yes' : 'No'}`);
    
    // Step 2: Check organization_id
    const appOrgId = user.app_metadata?.organization_id;
    const userOrgId = user.user_metadata?.organization_id;
    const orgId = appOrgId || userOrgId;
    
    console.log(`\n📋 Organization ID:`);
    console.log(`   app_metadata: ${appOrgId || 'NOT SET'}`);
    console.log(`   user_metadata: ${userOrgId || 'NOT SET'}`);
    
    if (orgId === DEFAULT_ORG_ID) {
      console.log(`   ✅ Correct organization ID set`);
    } else if (orgId) {
      console.log(`   ⚠️  Organization ID is set but different: ${orgId}`);
      console.log(`   Expected: ${DEFAULT_ORG_ID}`);
    } else {
      console.log(`   ❌ Organization ID is NOT SET`);
    }
    
    // Step 3: Check admin role in profiles table
    console.log(`\n👑 Admin Role:`);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (profileError) {
      console.log(`   ⚠️  Could not check profile: ${profileError.message}`);
    } else {
      console.log(`   Role in profiles table: ${profile?.role || 'NOT SET'}`);
      if (profile?.role === 'admin') {
        console.log(`   ✅ Admin role confirmed`);
      } else {
        console.log(`   ❌ Admin role NOT SET (current: ${profile?.role || 'none'})`);
      }
    }
    
    // Step 4: Ensure everything is set correctly
    console.log(`\n🔧 Ensuring all settings are correct...`);
    
    let needsUpdate = false;
    
    // Update organization_id if missing or incorrect
    if (!appOrgId || appOrgId !== DEFAULT_ORG_ID || !userOrgId || userOrgId !== DEFAULT_ORG_ID) {
      console.log(`   Updating organization_id in metadata...`);
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
        console.error(`   ❌ Failed to update metadata: ${updateError.message}`);
      } else {
        console.log(`   ✅ Organization ID updated in metadata`);
        needsUpdate = true;
      }
    }
    
    // Ensure admin role in profiles
    if (profile?.role !== 'admin') {
      console.log(`   Setting admin role in profiles...`);
      const { error: roleError } = await supabase.rpc('make_user_admin', {
        user_email: email,
      });
      
      if (roleError) {
        // Try direct update
        const { error: directError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            role: 'admin',
          }, { onConflict: 'id' });
        
        if (directError) {
          console.error(`   ❌ Failed to set admin role: ${directError.message}`);
        } else {
          console.log(`   ✅ Admin role set`);
          needsUpdate = true;
        }
      } else {
        console.log(`   ✅ Admin role set via RPC`);
        needsUpdate = true;
      }
    }
    
    // Step 5: Verify organization exists
    console.log(`\n🏢 Verifying organization...`);
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', DEFAULT_ORG_ID)
      .single();
    
    if (orgError) {
      console.log(`   ⚠️  Organization not found, creating...`);
      const { error: createError } = await supabase
        .from('organizations')
        .upsert({
          id: DEFAULT_ORG_ID,
          name: 'Default Organization',
          slug: 'default-org',
        }, { onConflict: 'id' });
      
      if (createError) {
        console.error(`   ❌ Failed to create organization: ${createError.message}`);
      } else {
        console.log(`   ✅ Organization created`);
        needsUpdate = true;
      }
    } else {
      console.log(`   ✅ Organization exists: ${orgData.name}`);
    }
    
    // Final summary
    console.log(`\n${'='.repeat(60)}`);
    if (needsUpdate) {
      console.log(`\n✅ Admin account has been updated!`);
      console.log(`\n⚠️  IMPORTANT: You MUST log out and log back in for changes to take effect!`);
      console.log(`   Your current session token doesn't include the updated metadata.`);
    } else {
      console.log(`\n✅ Admin account is properly configured!`);
      console.log(`\n💡 If you're still getting 401 errors:`);
      console.log(`   1. Log out completely`);
      console.log(`   2. Log back in`);
      console.log(`   3. This will refresh your session token with the correct metadata`);
    }
    console.log(`\n📋 Summary:`);
    console.log(`   Email: ${email}`);
    console.log(`   User ID: ${user.id}`);
    console.log(`   Organization ID: ${DEFAULT_ORG_ID}`);
    console.log(`   Role: admin`);
    console.log(`\n`);
    
  } catch (error) {
    console.error('\n❌ Error verifying admin authorization:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 1) {
  console.error('Usage: npx tsx scripts/verify-admin-auth.ts <email>');
  console.error('\nExample:');
  console.error('  npx tsx scripts/verify-admin-auth.ts admin@learnplay.dev');
  process.exit(1);
}

const [email] = args;

if (!email.includes('@')) {
  console.error('❌ Invalid email address');
  process.exit(1);
}

verifyAdminAuth(email);

