/**
 * Create Admin Account Script
 * 
 * Creates an admin user account in Supabase.
 * Usage: npx tsx scripts/create-admin.ts <email> <password> [name]
 * 
 * Example: npx tsx scripts/create-admin.ts admin@example.com SecurePass123! "Admin User"
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

async function createAdmin(email: string, password: string, fullName?: string) {
  console.log(`\n🔧 Creating admin account for: ${email}`);

  try {
    // Step 1: Check if user exists, create or get user
    console.log('📝 Checking for existing user...');
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users.find(u => u.email === email);
    
    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      console.log(`✅ User already exists: ${existingUser.id}`);
      userId = existingUser.id;
      
      // Update password if provided
      if (password) {
        console.log('🔑 Updating password...');
        const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
          password: password,
        });
        if (updateError) {
          console.warn('⚠️  Could not update password:', updateError.message);
        } else {
          console.log('✅ Password updated');
        }
      }
    } else {
      // Create new user
      console.log('📝 Creating new auth user...');
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          full_name: fullName || 'Admin User',
        },
      });

      if (authError) {
        throw authError;
      }

      if (!authData.user) {
        throw new Error('Failed to create user - no user data returned');
      }

      userId = authData.user.id;
      isNewUser = true;
      console.log(`✅ Auth user created: ${userId}`);
    }

    // Step 2: Get or create default organization
    const defaultOrgId = process.env.ORGANIZATION_ID;
    if (!defaultOrgId) {
      console.error('❌ ORGANIZATION_ID is REQUIRED');
      process.exit(1);
    }
    console.log(`🏢 Checking organization: ${defaultOrgId}...`);
    
    // Check if organization exists
    const { data: orgData, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', defaultOrgId)
      .single();

    if (orgError && orgError.code !== 'PGRST116') { // PGRST116 = not found
      console.log('⚠️  Could not check organization, will try to create...');
    }

    if (!orgData) {
      // Create default organization if it doesn't exist
      console.log('📝 Creating default organization...');
      const { error: createOrgError } = await supabase
        .from('organizations')
        .insert({
          id: defaultOrgId,
          name: 'Default Organization',
        });

      if (createOrgError) {
        console.warn('⚠️  Could not create organization:', createOrgError.message);
        console.warn('   Continuing anyway - you may need to create it manually');
      } else {
        console.log('✅ Default organization created');
      }
    } else {
      console.log('✅ Organization exists');
    }

    // Step 3: Make user admin
    console.log('👑 Setting admin role...');
    const { error: adminError } = await supabase.rpc('make_user_admin', {
      user_email: email,
    });

    if (adminError) {
      // If RPC fails, try direct update
      console.log('⚠️  RPC failed, trying direct update...');
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: authData.user.id,
          role: 'admin',
          full_name: fullName || 'Admin User',
        }, {
          onConflict: 'id',
        });

      if (updateError) {
        throw updateError;
      }
      console.log('✅ Admin role set via direct update');
    } else {
      console.log('✅ Admin role set via RPC');
    }

    // Step 4: Set organization_id in user metadata
    console.log('🔗 Linking user to organization...');
    const { error: metadataError } = await supabase.auth.admin.updateUserById(
      userId,
      {
        app_metadata: {
          organization_id: defaultOrgId,
        },
        user_metadata: {
          organization_id: defaultOrgId,
          full_name: fullName || existingUser?.user_metadata?.full_name || 'Admin User',
        },
      }
    );

    if (metadataError) {
      console.warn('⚠️  Could not set organization_id in metadata:', metadataError.message);
      console.warn('   You may need to set this manually in Supabase dashboard');
    } else {
      console.log('✅ Organization ID set in user metadata');
    }

    // Step 5: Add user to organization_users table (if it exists)
    console.log('👥 Adding user to organization_users...');
    const { error: orgUserError } = await supabase
      .from('organization_users')
      .upsert({
        org_id: defaultOrgId,
        user_id: userId,
        org_role: 'school_admin', // Admin role within org
      }, {
        onConflict: 'org_id,user_id',
      });

    if (orgUserError) {
      console.warn('⚠️  Could not add to organization_users:', orgUserError.message);
      console.warn('   This table may not exist or have different schema');
    } else {
      console.log('✅ User added to organization_users');
    }

    console.log(`\n🎉 Admin account ${isNewUser ? 'created' : 'updated'} successfully!`);
    console.log(`   Email: ${email}`);
    console.log(`   User ID: ${userId}`);
    console.log(`   Role: admin`);
    console.log(`   Organization ID: ${defaultOrgId}`);
    console.log(`\n📝 You can now log in with these credentials.`);

  } catch (error) {
    console.error('\n❌ Error creating admin account:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: npx tsx scripts/create-admin.ts <email> <password> [name]');
  console.error('\nExample:');
  console.error('  npx tsx scripts/create-admin.ts admin@example.com SecurePass123! "Admin User"');
  process.exit(1);
}

const [email, password, fullName] = args;

// Validate email
if (!email.includes('@')) {
  console.error('❌ Invalid email address');
  process.exit(1);
}

// Validate password (basic check)
if (password.length < 8) {
  console.error('❌ Password must be at least 8 characters');
  process.exit(1);
}

createAdmin(email, password, fullName);

