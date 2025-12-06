import { spawnSync } from "node:child_process";
import { existsSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ZIP_NAME = process.env.RELEASE_ZIP_NAME;
if (!ZIP_NAME) {
  console.error('❌ RELEASE_ZIP_NAME is REQUIRED - set env var before running');
  console.error('   Example: RELEASE_ZIP_NAME=ignite-zero-release.zip');
  process.exit(1);
}

const BUCKET = process.env.RELEASE_BUCKET;
if (!BUCKET) {
  console.error('❌ RELEASE_BUCKET is REQUIRED - set env var before running');
  console.error('   Example: RELEASE_BUCKET=releases');
  process.exit(1);
}
const DEST_OBJECT = `${BUCKET}/${ZIP_NAME}`;
const ROOT = process.cwd();
const ZIP_PATH = ZIP_NAME;
const INSTALLER_SCRIPT = path.join(ROOT, "public", "install-factory.ps1");

function readEnvFileValue(file: string, key: string) {
  try {
    if (!existsSync(file)) return null;
    const line = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${key}=`));
    if (!line) return null;
    return line.split("=").slice(1).join("=").trim();
  } catch {
    return null;
  }
}

// Per NO-FALLBACK POLICY: Check multiple sources but fail loudly if none found
let rawSupabaseUrl: string | null = null;

// Check env vars first
if (process.env.VITE_SUPABASE_URL) {
  rawSupabaseUrl = process.env.VITE_SUPABASE_URL;
} else if (process.env.SUPABASE_URL) {
  rawSupabaseUrl = process.env.SUPABASE_URL;
} else {
  // Check env files
  rawSupabaseUrl = readEnvFileValue(path.join(ROOT, ".env.local"), "VITE_SUPABASE_URL");
  if (!rawSupabaseUrl) {
    rawSupabaseUrl = readEnvFileValue(path.join(ROOT, ".env.local"), "SUPABASE_URL");
  }
  if (!rawSupabaseUrl) {
    rawSupabaseUrl = readEnvFileValue(path.join(ROOT, ".env"), "VITE_SUPABASE_URL");
  }
  if (!rawSupabaseUrl) {
    rawSupabaseUrl = readEnvFileValue(path.join(ROOT, ".env"), "SUPABASE_URL");
  }
}

if (!rawSupabaseUrl) {
  console.error('❌ VITE_SUPABASE_URL or SUPABASE_URL is REQUIRED');
  console.error('   Set env var or add to .env.local or .env file');
  process.exit(1);
}

const SUPABASE_URL = rawSupabaseUrl.replace(/\/$/, "");

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")} (code ${result.status})`,
    );
  }
}

function runOptional(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.warn(
      `⚠️  Optional command failed (ignored): ${command} ${args.join(" ")}`,
    );
  }
}

function updateEnvVar(filePath: string, key: string, value: string) {
  try {
    const exists = existsSync(filePath);
    const lines = exists
      ? readFileSync(filePath, "utf8").split(/\r?\n/)
      : [];

    const filtered = lines.filter((line) => !line.startsWith(`${key}=`));
    filtered.push(`${key}=${value}`);

    const cleaned = filtered.filter((line) => line.trim().length > 0);
    writeFileSync(filePath, cleaned.join("\n") + "\n");
    console.log(`Updated ${filePath} with ${key}`);
  } catch (error) {
    console.warn(`⚠️  Failed to update ${filePath}:`, error);
  }
}

async function main() {
  console.log("🧱 Building release archive...");
  if (existsSync(ZIP_PATH)) {
    rmSync(ZIP_PATH);
  }

  run("git", ["archive", "--format=zip", "HEAD", "-o", ZIP_PATH]);

  console.log(`☁️  Uploading to Supabase bucket "${BUCKET}"...`);
  runOptional("supabase", [
    "--experimental",
    "storage",
    "rm",
    `ss:///${DEST_OBJECT}`,
    "--yes",
  ]);
  run("supabase", [
    "--experimental",
    "storage",
    "cp",
    ZIP_PATH,
    `ss:///${DEST_OBJECT}`,
    "--content-type",
    "application/zip",
    "--cache-control",
    "max-age=3600",
  ]);

  if (existsSync(ZIP_PATH)) {
    rmSync(ZIP_PATH);
  }

  if (!SUPABASE_URL) {
    console.warn(
      "⚠️  SUPABASE_URL / VITE_SUPABASE_URL not set. Skipping env update.",
    );
    return;
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${DEST_OBJECT}`;
  updateEnvVar(
    path.join(ROOT, ".env.local"),
    "VITE_RELEASE_ZIP_URL",
    publicUrl,
  );
  updateInstallerScript(publicUrl);

  console.log("✅ Release published!");
  console.log(`URL: ${publicUrl}`);
}

main().catch((error) => {
  console.error("❌ Release publish failed:", error);
  process.exit(1);
});

function updateInstallerScript(url: string) {
  if (!existsSync(INSTALLER_SCRIPT)) {
    return;
  }

  try {
    const content = readFileSync(INSTALLER_SCRIPT, "utf8");
    const pattern = /(\[string\]\$ReleaseUrl\s*=\s*")([^"]+)(")/;
    if (!pattern.test(content)) {
      console.warn(
        "⚠️  Could not auto-update install-factory.ps1 release URL (pattern missing).",
      );
      return;
    }

    const updated = content.replace(pattern, `$1${url}$3`);
    if (updated !== content) {
      writeFileSync(INSTALLER_SCRIPT, updated);
      console.log("Updated public/install-factory.ps1 with latest release URL");
    }
  } catch (error) {
    console.warn("⚠️  Failed to update install-factory.ps1:", error);
  }
}


