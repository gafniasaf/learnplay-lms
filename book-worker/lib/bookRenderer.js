import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

// Node-only wrapper: the shared renderer lives in src/lib/books/bookRendererCore.js so the
// Book Studio UI can use the exact same HTML/CSS output for preview.
export { applyRewritesOverlay, escapeHtml, sanitizeInlineBookHtml, renderBookHtml } from "../../src/lib/books/bookRendererCore.js";

export function resolvePrinceCmd() {
  const raw = process.env.PRINCE_PATH;
  if (raw && typeof raw === "string" && raw.trim()) return raw.trim();
  return "prince";
}

export async function runPrince({ htmlPath, pdfPath, logPath }) {
  const princeCmd = resolvePrinceCmd();
  const args = [htmlPath, "-o", pdfPath];
  const start = Date.now();

  await new Promise((resolve, reject) => {
    const child = spawn(princeCmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      const combined = [out, err].filter(Boolean).join("\n");
      writeFile(logPath, combined || "(no prince output)\n").catch(() => {});
      if (code === 0) return resolve();
      reject(new Error(`Prince failed (exit ${code}). See log: ${logPath}`));
    });
  });

  const durationMs = Date.now() - start;
  return { durationMs };
}

export async function runPrinceRaster({ htmlPath, outPattern, dpi, logPath }) {
  const princeCmd = resolvePrinceCmd();
  const safeDpi = typeof dpi === "number" && Number.isFinite(dpi) && dpi > 0 ? Math.floor(dpi) : 300;
  const args = [
    `--raster-output=${outPattern}`,
    "--raster-format=png",
    "--raster-pages=all",
    `--raster-dpi=${safeDpi}`,
    htmlPath,
  ];
  const start = Date.now();

  await new Promise((resolve, reject) => {
    const child = spawn(princeCmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += d.toString();
    });
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      const combined = [out, err].filter(Boolean).join("\n");
      writeFile(logPath, combined || "(no prince output)\n").catch(() => {});
      if (code === 0) return resolve();
      reject(new Error(`Prince raster failed (exit ${code}). See log: ${logPath}`));
    });
  });

  const durationMs = Date.now() - start;
  return { durationMs };
}


