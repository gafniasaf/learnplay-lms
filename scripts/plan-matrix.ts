import fs from "node:fs";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import http from "node:http";

const plans = ["demo-ecommerce", "demo-hr", "demo-knowledge-base"];

function sh(cmd: string, args: string[], cwd = process.cwd()) {
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: true, cwd });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed with ${res.status}`);
  }
}

function read(p: string) {
  return fs.readFileSync(p, "utf-8");
}
function write(p: string, c: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, c, "utf-8");
}

async function main() {
  const root = process.cwd();
  const rootManifestPath = path.join(root, "system-manifest.json");
  const original = read(rootManifestPath);

  try {
    // Ensure MCP up and seed db (optional, but harmless)
    try { sh("npm", ["run", "mcp:ensure"]); } catch {}
    try { sh("npx", ["tsx", "scripts/seed-local-db.ts"]); } catch {}

    for (const plan of plans) {
      const wsPath = path.join(root, "cursor-playground", "workspaces", plan);
      const packManifest = path.join(wsPath, "system-manifest.json");
      console.log(`\n=== Running Plan: ${plan} ===`);

      // Guard the pack (expects directory path)
      sh("npx", ["tsx", "scripts/factory-guard.ts", wsPath]);

      // Convert pack manifest to root manifest format and write
      const pack = JSON.parse(read(packManifest));
      const rootEnt = pack?.data_model?.root_entities?.[0];
      const childEnt = pack?.data_model?.child_entities?.[0];
      const rootManifest = {
        "$schema": "./schemas/system-manifest.schema.json",
        "system": {
          "name": pack?.branding?.name || "Ignite Zero",
          "description": pack?.branding?.tagline || "Generated from pack",
          "version": "1.0.0"
        },
        "branding": {
          "terminology": {
            "organization": "Workspace",
            "entity_root": rootEnt?.name || "Root",
            "entity_child": childEnt?.name || "Child",
            "consumer": "User"
          }
        },
        "architecture": {
          "storage_strategy": "hybrid_json",
          "proxy_first": true
        },
        "data_model": [
          {
            "name": rootEnt?.name || "RootEntity",
            "type": "root_entity",
            "storage": "json_blob",
            "table_mapping": (rootEnt?.slug || "root") + "s",
            "fields": (rootEnt?.fields || []).map((f: any) => ({
              key: f.name, type: mapFieldType(f.type)
            }))
          },
          {
            "name": childEnt?.name || "ChildEntity",
            "type": "child_entity",
            "storage": "embedded",
            "fields": (childEnt?.fields || []).map((f: any) => ({
              key: f.name, type: mapFieldType(f.type)
            }))
          }
        ],
        "agent_jobs": (pack?.agent_jobs || []).map((j: any) => ({
          id: j.type || j.id || "job",
          trigger: "manual",
          target_entity: (childEnt?.name || "ChildEntity"),
          action: "noop",
          prompt_template: j.description ? `Return a JSON object for: ${j.description}` : undefined,
          ui: { label: "Run", icon: "Wand", placement: "card_action" }
        }))
      };
      function mapFieldType(t: string) {
        switch ((t || "").toLowerCase()) {
          case "string": return "string";
          case "number": return "number";
          case "boolean": return "boolean";
          case "date": return "date";
          case "json": return "json";
          case "enum": return "string";
          default: return "string";
        }
      }
      write(rootManifestPath, JSON.stringify(rootManifest, null, 2));
      sh("npm", ["run", "codegen"]);

      // Compile mockups to runtime pages + generated routes module
      sh("npx", ["tsx", "scripts/compile-mockups.ts", wsPath]);
      
      // Build and preview for this plan
      sh("npm", ["run", "build"]);
      console.log("▶ starting preview server...");
      const preview = spawn("npm", ["run", "preview"], { shell: true, stdio: "ignore" });
      await waitForPort(8080);
      console.log("✓ preview up on 8080");
      // Run CTA wiring E2E
      sh("npm", ["run", "e2e", "tests/e2e/plan-cta.spec.ts"]);
      // Stop preview
      try { process.platform === "win32" ? spawn("taskkill", ["/pid", String(preview.pid), "/f", "/t"]) : preview.kill(); } catch {}
      console.log(`✔ Plan ${plan}: OK`);
    }
  } finally {
    // Restore original manifest and scaffold
    write(rootManifestPath, original);
    sh("npm", ["run", "codegen"]);
  }
}

function waitForPort(port: number, timeoutMs = 20000) {
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const req = http.request({ host: "127.0.0.1", port, path: "/", method: "GET" }, (res) => {
        clearInterval(timer);
        resolve();
        res.resume();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          reject(new Error("preview not reachable"));
        }
      });
      req.end();
    }, 500);
  });
}

main().catch((e) => {
  console.error("Matrix failed:", e.message);
  process.exit(1);
});


