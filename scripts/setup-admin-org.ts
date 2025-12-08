/**
 * Setup Admin Organization
 * 
 * Creates the organization and links the admin user to it.
 * Usage: npx tsx scripts/setup-admin-org.ts <email> [orgId]
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORG_ID = process.env.ORGANIZATION_ID ? process.env.ORGANIZATION_ID : process.argv[3];
if (!ORG_ID) {
  console.error('❌ ORGANIZATION_ID is REQUIRED - set env var or pass as argument');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function setupOrg(email: string) {
  console.log(`\n🔧 Setting up organization for: ${email}`);
  console.log(`   Organization ID: ${ORG_ID}`);

  try {
    // Get user
    const { data: users } = await supabase.auth.admin.listUsers();
    const user = users?.users.find(u => u.email === email);
    
    if (!user) {
      throw new Error(`User with email ${email} not found`);
    }

    console.log(`✅ Found user: ${user.id}`);

    // Check if organization exists
    const { data: org, error: orgCheckError } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('id', ORG_ID)
      .single();

    if (orgCheckError && orgCheckError.code !== 'PGRST116') {
      console.warn('⚠️  Error checking organization:', orgCheckError.message);
    }

    if (!org) {
      // Create organization with slug
      console.log('📝 Creating organization...');
      const { error: createError } = await supabase
        .from('organizations')
        .insert({
          id: ORG_ID,
          name: 'Default Organization',
          slug: 'default-org',
        });

      if (createError) {
        // Try without slug if schema doesn't require it
        console.log('⚠️  Failed with slug, trying without...');
        const { error: createError2 } = await supabase
          .from('organizations')
          .insert({
            id: ORG_ID,
            name: 'Default Organization',
          });

        if (createError2) {
          throw createError2;
        }
        console.log('✅ Organization created (without slug)');
      } else {
        console.log('✅ Organization created');
      }
    } else {
      console.log(`✅ Organization exists: ${org.name}`);
    }

    // Set organization_id in user metadata
    console.log('🔗 Setting organization_id in user metadata...');
    const { error: metadataError } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        app_metadata: {
          organization_id: ORG_ID,
        },
        user_metadata: {
          ...user.user_metadata,
          organization_id: ORG_ID,
        },
      }
    );

    if (metadataError) {
      throw metadataError;
    }
    console.log('✅ Organization ID set in user metadata');

    // Add to organization_users if table exists
    console.log('👥 Adding to organization_users...');
    const { error: orgUserError } = await supabase
      .from('organization_users')
      .upsert({
        org_id: ORG_ID,
        user_id: user.id,
        org_role: 'school_admin',
      }, {
        onConflict: 'org_id,user_id',
      });

    if (orgUserError) {
      console.warn('⚠️  Could not add to organization_users:', orgUserError.message);
      console.warn('   This is OK if the table has different schema');
    } else {
      console.log('✅ Added to organization_users');
    }

    console.log(`\n🎉 Setup complete!`);
    console.log(`   User: ${email}`);
    console.log(`   Organization ID: ${ORG_ID}`);
    console.log(`\n📝 User can now create jobs.`);

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: npx tsx scripts/setup-admin-org.ts <email> [orgId]');
  process.exit(1);
}

setupOrg(email);

