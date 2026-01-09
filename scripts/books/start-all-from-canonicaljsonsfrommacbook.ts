import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadLocalEnvForTests } from "../../tests/helpers/load-local-env";

loadLocalEnvForTests();

function sha256Hex(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function pickPreferredFile(files: string[]): string {
  // Prefer non-assembled canonical if present
  const nonAssembled = files.filter((f) => !f.toLowerCase().includes(".assembled."));
  const pool = nonAssembled.length ? nonAssembled : files;

  // Prefer MBO_* naming (usually includes ISBN and clearer provenance)
  const mbo = pool.filter((f) => path.basename(f).startsWith("MBO_"));
  if (mbo.length) return mbo.sort()[0];

  return pool.sort()[0];
}

function isRootFile(name: string): boolean {
  return path.basename(name).toUpperCase().startsWith("ROOT__");
}

function runStart(filePath: string) {
  const rel = path.relative(process.cwd(), filePath);
  const cmd = "npx";
  const args = ["tsx", "scripts/books/start-bookgen-from-reference-canonical.ts", rel];
  const r = spawnSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: true });
  const out = String(r.stdout || "").trim();
  const err = String(r.stderr || "").trim();
  const combined = [out, err].filter(Boolean).join("\n");
  let json: any = null;
  try {
    json = out ? JSON.parse(out) : null;
  } catch {
    json = null;
  }
  return {
    ok: r.status === 0 && json?.ok === true,
    exitCode: r.status,
    file: rel,
    stdout: out,
    stderr: err,
    parsed: json,
    combinedPreview: combined.slice(0, 800),
  };
}

async function main() {
  const dir = path.resolve(process.cwd(), "canonicaljsonsfrommacbook");
  if (!readdirSync(dir, { withFileTypes: true }).length) {
    console.log(JSON.stringify({ ok: true, message: "No files found", dir }, null, 2));
    return;
  }

  const allJson = readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .filter((f) => !isRootFile(f));

  // De-dup identical exports by content hash
  const byHash = new Map<string, string[]>();
  for (const name of allJson) {
    const full = path.join(dir, name);
    const buf = readFileSync(full);
    const hash = sha256Hex(buf);
    const list = byHash.get(hash) || [];
    list.push(name);
    byHash.set(hash, list);
  }

  const chosen = Array.from(byHash.entries())
    .map(([hash, files]) => ({ hash, files: files.slice().sort(), chosen: pickPreferredFile(files) }))
    .sort((a, b) => a.chosen.localeCompare(b.chosen));

  const results: any[] = [];
  for (const item of chosen) {
    const filePath = path.join(dir, item.chosen);
    const res = runStart(filePath);
    results.push({
      hash: item.hash,
      chosen: item.chosen,
      duplicates: item.files.length > 1 ? item.files : [],
      ok: res.ok,
      exitCode: res.exitCode,
      parsed: res.parsed,
      preview: res.combinedPreview,
    });
  }

  const outDir = path.resolve(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "start-all-from-canonicaljsonsfrommacbook.report.json");
  writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), dir, results }, null, 2), "utf8");

  const okCount = results.filter((r) => r.ok).length;
  console.log(JSON.stringify({
    ok: true,
    dir: path.relative(process.cwd(), dir),
    uniqueInputs: chosen.length,
    started: okCount,
    failed: results.length - okCount,
    report: path.relative(process.cwd(), outPath),
    startedBooks: results.filter((r) => r.ok).map((r) => ({
      reference: r.chosen,
      bookId: r.parsed?.bookId,
      bookVersionId: r.parsed?.bookVersionId,
      chapterCount: r.parsed?.chapterCount,
      generationJobId: r.parsed?.generationJobId,
    })),
    failures: results.filter((r) => !r.ok).map((r) => ({ reference: r.chosen, preview: r.preview })),
  }, null, 2));
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`❌ start-all-from-canonicaljsonsfrommacbook failed: ${msg}`);
  process.exit(1);
});


