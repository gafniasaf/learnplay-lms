import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function removeIfExists(target: string) {
  const targetPath = path.join(root, target);
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function writeStubRoutes() {
  const stub = `import React from "react";

export const generatedRouteElements: React.ReactElement[] = [];

export const GeneratedRoutes = () => null;

export const GeneratedFallback = () => (
  <div className="p-6 text-sm text-muted-foreground">
    No generated routes compiled yet. Run the Factory to generate pages.
  </div>
);
`;
  fs.writeFileSync(path.join(root, "src", "routes.generated.tsx"), stub, "utf-8");
}

function cleanEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  const keepLines = fs
    .readFileSync(envPath, "utf-8")
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.trim() &&
        !line.startsWith("VITE_BYPASS_AUTH") &&
        !line.startsWith("VITE_MCP_BASE_URL")
    );
  if (keepLines.length === 0) {
    fs.rmSync(envPath);
  } else {
    fs.writeFileSync(envPath, `${keepLines.join("\n")}\n`, "utf-8");
  }
}

function main() {
  console.log("🧹 Resetting generated artifacts...");
  removeIfExists("src/pages/generated");
  fs.mkdirSync(path.join(root, "src", "pages", "generated", "pages"), { recursive: true });
  removeIfExists("generated");
  fs.mkdirSync(path.join(root, "generated"), { recursive: true });
  writeStubRoutes();
  cleanEnvLocal();
  console.log("✅ Factory reset complete. Generated artifacts removed.");
}

main();

