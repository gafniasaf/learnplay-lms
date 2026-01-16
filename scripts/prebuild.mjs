import { spawnSync } from "node:child_process";

function truthy(v) {
  return /^(1|true|yes)$/i.test(String(v || "").trim());
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: true });
  if (res.status && res.status !== 0) {
    process.exit(res.status);
  }
  if (res.error) {
    console.error(res.error);
    process.exit(1);
  }
}

const shouldTypecheck = !truthy(process.env.PREBUILD_SKIP_TYPECHECK);
const shouldCodegen = !truthy(process.env.PREBUILD_SKIP_CODEGEN);
const shouldVerify = truthy(process.env.PREBUILD_VERIFY);

console.log(`[prebuild] typecheck=${shouldTypecheck} codegen=${shouldCodegen} verify=${shouldVerify}`);

if (shouldTypecheck) run("npm", ["run", "typecheck"]);
if (shouldCodegen) run("npm", ["run", "codegen"]);
if (shouldVerify) {
  run("npm", ["run", "verify"]);
} else {
  console.log("[prebuild] Skipping verify (set PREBUILD_VERIFY=1 to enable).");
}
