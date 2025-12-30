#!/usr/bin/env npx tsx
/**
 * Run a single migration file against remote Supabase
 * Usage: npx tsx scripts/run-migration.ts <migration-file.sql>
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error('❌ SUPABASE_URL is REQUIRED - set env var before running');
  process.exit(1);
}

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is REQUIRED - set env var before running');
  process.exit(1);
}

function resolveProjectRef(): string {
  const fromEnv = process.env.SUPABASE_PROJECT_REF;
  if (fromEnv && typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();

  const m = SUPABASE_URL.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  if (m?.[1]) return m[1];

  try {
    const toml = fs.readFileSync(path.join(process.cwd(), "supabase", "config.toml"), "utf-8");
    const m2 = toml.match(/^\s*project_id\s*=\s*\"([a-z0-9]+)\"\s*$/m);
    if (m2?.[1]) return m2[1];
  } catch {
    // ignore
  }

  console.error("❌ SUPABASE_PROJECT_REF is REQUIRED (or SUPABASE_URL must be set to https://<ref>.supabase.co)");
  process.exit(1);
}

async function main() {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    // List pending migrations
    const migrationsDir = path.join(process.cwd(), "supabase/migrations");
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();
    console.log("Available migrations:");
    files.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    console.log("\nUsage: npx tsx scripts/run-migration.ts <migration-file.sql>");
    return;
  }

  const migrationPath = migrationFile.includes("/") 
    ? migrationFile 
    : path.join(process.cwd(), "supabase/migrations", migrationFile);

  if (!fs.existsSync(migrationPath)) {
    console.error(`Migration file not found: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, "utf-8");
  console.log(`Running migration: ${path.basename(migrationPath)}`);
  console.log(`SQL length: ${sql.length} chars`);

  // Use Supabase REST API to execute SQL via the rpc endpoint
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ sql_text: sql }),
  });

  if (!response.ok) {
    // exec_sql might not exist, try direct pg connection via management API
    console.log("exec_sql RPC not available, trying alternative...");

    const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
    if (!SUPABASE_ACCESS_TOKEN) {
      console.error("❌ SUPABASE_ACCESS_TOKEN is REQUIRED to use the Supabase Management API fallback");
      process.exit(1);
    }

    const projectRef = resolveProjectRef();
    
    // Alternative: use the management API
    const mgmtResponse = await fetch(
      `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    if (!mgmtResponse.ok) {
      const errorText = await mgmtResponse.text();
      console.error("Management API error:", mgmtResponse.status, errorText);
      process.exit(1);
    }

    const result = await mgmtResponse.json();
    console.log("✅ Migration applied via Management API");
    console.log(result);
    return;
  }

  const result = await response.json();
  console.log("✅ Migration applied");
  console.log(result);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});

