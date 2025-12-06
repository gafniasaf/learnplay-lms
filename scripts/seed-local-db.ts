
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import crypto from 'crypto';

// Load Env from lms-mcp/.env.local
const envPath = path.join(process.cwd(), 'lms-mcp', '.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL is REQUIRED - set env var before running');
  process.exit(1);
}

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ SUPABASE_JWT_SECRET is REQUIRED - set env var before running');
  console.error('   For local dev, use the JWT secret from your Supabase local setup');
  process.exit(1);
} 

// Helper to sign JWT (HS256) without extra deps
function signJwt(payload: any, secret: string) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encodedHeader + '.' + encodedPayload)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Generate Service Role Token
const SERVICE_ROLE_TOKEN = signJwt({
  role: 'service_role',
  iss: 'supabase',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 365 * 10) // 10 years
}, JWT_SECRET);

console.log('🔑 Generated Service Role Token:', SERVICE_ROLE_TOKEN.slice(0, 20) + '...');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_TOKEN, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function seed() {
  console.log('🌱 Seeding Local Database...');

  // 1. Ensure User
  const email = 'demo@ignitezero.com';
  const password = 'password123';
  let userId: string;

  const { data: users } = await supabase.auth.admin.listUsers();
  const existingUser = users.users.find(u => u.email === email);

  if (existingUser) {
    userId = existingUser.id;
    console.log('✅ Demo User exists:', userId);
  } else {
    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Demo User' }
    });
    if (error) throw error;
    userId = newUser.user.id;
    console.log('✨ Created Demo User:', userId);
  }

  // 2. Ensure Organization
  // We check 'organizations' table.
  const ORG_ID = '00000000-0000-0000-0000-000000000000'; // All Zeros for Demo
  
  const { data: orgs, error: orgError } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', ORG_ID)
    .single();

  if (!orgs) {
     // Create
     const { error: insertError } = await supabase
       .from('organizations')
       .insert({
         id: ORG_ID,
         name: 'Demo Workspace',
         owner_id: userId 
       });
     
     if (insertError) {
       console.warn('⚠️ Could not insert generic Organization. Schema might vary.', insertError.message);
       // Try without owner_id if that fails?
     } else {
       console.log('✨ Created Demo Organization:', ORG_ID);
     }
  } else {
    console.log('✅ Demo Organization exists:', ORG_ID);
  }
  
  // 3. Link User to Org
  const { error: memberError } = await supabase
    .from('organization_members')
    .upsert({
      organization_id: ORG_ID,
      user_id: userId,
      role: 'admin'
    }, { onConflict: 'organization_id,user_id' });

  if (!memberError) {
      console.log('🔗 Linked User to Organization');
  }

  console.log('🌱 Seed Complete.');
}

seed().catch(err => {
  console.error('❌ Seed Failed:', err);
  process.exit(1);
});
