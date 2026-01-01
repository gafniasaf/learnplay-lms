#!/usr/bin/env npx tsx
/**
 * Ensure learnplay.env contains the required Playwright live E2E credentials.
 *
 * Why:
 * - The full `npm run e2e:live` suite requires E2E_TEACHER_EMAIL/PASSWORD, E2E_STUDENT_EMAIL/PASSWORD, E2E_PARENT_EMAIL/PASSWORD.
 * - These values are local-only (learnplay.env is gitignored).
 *
 * Rules:
 * - NEVER print secret values (passwords, keys).
 * - Idempotent: only adds missing keys; never overwrites existing values.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import crypto from "crypto";

function hasKey(content: string, key: string): boolean {
  const re = new RegExp(`^\\s*${key}\\s*=`, "m");
  return re.test(content);
}

function randomPassword(): string {
  // Strong-ish password: includes upper/lower/number/symbol; no whitespace.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const symbols = "!@#$%^&*-_=+";
  const bytes = crypto.randomBytes(24);
  const chars: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    if (i % 7 === 0) chars.push(symbols[b % symbols.length]!);
    else chars.push(alphabet[b % alphabet.length]!);
  }
  // Ensure at least one leading letter (some auth UIs can be picky)
  return `E2E${chars.join("")}`;
}

function main() {
  const envPath = path.resolve(process.cwd(), "learnplay.env");
  if (!existsSync(envPath)) {
    throw new Error("BLOCKED: learnplay.env not found (expected at repo root).");
  }

  let content = readFileSync(envPath, "utf-8");
  const addedKeys: string[] = [];

  const ensure = (key: string, value: string) => {
    if (hasKey(content, key)) return;
    content = `${content.trimEnd()}\n${key}=${value}\n`;
    addedKeys.push(key);
  };

  // Emails (not secrets, but still local-only)
  ensure("E2E_TEACHER_EMAIL", "e2e-teacher@learnplay.dev");
  ensure("E2E_STUDENT_EMAIL", "e2e-student@learnplay.dev");
  ensure("E2E_PARENT_EMAIL", "e2e-parent@learnplay.dev");

  // Passwords (secrets)
  ensure("E2E_TEACHER_PASSWORD", randomPassword());
  ensure("E2E_STUDENT_PASSWORD", randomPassword());
  ensure("E2E_PARENT_PASSWORD", randomPassword());

  if (addedKeys.length === 0) {
    console.log("[ensure-e2e-credentials] OK (no changes)");
    return;
  }

  writeFileSync(envPath, content, "utf-8");
  console.log(`[ensure-e2e-credentials] Added ${addedKeys.length} keys: ${addedKeys.join(", ")}`);
  console.log("[ensure-e2e-credentials] Next: run `npx tsx scripts/provision-e2e-users.ts` (no secrets printed).");
}

main();



