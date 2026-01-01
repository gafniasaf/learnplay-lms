/**
 * Provision deterministic E2E org + users for REAL DB/LLM Playwright runs.
 *
 * Goals:
 * - No secret printing (keys/passwords never logged)
 * - No fallback org/user assumptions (fail loud when required env is missing)
 * - Idempotent (safe to re-run)
 *
 * Usage:
 *   npx tsx scripts/provision-e2e-users.ts
 *
 * Required env vars (resolved via supabase/.deploy.env and/or learnplay.env):
 * - SUPABASE_URL (or VITE_SUPABASE_URL)
 * - SUPABASE_SERVICE_ROLE_KEY
 * - ORGANIZATION_ID
 * - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
 * - E2E_TEACHER_EMAIL / E2E_TEACHER_PASSWORD
 * - E2E_PARENT_EMAIL / E2E_PARENT_PASSWORD
 * - E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD
 */

import { createClient } from "@supabase/supabase-js";
import { loadLocalEnvForTests } from "../tests/helpers/load-local-env";
import { loadLearnPlayEnv } from "../tests/helpers/parse-learnplay-env";

type Role = "org_admin" | "editor" | "viewer" | "superadmin";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ ${name} is REQUIRED - set env var before running`);
    throw new Error(`${name} is required`);
  }
  return v;
}

function requireEnvBatch(names: string[]): Record<string, string> {
  const missing: string[] = [];
  const out: Record<string, string> = {};
  for (const name of names) {
    const v = process.env[name];
    if (!v) {
      missing.push(name);
    } else {
      out[name] = v;
    }
  }
  if (missing.length) {
    console.error("❌ BLOCKED: Missing required E2E env vars:");
    missing.forEach((n) => console.error(`   - ${n}`));
    console.error("\nFix: add them to learnplay.env (gitignored) or export them in your shell, then re-run.");
    throw new Error(`Missing env vars: ${missing.join(", ")}`);
  }
  return out;
}

function isAlreadyExistsError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes("already") || msg.includes("exists") || msg.includes("duplicate");
}

async function findUserIdByEmail(adminClient: any, email: string): Promise<string | null> {
  // Bound paging to avoid infinite loops on misbehaving APIs.
  const MAX_PAGES = 50;
  const PER_PAGE = 200;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find((u: any) => String(u.email || "").toLowerCase() === email.toLowerCase());
    if (match?.id) return String(match.id);
    // Stop if last page.
    if (users.length < PER_PAGE) break;
  }
  return null;
}

async function ensureOrgExists(adminClient: any, orgId: string): Promise<void> {
  const { data, error } = await adminClient
    .from("organizations")
    .select("id, slug")
    .eq("id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (data?.id) return;

  const slug = `e2e-${orgId.slice(0, 8)}`;
  const { error: insErr } = await adminClient.from("organizations").insert({
    id: orgId,
    name: "E2E Organization",
    slug,
  });
  if (insErr) throw insErr;
}

async function ensureUserRole(adminClient: any, opts: { userId: string; orgId: string; role: Role }): Promise<void> {
  const { data, error } = await adminClient
    .from("user_roles")
    .select("id")
    .eq("user_id", opts.userId)
    .eq("organization_id", opts.orgId)
    .eq("role", opts.role)
    .limit(1);
  if (error) throw error;
  if (Array.isArray(data) && data.length > 0) return;

  const { error: insErr } = await adminClient.from("user_roles").insert({
    user_id: opts.userId,
    organization_id: opts.orgId,
    role: opts.role,
  });
  if (insErr) throw insErr;
}

async function ensureProfile(adminClient: any, opts: { userId: string; fullName: string; roleLabel: string }): Promise<void> {
  // Profiles schema has evolved across migrations; keep this best-effort but fail-loud if the table exists and rejects writes.
  const { error } = await adminClient.from("profiles").upsert(
    {
      id: opts.userId,
      full_name: opts.fullName,
      role: opts.roleLabel,
    },
    { onConflict: "id" }
  );
  if (error) {
    const msg = String((error as any)?.message || "");
    // If profiles table is missing in a given deployment, skip (the rest of auth still works).
    const isMissing = msg.includes("Could not find the table") || msg.toLowerCase().includes("profiles");
    if (!isMissing) throw error;
  }
}

async function ensureUser(opts: {
  adminClient: any;
  orgId: string;
  email: string;
  password: string;
  fullName: string;
  roleLabel: "admin" | "teacher" | "parent" | "student";
  orgRole: Role;
}): Promise<{ userId: string }> {
  const { adminClient, email, password, fullName, roleLabel, orgId, orgRole } = opts;

  let userId = await findUserIdByEmail(adminClient, email);
  if (!userId) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: roleLabel,
        organization_id: orgId,
      },
    });
    if (error) {
      const msg = String((error as any)?.message || "");
      if (!isAlreadyExistsError(msg)) throw error;
      // Race/duplicate: re-fetch.
      userId = await findUserIdByEmail(adminClient, email);
      if (!userId) throw new Error(`Failed to resolve user id after duplicate create for ${email}`);
    } else {
      userId = String(data?.user?.id || "");
      if (!userId) throw new Error(`Failed to create user for ${email} (no user id returned)`);
    }
  }

  // Ensure org claim + role label are present in metadata (auth hook can expose organization_id as top-level JWT claim).
  const { error: metaErr } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: { organization_id: orgId },
    user_metadata: {
      full_name: fullName,
      role: roleLabel,
      organization_id: orgId,
    },
  });
  if (metaErr) throw metaErr;

  await ensureUserRole(adminClient, { userId, orgId, role: orgRole });
  await ensureProfile(adminClient, { userId, fullName, roleLabel });

  return { userId };
}

async function main(): Promise<void> {
  // Attempt to auto-resolve required env vars from local env files (supabase/.deploy.env, learnplay.env), without printing secrets.
  loadLocalEnvForTests();
  loadLearnPlayEnv();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    console.error("❌ SUPABASE_URL (or VITE_SUPABASE_URL) is REQUIRED");
    process.exit(1);
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY is REQUIRED (no fallbacks)");
    process.exit(1);
  }

  const required = requireEnvBatch([
    "ORGANIZATION_ID",
    "E2E_ADMIN_EMAIL",
    "E2E_ADMIN_PASSWORD",
    "E2E_TEACHER_EMAIL",
    "E2E_TEACHER_PASSWORD",
    "E2E_PARENT_EMAIL",
    "E2E_PARENT_PASSWORD",
    "E2E_STUDENT_EMAIL",
    "E2E_STUDENT_PASSWORD",
  ]);

  const orgId = required.ORGANIZATION_ID;
  const adminEmail = required.E2E_ADMIN_EMAIL;
  const adminPassword = required.E2E_ADMIN_PASSWORD;
  const teacherEmail = required.E2E_TEACHER_EMAIL;
  const teacherPassword = required.E2E_TEACHER_PASSWORD;
  const parentEmail = required.E2E_PARENT_EMAIL;
  const parentPassword = required.E2E_PARENT_PASSWORD;
  const studentEmail = required.E2E_STUDENT_EMAIL;
  const studentPassword = required.E2E_STUDENT_PASSWORD;

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await ensureOrgExists(adminClient, orgId);

  const adminUser = await ensureUser({
    adminClient,
    orgId,
    email: adminEmail,
    password: adminPassword,
    fullName: "E2E Admin",
    roleLabel: "admin",
    orgRole: "org_admin",
  });
  const teacherUser = await ensureUser({
    adminClient,
    orgId,
    email: teacherEmail,
    password: teacherPassword,
    fullName: "E2E Teacher",
    roleLabel: "teacher",
    orgRole: "viewer",
  });
  const parentUser = await ensureUser({
    adminClient,
    orgId,
    email: parentEmail,
    password: parentPassword,
    fullName: "E2E Parent",
    roleLabel: "parent",
    orgRole: "viewer",
  });
  const studentUser = await ensureUser({
    adminClient,
    orgId,
    email: studentEmail,
    password: studentPassword,
    fullName: "E2E Student",
    roleLabel: "student",
    orgRole: "viewer",
  });

  // Print only non-secret identifiers.
  console.log("✅ Provisioned E2E org + users (no secrets printed).");
  console.log(`   ORGANIZATION_ID: ${orgId}`);
  console.log(`   admin:   ${adminEmail} (${adminUser.userId})`);
  console.log(`   teacher: ${teacherEmail} (${teacherUser.userId})`);
  console.log(`   parent:  ${parentEmail} (${parentUser.userId})`);
  console.log(`   student: ${studentEmail} (${studentUser.userId})`);
}

main().catch((e) => {
  console.error("❌ Provisioning failed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});


