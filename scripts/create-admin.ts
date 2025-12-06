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
    // Step 1: Create auth user
    console.log('📝 Creating auth user...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName || 'Admin User',
      },
    });

    if (authError) {
      // Check if user already exists
      if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
        console.log('⚠️  User already exists. Updating to admin role...');
        
        // Get existing user by email
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users.find(u => u.email === email);
        
        if (!existingUser) {
          throw new Error(`User with email ${email} not found`);
        }

        // Make existing user admin
        const { error: adminError } = await supabase.rpc('make_user_admin', {
          user_email: email,
        });

        if (adminError) {
          throw adminError;
        }

        console.log(`✅ User ${email} is now an admin!`);
        return;
      }
      throw authError;
    }

    if (!authData.user) {
      throw new Error('Failed to create user - no user data returned');
    }

    console.log(`✅ Auth user created: ${authData.user.id}`);

    // Step 2: Make user admin
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

    console.log(`\n🎉 Admin account created successfully!`);
    console.log(`   Email: ${email}`);
    console.log(`   User ID: ${authData.user.id}`);
    console.log(`   Role: admin`);
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

