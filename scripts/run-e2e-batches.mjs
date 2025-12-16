/**
 * Run Playwright tests in small sequential batches to avoid hangs and make progress observable.
 *
 * Examples:
 *   node scripts/run-e2e-batches.mjs --dir tests/e2e --batchSize 8 --workers 1
 *   node scripts/run-e2e-batches.mjs --dir tests/e2e/legacy-parity --batchSize 4 --resume
 *   node scripts/run-e2e-batches.mjs --config playwright.real-db.config.ts --dir tests/e2e/legacy-parity --batchSize 2 --resume
 *
 * Pass-through args after `--` are forwarded to `playwright test`.
 *   node scripts/run-e2e-batches.mjs --batchSize 6 -- --reporter=list
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();

function usage(exitCode = 0) {
  // Intentionally concise; file paths/flags only.
  // eslint-disable-next-line no-console
  console.log(`
Usage:
  node scripts/run-e2e-batches.mjs [options] [-- <playwright args...>]

Options:
  --config <file>         Playwright config file (optional)
  --dir <path>            Directory to scan (default: tests/e2e)
  --batchSize <n>         Specs per batch (default: 8)
  --workers <n>           Playwright workers per batch (default: 1)
  --timeoutMs <n>         Kill a batch if it runs longer than n ms (optional)
  --continueOnFail        Keep running remaining batches even if one fails/timeouts
  --include <substr>      Only include specs whose path includes this substring (repeatable)
  --exclude <substr>      Exclude specs whose path includes this substring (repeatable)
  --from <n>              Start from batch index n (0-based)
  --only <n>              Run only batch index n (0-based)
  --resume                Resume from checkpoint file
  --stateFile <path>      Checkpoint file (default: .cache/e2e-batches.state.json)
  --dry                   Print batches without running

Examples:
  node scripts/run-e2e-batches.mjs --dir tests/e2e/legacy-parity --batchSize 4 --resume
  node scripts/run-e2e-batches.mjs --config playwright.real-db.config.ts --dir tests/e2e/legacy-parity --batchSize 2 -- --reporter=list
`.trim());
  process.exit(exitCode);
}

function parseArgs(argv) {
  const opts = {
    config: undefined,
    dir: "tests/e2e",
    batchSize: 8,
    workers: 1,
    timeoutMs: undefined,
    continueOnFail: false,
    include: [],
    exclude: [],
    from: undefined,
    only: undefined,
    resume: false,
    stateFile: ".cache/e2e-batches.state.json",
    dry: false,
    passthrough: [],
  };

  const idxDashDash = argv.indexOf("--");
  const main = idxDashDash === -1 ? argv : argv.slice(0, idxDashDash);
  opts.passthrough = idxDashDash === -1 ? [] : argv.slice(idxDashDash + 1);

  const readVal = (i) => {
    const v = main[i + 1];
    if (!v || v.startsWith("--")) usage(1);
    return v;
  };

  for (let i = 0; i < main.length; i++) {
    const a = main[i];
    if (a === "--help" || a === "-h") usage(0);
    if (a === "--config") opts.config = readVal(i++);
    else if (a === "--dir") opts.dir = readVal(i++);
    else if (a === "--batchSize") opts.batchSize = Number(readVal(i++));
    else if (a === "--workers") opts.workers = Number(readVal(i++));
    else if (a === "--timeoutMs") opts.timeoutMs = Number(readVal(i++));
    else if (a === "--continueOnFail") opts.continueOnFail = true;
    else if (a === "--include") opts.include.push(readVal(i++));
    else if (a === "--exclude") opts.exclude.push(readVal(i++));
    else if (a === "--from") opts.from = Number(readVal(i++));
    else if (a === "--only") opts.only = Number(readVal(i++));
    else if (a === "--stateFile") opts.stateFile = readVal(i++);
    else if (a === "--resume") opts.resume = true;
    else if (a === "--dry") opts.dry = true;
    else usage(1);
  }

  if (!Number.isFinite(opts.batchSize) || opts.batchSize <= 0) {
    throw new Error("--batchSize must be a positive number");
  }
  if (!Number.isFinite(opts.workers) || opts.workers <= 0) {
    throw new Error("--workers must be a positive number");
  }
  if (opts.timeoutMs !== undefined && (!Number.isFinite(opts.timeoutMs) || opts.timeoutMs <= 0)) {
    throw new Error("--timeoutMs must be a positive number");
  }
  if (opts.from !== undefined && (!Number.isFinite(opts.from) || opts.from < 0)) {
    throw new Error("--from must be >= 0");
  }
  if (opts.only !== undefined && (!Number.isFinite(opts.only) || opts.only < 0)) {
    throw new Error("--only must be >= 0");
  }

  return opts;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readState(stateFile) {
  try {
    const raw = fs.readFileSync(stateFile, "utf8");
    const json = JSON.parse(raw);
    if (typeof json !== "object" || json === null) return null;
    return json;
  } catch {
    return null;
  }
}

function writeState(stateFile, state) {
  ensureDir(path.dirname(stateFile));
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
}

function walkSpecs(rootDirAbs) {
  const results = [];

  const stack = [rootDirAbs];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const e of entries) {
      // Skip node_modules and hidden dirs
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        stack.push(path.join(cur, e.name));
        continue;
      }
      if (!e.isFile()) continue;
      if (e.name.endsWith(".spec.ts") || e.name.endsWith(".spec.tsx")) {
        results.push(path.join(cur, e.name));
      }
    }
  }

  results.sort((a, b) => a.localeCompare(b));
  return results;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function rel(p) {
  return path.relative(cwd, p).replaceAll("\\", "/");
}

function run() {
  const opts = parseArgs(process.argv.slice(2));
  const dirAbs = path.resolve(cwd, opts.dir);
  const stateFileAbs = path.resolve(cwd, opts.stateFile);

  if (!fs.existsSync(dirAbs) || !fs.statSync(dirAbs).isDirectory()) {
    throw new Error(`--dir does not exist or is not a directory: ${opts.dir}`);
  }

  const allSpecsAbs = walkSpecs(dirAbs);
  let specsAbs = allSpecsAbs;

  if (opts.include.length) {
    specsAbs = specsAbs.filter((p) => opts.include.every((s) => rel(p).includes(s)));
  }
  if (opts.exclude.length) {
    specsAbs = specsAbs.filter((p) => opts.exclude.every((s) => !rel(p).includes(s)));
  }

  if (specsAbs.length === 0) {
    throw new Error(`No spec files found under: ${opts.dir}`);
  }

  const batchesAbs = chunk(specsAbs, opts.batchSize);

  let startBatch = opts.from ?? 0;
  if (opts.resume) {
    const prev = readState(stateFileAbs);
    if (prev && typeof prev.lastCompletedBatch === "number" && prev.lastCompletedBatch >= -1) {
      startBatch = Math.max(startBatch, prev.lastCompletedBatch + 1);
    }
  }

  const onlyBatch = opts.only;

  // eslint-disable-next-line no-console
  console.log(`[e2e:batch] specs=${specsAbs.length} batches=${batchesAbs.length} batchSize=${opts.batchSize} workers=${opts.workers}`);
  // eslint-disable-next-line no-console
  console.log(
    `[e2e:batch] dir=${opts.dir} config=${opts.config ?? "(default)"} stateFile=${rel(stateFileAbs)} resume=${opts.resume ? "yes" : "no"} ` +
      `timeoutMs=${opts.timeoutMs ?? "(none)"} continueOnFail=${opts.continueOnFail ? "yes" : "no"}`
  );

  const runBatch = (batchIndex, filesAbs) => {
    const filesRel = filesAbs.map(rel);
    // eslint-disable-next-line no-console
    console.log(`\n[e2e:batch] batch ${batchIndex}/${batchesAbs.length - 1} (${filesRel.length} specs)`);
    for (const f of filesRel) {
      // eslint-disable-next-line no-console
      console.log(`  - ${f}`);
    }

    if (opts.dry) return 0;

    const args = ["playwright", "test", ...filesRel, `--workers=${opts.workers}`];
    if (opts.config) args.push(`--config=${opts.config}`);
    if (opts.passthrough.length) args.push(...opts.passthrough);

    const cmd = `npx ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`;
    // eslint-disable-next-line no-console
    console.log(`[e2e:batch] run: ${cmd}`);

    const res = spawnSync("npx", args, {
      stdio: "inherit",
      cwd,
      shell: process.platform === "win32",
      timeout: opts.timeoutMs,
    });
    // If spawnSync timed out, status is null and error.code is 'ETIMEDOUT'.
    const code = typeof res.status === "number" ? res.status : 1;
    if (res.error && res.error.code === "ETIMEDOUT") {
      // eslint-disable-next-line no-console
      console.error(`[e2e:batch] TIMEOUT: batch ${batchIndex} exceeded ${opts.timeoutMs}ms`);
    }
    return code;
  };

  if (onlyBatch !== undefined) {
    if (onlyBatch < 0 || onlyBatch >= batchesAbs.length) {
      throw new Error(`--only ${onlyBatch} is out of range (0..${batchesAbs.length - 1})`);
    }
    const code = runBatch(onlyBatch, batchesAbs[onlyBatch]);
    process.exit(code);
  }

  if (startBatch >= batchesAbs.length) {
    // eslint-disable-next-line no-console
    console.log(`[e2e:batch] Nothing to run (startBatch=${startBatch}, batches=${batchesAbs.length}).`);
    process.exit(0);
  }

  // Write initial state for traceability.
  writeState(stateFileAbs, {
    dir: rel(dirAbs),
    batchSize: opts.batchSize,
    workers: opts.workers,
    totalBatches: batchesAbs.length,
    totalSpecs: specsAbs.length,
    startedAt: new Date().toISOString(),
    lastCompletedBatch: startBatch - 1,
  });

  const failures = [];
  for (let i = startBatch; i < batchesAbs.length; i++) {
    const code = runBatch(i, batchesAbs[i]);
    if (code !== 0) {
      failures.push(i);
      writeState(stateFileAbs, {
        ...readState(stateFileAbs),
        failedBatches: failures,
        lastFailedBatch: i,
        lastFailedAt: new Date().toISOString(),
      });
      // eslint-disable-next-line no-console
      console.error(`[e2e:batch] FAILED batch ${i}.`);
      if (!opts.continueOnFail) {
        writeState(stateFileAbs, {
          ...readState(stateFileAbs),
          endedAt: new Date().toISOString(),
          status: "failed",
        });
        // eslint-disable-next-line no-console
        console.error(`[e2e:batch] Stopping early. Re-run with: --resume (or --only ${i})`);
        process.exit(code);
      }
    }
    // Mark completed batch even if continuing after failures (so resume can skip finished work).
    writeState(stateFileAbs, {
      ...readState(stateFileAbs),
      lastCompletedBatch: i,
      lastCompletedAt: new Date().toISOString(),
      failedBatches: failures,
    });
  }

  writeState(stateFileAbs, {
    ...readState(stateFileAbs),
    endedAt: new Date().toISOString(),
    status: failures.length ? "failed" : "ok",
  });

  if (failures.length) {
    // eslint-disable-next-line no-console
    console.error(`\n[e2e:batch] ❌ Completed with failures. Failed batches: ${failures.join(", ")}`);
    process.exit(1);
  } else {
    // eslint-disable-next-line no-console
    console.log(`\n[e2e:batch] ✅ All batches passed.`);
  }
}

try {
  run();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(`[e2e:batch] ❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}


