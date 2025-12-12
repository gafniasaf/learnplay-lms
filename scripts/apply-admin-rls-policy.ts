/**
 * Script to apply admin RLS policy for student_activity_log table
 * Run with: npx tsx scripts/apply-admin-rls-policy.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: 'supabase/.deploy.env' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.error('❌ SUPABASE_URL not set');
  process.exit(1);
}

if (!serviceRoleKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set');
  console.log('Please set SUPABASE_SERVICE_ROLE_KEY in your environment or .env file');
  console.log('You can find this in Supabase Dashboard > Settings > API > service_role key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function applyPolicy() {
  console.log('🔄 Applying admin RLS policies for student_activity_log...');
  console.log(`   Supabase URL: ${supabaseUrl}`);
  
  // Check if policy already exists
  const { data: existingPolicies, error: checkError } = await supabase
    .rpc('pg_policies')
    .select('*');
  
  // Since we can't easily check, let's try to create with IF NOT EXISTS approach
  // We'll use raw SQL via an RPC function if available, or just note that manual action is needed
  
  console.log('\n📋 SQL to run in Supabase Dashboard > SQL Editor:');
  console.log('─'.repeat(60));
  console.log(`
-- Add admin RLS policy for student_activity_log
-- Run this in Supabase Dashboard > SQL Editor

-- First drop if exists (to allow re-running)
DROP POLICY IF EXISTS "admins view all activity" ON public.student_activity_log;
DROP POLICY IF EXISTS "admins insert activity" ON public.student_activity_log;

-- Create view policy for admins
CREATE POLICY "admins view all activity"
ON public.student_activity_log
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = auth.uid()
    AND org_role = 'admin'
  )
);

-- Create insert policy for admins
CREATE POLICY "admins insert activity"
ON public.student_activity_log
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_users
    WHERE user_id = auth.uid()
    AND org_role = 'admin'
  )
);
  `);
  console.log('─'.repeat(60));
  console.log('\n✅ Copy the SQL above and run it in Supabase Dashboard.');
  console.log('   Dashboard URL: https://supabase.com/dashboard/project/eidcegehaswbtzrwzvfa/sql/new');
}

applyPolicy().catch(console.error);

