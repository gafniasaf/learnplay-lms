#!/usr/bin/env ts-node
import { run } from "../lms-mcp/src/handlers/uiAudit.ts";

async function main() {
  const res = await run();
  if (res.ok) {
    console.log("✔ UI wiring valid — no broken actions");
  } else {
    console.error(`❌ UI Audit failed — ${res.issues.length} issues`);
  }
  for (const i of res.issues) {
    const loc = i.line ? `${i.file}:${i.line}` : i.file;
    console.log(`- [${i.severity || "error"}] ${i.type} @ ${loc}`);
    console.log(`  ${i.detail}`);
    if (i.suggestion) console.log(`  Suggestion: ${i.suggestion}`);
  }
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


