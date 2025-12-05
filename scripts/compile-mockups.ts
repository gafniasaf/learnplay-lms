import fs from "node:fs";
import path from "node:path";
import { parse, HTMLElement } from "node-html-parser";

const WORKSPACE = process.argv[2];
if (!WORKSPACE) {
  console.error("❌ Usage: npx tsx scripts/compile-mockups.ts <workspace>");
  process.exit(1);
}
const ws = path.resolve(WORKSPACE);
const mockupsDir = path.join(ws, "mockups");
if (!fs.existsSync(mockupsDir)) {
  console.error("❌ mockups/ not found in workspace");
  process.exit(1);
}

const outDir = path.join(process.cwd(), "src", "pages", "generated");
fs.mkdirSync(outDir, { recursive: true });
const pagesDir = path.join(outDir, "pages");
fs.mkdirSync(pagesDir, { recursive: true });

const coveragePath = path.join(mockupsDir, "coverage.json");
if (!fs.existsSync(coveragePath)) {
  console.error("❌ docs/mockups/coverage.json is required before compilation");
  process.exit(1);
}

type Cta = {
  id: string;
  action: "navigate" | "enqueueJob" | "save";
  target?: string;
  jobType?: string;
  entity?: string;
  form?: string;
  payload?: Record<string, string>;
};
type FieldDef = { name: string; type: string; formId: string };
type PageDef = { route: string; title: string; ctas: Cta[]; fields: FieldDef[]; slug: string; htmlPath: string };
const pages: PageDef[] = [];

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "page";
}

function resolveFormId(node: HTMLElement | null): string {
  let current: HTMLElement | null = node;
  while (current) {
    const attr = current.getAttribute("data-form-id");
    if (attr) return attr;
    current = current.parentNode as HTMLElement | null;
  }
  return "default";
}

function cssPropToCamelCase(prop: string) {
  return prop
    .trim()
    .replace(/^-/, "")
    .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function styleStringToObjectLiteral(style: string) {
  const entries = style
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const [rawKey, ...rawValue] = segment.split(":");
      if (!rawKey || rawValue.length === 0) return null;
      const key = cssPropToCamelCase(rawKey);
      const value = rawValue.join(":").trim();
      return `"${key}": ${JSON.stringify(value)}`;
    })
    .filter(Boolean);

  if (!entries.length) {
    return "{}";
  }

  return `{ ${entries.join(", ")} }`;
}

function unescapeHtml(str: string) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/__GT__/g, ">");
}

function escapeJsx(str: string) {
  return str.replace(/>/g, "__GT__");
}

type Coverage = {
  routes: Array<{
    name: string;
    states: Array<{ file: string }>;
    requiredCTAs?: Array<{ id: string; action?: string }>;
  }>;
};

const coverage: Coverage = JSON.parse(fs.readFileSync(coveragePath, "utf-8"));
const ctaCache = new Map<string, Map<string, { action?: string | null }>>();

function ensureCoverageGuard() {
  for (const route of coverage.routes) {
    const ctaMap = new Map<string, { action?: string | null }>();
    for (const state of route.states) {
      const relPath = state.file;
      const statePath = path.join(mockupsDir, relPath);
      if (!fs.existsSync(statePath)) {
        throw new Error(`Coverage violation: missing mock file ${relPath} for route ${route.name}`);
      }
      if (!ctaCache.has(relPath)) {
        const html = fs.readFileSync(statePath, "utf-8");
        const dom = parse(html);
        const map = new Map<string, { action?: string | null }>();
        dom.querySelectorAll("[data-cta-id]").forEach((node) => {
          const id = node.getAttribute("data-cta-id");
          if (!id) return;
          map.set(id, { action: node.getAttribute("data-action") });
        });
        ctaCache.set(relPath, map);
      }
      ctaCache.get(relPath)!.forEach((meta, id) => {
        if (!ctaMap.has(id)) {
          ctaMap.set(id, meta);
        }
      });
    }

    (route.requiredCTAs || []).forEach((required) => {
      const meta = ctaMap.get(required.id);
      if (!meta) {
        throw new Error(`Coverage violation: CTA "${required.id}" missing for route ${route.name}`);
      }
      if (required.action && meta.action !== required.action) {
        throw new Error(
          `Coverage violation: CTA "${required.id}" in route ${route.name} expected action "${required.action}" but found "${meta.action || "none"}"`
        );
      }
    });
  }
  console.log("✅ Coverage matrix satisfied – continuing compilation");
}

ensureCoverageGuard();

// Recursively find all HTML files in mockups directory
function getAllHtmlFiles(dir: string, baseDir: string = dir): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllHtmlFiles(fullPath, baseDir));
    } else if (entry.name.endsWith(".html") && entry.name !== "layout.html") {
      // Return relative path from baseDir
      results.push(path.relative(baseDir, fullPath));
    }
  }
  return results;
}

const htmlFiles = getAllHtmlFiles(mockupsDir);
console.log(`📁 Found ${htmlFiles.length} HTML mockup files`);

for (const file of htmlFiles) {
  const htmlPath = path.join(mockupsDir, file);
  const html = fs.readFileSync(htmlPath, "utf-8");
  const dom = parse(html);

  const routeMatch = html.match(/data-route=["']([^"']+)["']/i);
  const route = routeMatch ? routeMatch[1] : `/${slugify(file)}`;
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.html$/, "");

  const ctas: Cta[] = [];
  dom.querySelectorAll("[data-cta-id]").forEach((node) => {
    const id = node.getAttribute("data-cta-id");
    if (!id) return;
    const action = (node.getAttribute("data-action") as Cta["action"]) || "navigate";
    const target = node.getAttribute("data-target") || undefined;
    const jobType = node.getAttribute("data-job-type") || undefined;
    const entity = node.getAttribute("data-entity") || undefined;
    const form = node.getAttribute("data-form") || undefined;
    const payload: Record<string, string> = {};
    node.attributes &&
      Object.entries(node.attributes)
        .filter(([key]) => key.startsWith("data-payload-"))
        .forEach(([key, value]) => {
          payload[key.replace("data-payload-", "")] = value;
        });
    ctas.push({
      id,
      action,
      target,
      jobType,
      entity,
      form,
      payload: Object.keys(payload).length ? payload : undefined,
    });
  });

  const rawFields: FieldDef[] = [];
  dom.querySelectorAll("[data-field]").forEach((node) => {
    const name = node.getAttribute("data-field");
    if (!name) return;
    const type = node.getAttribute("type") || "text";
    const formId = resolveFormId(node as HTMLElement);
    rawFields.push({ name, type, formId });
  });

  const dedupedFieldsMap = new Map<string, FieldDef>();
  rawFields.forEach((field) => {
    const key = `${field.formId}::${field.name}`;
    if (!dedupedFieldsMap.has(key)) {
      dedupedFieldsMap.set(key, field);
    }
  });

  const fields = Array.from(dedupedFieldsMap.values());

  // Create slug from file path (e.g., "student/dashboard.html" -> "student-dashboard")
  const slugFromPath = file.replace(/\.html$/, "").replace(/[\/\\]/g, "-");
  pages.push({ route, title, ctas, fields, slug: slugify(slugFromPath), htmlPath });
}

// Write page components
for (const p of pages) {
  const hasFields = p.fields.length > 0;
  const saveEntity = p.ctas.find((c) => c.action === "save")?.entity || "Record";

  const groupedForms = p.fields.reduce<Record<string, FieldDef[]>>((acc, field) => {
    acc[field.formId] = acc[field.formId] || [];
    acc[field.formId].push(field);
    return acc;
  }, {});

  const stateDecls = hasFields
    ? p.fields.map((f) => `const [${f.name}, set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}] = React.useState("");`).join("\n  ")
    : "";

  const payloadByForm: Record<string, string> = {};
  Object.entries(groupedForms).forEach(([formId, fields]) => {
    payloadByForm[formId] = fields.length ? `{ ${fields.map((f) => f.name).join(", ")} }` : "{}";
  });
  if (!payloadByForm["default"]) {
    payloadByForm["default"] = "{}";
  }

  // ---------------------------------------------------------
  // DOM Transformation Logic
  // ---------------------------------------------------------
  const html = fs.readFileSync(p.htmlPath, "utf-8");
  const dom = parse(html);
  const body = dom.querySelector("body");
  
  if (body) {
    // 1. React-ify attributes
    body.querySelectorAll("*").forEach(el => {
      if (el.hasAttribute("class")) {
        el.setAttribute("className", el.getAttribute("class")!);
        el.removeAttribute("class");
      }
      if (el.hasAttribute("for")) {
        el.setAttribute("htmlFor", el.getAttribute("for")!);
        el.removeAttribute("for");
      }
      if (el.hasAttribute("colspan")) {
        el.setAttribute("colSpan", el.getAttribute("colspan")!);
        el.removeAttribute("colspan");
      }
      if (el.hasAttribute("rowspan")) {
        el.setAttribute("rowSpan", el.getAttribute("rowspan")!);
        el.removeAttribute("rowspan");
      }
      if (el.hasAttribute("rows")) {
        const rowsVal = el.getAttribute("rows");
        if (rowsVal && !Number.isNaN(Number(rowsVal))) {
          el.setAttribute("rows", `__JSX_OPEN__${Number(rowsVal)}__JSX_CLOSE__`);
        }
      }
      if (el.hasAttribute("cols")) {
        const colsVal = el.getAttribute("cols");
        if (colsVal && !Number.isNaN(Number(colsVal))) {
          el.setAttribute("cols", `__JSX_OPEN__${Number(colsVal)}__JSX_CLOSE__`);
        }
      }
      if (el.hasAttribute("style")) {
        const styleAttr = el.getAttribute("style")!;
        if (!styleAttr.includes("__JSX_OPEN__")) {
          const literal = styleStringToObjectLiteral(styleAttr);
          el.setAttribute("style", `__JSX_OPEN__${literal}__JSX_CLOSE__`);
        }
      }
    });

    // 2. Bind Fields
    p.fields.forEach(f => {
      const el = body.querySelector(`[data-field="${f.name}"]`);
      if (el) {
        const setter = `set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}`;
        
        if (el.getAttribute("data-format") === "html") {
            el.setAttribute("dangerouslySetInnerHTML", `__JSX_OPEN__{ __html: ${f.name} }__JSX_CLOSE__`);
            el.set_content("");
        } else if (el.getAttribute("data-format") === "style-width") {
            el.setAttribute("style", `__JSX_OPEN__{ width: \`\${${f.name}}%\` }__JSX_CLOSE__`);
            el.set_content("");
        } else if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) {
            el.setAttribute("value", `__JSX_OPEN__${f.name}__JSX_CLOSE__`);
            el.setAttribute("onChange", `__JSX_OPEN__${escapeJsx(`(e) => ${setter}(e.target.value)`)}__JSX_CLOSE__`);
            if (el.tagName === "TEXTAREA") {
              el.set_content(""); // Clear inner text
            }
        } else {
             // Generic display
             el.set_content(`__JSX_OPEN__${f.name}__JSX_CLOSE__`);
        }
      }
    });

    // 3. Bind CTAs
    p.ctas.forEach(c => {
      const el = body.querySelector(`[data-cta-id="${c.id}"]`);
      if (el) {
        let handler = "";
        if (c.action === "navigate") {
          handler = `() => nav("${c.target || "/"}")`;
        } else if (c.action === "enqueueJob") {
          const targetForm = c.form;
          const payloadExpr = targetForm ? (payloadByForm[targetForm] || "{}") : JSON.stringify(c.payload || {});
          // Merge ID into payload
          const finalPayload = `{ planBlueprintId: id, ...(${payloadExpr}) }`;
          handler = `async () => {
            try {
              await mcp.enqueueJob("${c.jobType || "job"}", ${finalPayload});
              toast.success("Job enqueued: ${c.id}");
            } catch (e) {
              toast.error("Job failed: ${c.id}");
            }
          }`;
        } else { // save
          const targetForm = c.form || "default";
          const payloadExpr = payloadByForm[targetForm] || "{}";
          // Merge ID into payload (though saveRecord mainly needs entity+values, ID might be in values)
          const finalPayload = `{ id, ...(${payloadExpr}) }`; 
          handler = `async () => {
            try {
              await mcp.saveRecord("${c.entity || saveEntity}", ${finalPayload});
              toast.success("Saved: ${c.id}");
            } catch (e) {
              toast.error("Save failed: ${c.id}");
            }
          }`;
        }
        el.setAttribute("onClick", `__JSX_OPEN__${escapeJsx(handler)}__JSX_CLOSE__`);
        
        // Ensure buttons are type="button" to prevent form submit reload unless specified
        if (el.tagName === "BUTTON" && !el.getAttribute("type")) {
          el.setAttribute("type", "button");
        }
      }
    });
  }

  let jsx = body ? body.innerHTML : "";
  
  // Fix self-closing tags for JSX
  const voidTags = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];
  voidTags.forEach(tag => {
    const regex = new RegExp(`<${tag}([^>]*?)>`, 'gi');
    jsx = jsx.replace(regex, (match, attrs) => {
        if (attrs.trim().endsWith('/')) return match; 
        return `<${tag}${attrs} />`;
    });
  });

  // Unescape JSX placeholders - handle both quoted attributes and text content
  jsx = jsx.replace(/"__JSX_OPEN__([\s\S]*?)__JSX_CLOSE__"/g, (match, content) => {
    return `{${unescapeHtml(content)}}`;
  });
  
  // Also handle unquoted placeholders in text nodes
  jsx = jsx.replace(/__JSX_OPEN__([\s\S]*?)__JSX_CLOSE__/g, (match, content) => {
    return `{${unescapeHtml(content)}}`;
  });

  // Determine entity type from body data-entity or route pattern
  const bodyEntity = body?.getAttribute("data-entity") || "";
  const entitySlug = bodyEntity ? bodyEntity.toLowerCase().replace(/([A-Z])/g, '-$1').replace(/^-/, '') : "";
  
  // Map entity names to DawnDataContext keys
  const entityToContextKey: Record<string, string> = {
    // LearnPlay entities
    "learner-profile": "learnerProfiles",
    "learnerprofile": "learnerProfiles",
    "assignment": "assignments",
    "course-blueprint": "courseBlueprints",
    "courseblueprint": "courseBlueprints",
    "message-thread": "messageThreads",
    "messagethread": "messageThreads",
    "job-ticket": "jobTickets",
    "jobticket": "jobTickets",
    "session-event": "sessionEvents",
    "sessionevent": "sessionEvents",
    "goal-update": "goalUpdates",
    "goalupdate": "goalUpdates",
    // Legacy mappings (for compatibility)
    "course": "courses",
    "class": "classes",
    "student-profile": "studentProfiles",
    "studentprofile": "studentProfiles",
    "tag": "tags",
    "message": "messages",
  };
  const contextKey = entityToContextKey[entitySlug] || "";

  const pageTsx = `
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";
import { useDawnData } from "@/contexts/DawnDataContext";

export default function ${p.slug.split(/[-_]/).map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join('').replace(/(^\d|[^a-zA-Z0-9_])/g, "_")}() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  const dawnData = useDawnData();
  ${stateDecls}

  // Get entity data from context
  const contextKey = "${contextKey}";
  const entityList = contextKey ? (dawnData as any)[contextKey] || [] : [];
  const currentRecord = id && entityList.length ? entityList.find((r: any) => r.id === id) : null;

  React.useEffect(() => {
    if (id) {
      // Check if body has data-entity to enable fetching
      const entity = "${bodyEntity}";
      if (entity) {
        mcp.getRecord(entity, id).then((data: any) => {
          if (data) {
            ${p.fields.map(f => `if (data.${f.name} !== undefined) set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}(data.${f.name});`).join('\n            ')}
          }
        }).catch(console.error);
      }
    }
  }, [id]);

  // Populate fields from context data when available
  React.useEffect(() => {
    if (currentRecord) {
      ${p.fields.map(f => `if (currentRecord.${f.name} !== undefined) set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}(currentRecord.${f.name});`).join('\n      ')}
    }
  }, [currentRecord]);

  return (
    <div className="p-6">
      ${jsx}
    </div>
  );
}
`;
  fs.writeFileSync(path.join(pagesDir, `${p.slug}.tsx`), pageTsx, "utf-8");
}

// Write routes component and routes.json
const routesJson = pages.map((p) => ({ route: p.route, title: p.title, ctas: p.ctas, fields: p.fields }));
fs.mkdirSync(path.join(process.cwd(), "generated"), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), "generated", "routes.json"), JSON.stringify(routesJson, null, 2));

const routesTsx = `
/**
 * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
 * Generated via scripts/compile-mockups.ts
 */
import React from "react";
import { Route } from "react-router-dom";
${pages
  .map((p, i) => `const Page${i} = React.lazy(() => import("./pages/generated/pages/${p.slug}"));`)
  .join("\n")}

const generatedRouteCount = ${pages.length};

export const generatedRouteElements = [
${pages
  .map((p, i) => {
    const abs = p.route.startsWith("/") ? p.route : `/${p.route}`;
    return `  <Route key="gen-${i}" path="${abs}" element={<Page${i} />} />,`;
  })
  .join("\n")}
];

export const GeneratedRoutes = () => {
  if (!generatedRouteCount) return null;
  return <>{generatedRouteElements}</>;
};

export const GeneratedFallback = () => {
  if (generatedRouteCount) return null;
  return (
    <div className="p-6 text-sm text-muted-foreground">
      No generated routes compiled. Run the Factory to generate mockup-driven pages.
    </div>
  );
};
`;
fs.writeFileSync(path.join(process.cwd(), "src", "routes.generated.tsx"), routesTsx, "utf-8");
console.log(`✨ Compiled ${pages.length} mockup pages into src/pages/generated`);

// Copy supplemental mockup previews (iframe content) into public assets
const previewHtmlPath = path.join(mockupsDir, "html-preview.html");
if (fs.existsSync(previewHtmlPath)) {
  const generatedDir = path.join(process.cwd(), "public", "generated");
  fs.mkdirSync(generatedDir, { recursive: true });
  const dest = path.join(generatedDir, "html-preview.html");
  fs.copyFileSync(previewHtmlPath, dest);
  console.log(`📸 Copied mockup preview to ${path.relative(process.cwd(), dest)}`);
}
