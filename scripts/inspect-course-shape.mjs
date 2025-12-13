import fs from "node:fs";

const cfg = JSON.parse(fs.readFileSync("public/app-config.json", "utf8"));
const base = cfg?.supabase?.url;
const apikey = cfg?.supabase?.publishableKey;

if (!base || !apikey) {
  console.error("❌ Missing supabase url/key in public/app-config.json");
  process.exit(1);
}

async function get(path) {
  const res = await fetch(`${base}${path}`, {
    headers: { apikey, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  return { status: res.status, json, text: text.slice(0, 800) };
}

function unwrapCourse(raw) {
  if (!raw || typeof raw !== "object") return null;
  return raw.course ?? raw.data?.course ?? raw.content ?? raw.envelope ?? raw.value ?? null;
}

const list = await get("/functions/v1/list-courses?limit=10");
console.log("list-courses status:", list.status);
if (!list.json) {
  console.log("list-courses body:", list.text);
  process.exit(1);
}

const items = list.json.items || list.json.courses || [];
console.log("courses:", items.map((i) => i.id));

for (const c of items.slice(0, 3)) {
  const r = await get(`/functions/v1/get-course?courseId=${encodeURIComponent(c.id)}`);
  const keys = r.json ? Object.keys(r.json) : [];
  console.log("\nget-course:", c.id, "status:", r.status, "keys:", keys);
  if (!r.json) {
    console.log("body:", r.text);
    continue;
  }
  const hasItems = Array.isArray(r.json.items);
  console.log("  has items[]:", hasItems);
  if (!hasItems) {
    const wrapped = unwrapCourse(r.json);
    if (wrapped && typeof wrapped === "object") {
      console.log("  wrapped keys:", Object.keys(wrapped));
      console.log("  wrapped has items[]:", Array.isArray(wrapped.items));
    }
    console.log("  sample:", JSON.stringify(r.json).slice(0, 300));
  }
}


