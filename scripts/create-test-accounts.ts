/**
 * Create Test Accounts for Integration Tests
 * 
 * Creates test accounts for all roles (admin, teacher, parent, student)
 * used by integration tests.
 * 
 * Usage: npx tsx scripts/create-test-accounts.ts
 * 
 * Required env vars:
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - ORGANIZATION_ID (optional, will use default if not set)
 * 
 * Creates accounts:
 *   - admin@test.local / TestAdmin123!
 *   - teacher@test.local / TestTeacher123!
 *   - parent@test.local / TestParent123!
 *   - student@test.local / TestStudent123!
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load from learnplay.env if it exists
function loadLearnPlayEnv() {
  const envFile = resolve(__dirname, '../learnplay.env');
  if (existsSync(envFile)) {
    const content = readFileSync(envFile, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim().toLowerCase();
      if (line.includes('project url') && i + 1 < lines.length) {
        const url = lines[i + 1].trim();
        if (url && !process.env.SUPABASE_URL) {
          process.env.SUPABASE_URL = url;
        }
      }
      if (line.includes('service role key') && i + 1 < lines.length) {
        const key = lines[i + 1].trim();
        if (key && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
          process.env.SUPABASE_SERVICE_ROLE_KEY = key;
        }
      }
      if (line.includes('organization') && i + 1 < lines.length) {
        const orgId = lines[i + 1].trim();
        if (orgId && !process.env.ORGANIZATION_ID) {
          process.env.ORGANIZATION_ID = orgId;
        }
      }
    }
  }
}

loadLearnPlayEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORGANIZATION_ID = process.env.ORGANIZATION_ID || process.env.VITE_ORGANIZATION_ID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
  console.error('\nSet these in your .env file or environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface TestAccount {
  email: string;
  password: string;
  role: 'admin' | 'teacher' | 'parent' | 'student';
  name: string;
}

const TEST_ACCOUNTS: TestAccount[] = [
  {
    email: 'admin@test.local',
    password: 'TestAdmin123!',
    role: 'admin',
    name: 'Test Admin',
  },
  {
    email: 'teacher@test.local',
    password: 'TestTeacher123!',
    role: 'teacher',
    name: 'Test Teacher',
  },
  {
    email: 'parent@test.local',
    password: 'TestParent123!',
    role: 'parent',
    name: 'Test Parent',
  },
  {
    email: 'student@test.local',
    password: 'TestStudent123!',
    role: 'student',
    name: 'Test Student',
  },
];

async function createTestAccount(account: TestAccount, orgId: string | null): Promise<void> {
  console.log(`\n🔧 Creating ${account.role} account: ${account.email}`);

  try {
    // Check if user exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(u => u.email === account.email);
    
    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      console.log(`   ✅ User already exists: ${existingUser.id}`);
      userId = existingUser.id;
      
      // Update password
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: account.password,
      });
      if (updateError) {
        console.warn(`   ⚠️  Could not update password: ${updateError.message}`);
      } else {
        console.log(`   ✅ Password updated`);
      }
    } else {
      // Create new user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: {
          full_name: account.name,
          role: account.role,
        },
        app_metadata: orgId ? {
          organization_id: orgId,
        } : {},
      });

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        throw new Error('Failed to create user - no user data returned');
      }

      userId = authData.user.id;
      isNewUser = true;
      console.log(`   ✅ Auth user created: ${userId}`);
    }

    // Create/update profile
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        full_name: account.name,
        role: account.role,
      }, { onConflict: 'id' });

    if (profileError) {
      console.warn(`   ⚠️  Could not create/update profile: ${profileError.message}`);
    } else {
      console.log(`   ✅ Profile created/updated`);
    }

    // Set organization_id in metadata if provided
    if (orgId) {
      const { error: metadataError } = await supabase.auth.admin.updateUserById(userId, {
        app_metadata: {
          organization_id: orgId,
        },
        user_metadata: {
          organization_id: orgId,
          full_name: account.name,
          role: account.role,
        },
      });

      if (metadataError) {
        console.warn(`   ⚠️  Could not set organization_id: ${metadataError.message}`);
      } else {
        console.log(`   ✅ Organization ID set: ${orgId}`);
      }

      // Add to organization_users if table exists
      const { error: orgUserError } = await supabase
        .from('organization_users')
        .upsert({
          org_id: orgId,
          user_id: userId,
          org_role: account.role === 'student' ? 'student' : account.role === 'teacher' ? 'teacher' : account.role === 'parent' ? 'parent' : 'school_admin',
        }, { onConflict: 'org_id,user_id' });

      if (orgUserError) {
        console.warn(`   ⚠️  Could not add to organization_users: ${orgUserError.message}`);
      } else {
        console.log(`   ✅ Added to organization_users`);
      }
    }

    // Special handling for admin role
    if (account.role === 'admin') {
      try {
        const { error: adminError } = await supabase.rpc('make_user_admin', {
          user_email: account.email,
        });
        if (adminError) {
          console.warn(`   ⚠️  RPC make_user_admin failed: ${adminError.message}`);
        } else {
          console.log(`   ✅ Admin role set via RPC`);
        }
      } catch (error) {
        console.warn(`   ⚠️  Could not set admin role via RPC`);
      }
    }

    console.log(`   🎉 ${account.role} account ${isNewUser ? 'created' : 'updated'} successfully!`);

  } catch (error) {
    console.error(`   ❌ Error creating ${account.role} account:`);
    console.error(`      ${error instanceof Error ? error.message : error}`);
  }
}

async function main() {
  console.log('🚀 Creating test accounts for integration tests...\n');
  console.log(`   Supabase URL: ${SUPABASE_URL}`);
  console.log(`   Organization ID: ${ORGANIZATION_ID || 'Not set (will skip org linking)'}\n`);

  // Get or create default organization if needed
  let orgId = ORGANIZATION_ID;
  if (!orgId) {
    console.log('⚠️  ORGANIZATION_ID not set - accounts will be created without organization linking');
    console.log('   Set ORGANIZATION_ID env var to link accounts to an organization\n');
  }

  // Create all test accounts
  for (const account of TEST_ACCOUNTS) {
    await createTestAccount(account, orgId);
  }

  console.log('\n✅ Test account creation complete!');
  console.log('\n📝 Test Account Credentials:');
  console.log('   Admin:   admin@test.local / TestAdmin123!');
  console.log('   Teacher: teacher@test.local / TestTeacher123!');
  console.log('   Parent:  parent@test.local / TestParent123!');
  console.log('   Student: student@test.local / TestStudent123!');
  console.log('\n💡 Set these in your environment:');
  console.log('   $env:E2E_ADMIN_EMAIL = "admin@test.local"');
  console.log('   $env:E2E_ADMIN_PASSWORD = "TestAdmin123!"');
  console.log('   $env:E2E_TEACHER_EMAIL = "teacher@test.local"');
  console.log('   $env:E2E_TEACHER_PASSWORD = "TestTeacher123!"');
  console.log('   $env:E2E_PARENT_EMAIL = "parent@test.local"');
  console.log('   $env:E2E_PARENT_PASSWORD = "TestParent123!"');
  console.log('   $env:E2E_STUDENT_EMAIL = "student@test.local"');
  console.log('   $env:E2E_STUDENT_PASSWORD = "TestStudent123!"');
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

