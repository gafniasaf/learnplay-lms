/**
 * LearnPlay Mockup Compiler
 * Compiles HTML mockups from /mockups to React components
 */
const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');

const WORKSPACE = process.cwd();
const mockupsDir = path.join(WORKSPACE, 'mockups');
const outDir = path.join(WORKSPACE, 'src', 'pages', 'generated');
const pagesDir = path.join(outDir, 'pages');

console.log('🔧 LearnPlay Mockup Compiler');
console.log('   Workspace:', WORKSPACE);
console.log('   Mockups:', mockupsDir);
console.log('   Output:', pagesDir);

// Ensure directories exist
fs.mkdirSync(pagesDir, { recursive: true });

// Find all HTML files
function getAllHtmlFiles(dir, baseDir = dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllHtmlFiles(fullPath, baseDir));
    } else if (entry.name.endsWith('.html') && entry.name !== 'layout.html') {
      results.push(path.relative(baseDir, fullPath).replace(/\\/g, '/'));
    }
  }
  return results;
}

const htmlFiles = getAllHtmlFiles(mockupsDir);
console.log(`📁 Found ${htmlFiles.length} HTML mockups`);

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'page';
}

function cssPropToCamelCase(prop) {
  return prop.trim().replace(/^-/, '').replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function styleStringToObjectLiteral(style) {
  const entries = style.split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(segment => {
      const [rawKey, ...rawValue] = segment.split(':');
      if (!rawKey || rawValue.length === 0) return null;
      const key = cssPropToCamelCase(rawKey);
      const value = rawValue.join(':').trim();
      return `"${key}": ${JSON.stringify(value)}`;
    })
    .filter(Boolean);
  return entries.length ? `{ ${entries.join(', ')} }` : '{}';
}

function escapeJsx(str) {
  return str.replace(/>/g, '__GT__');
}

function unescapeHtml(str) {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/__GT__/g, '>');
}

const pages = [];

for (const file of htmlFiles) {
  const htmlPath = path.join(mockupsDir, file);
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const dom = parse(html);

  const routeMatch = html.match(/data-route=["']([^"']+)["']/i);
  const route = routeMatch ? routeMatch[1] : `/${slugify(file)}`;
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.html$/, '');

  const ctas = [];
  dom.querySelectorAll('[data-cta-id]').forEach(node => {
    const id = node.getAttribute('data-cta-id');
    if (!id) return;
    ctas.push({
      id,
      action: node.getAttribute('data-action') || 'navigate',
      target: node.getAttribute('data-target'),
      jobType: node.getAttribute('data-job-type'),
      entity: node.getAttribute('data-entity'),
      form: node.getAttribute('data-form'),
    });
  });

  const fields = [];
  dom.querySelectorAll('[data-field]').forEach(node => {
    const name = node.getAttribute('data-field');
    if (!name) return;
    fields.push({ name, type: node.getAttribute('type') || 'text' });
  });

  const slugFromPath = file.replace(/\.html$/, '').replace(/[\/\\]/g, '-');
  pages.push({ route, title, ctas, fields, slug: slugify(slugFromPath), htmlPath });
}

console.log(`📄 Processing ${pages.length} pages...`);

// Generate page components
for (const p of pages) {
  const html = fs.readFileSync(p.htmlPath, 'utf-8');
  const dom = parse(html);
  const body = dom.querySelector('body');
  
  if (body) {
    // Reactify attributes
    body.querySelectorAll('*').forEach(el => {
      if (el.hasAttribute('class')) {
        el.setAttribute('className', el.getAttribute('class'));
        el.removeAttribute('class');
      }
      if (el.hasAttribute('for')) {
        el.setAttribute('htmlFor', el.getAttribute('for'));
        el.removeAttribute('for');
      }
      if (el.hasAttribute('colspan')) {
        el.setAttribute('colSpan', el.getAttribute('colspan'));
        el.removeAttribute('colspan');
      }
      if (el.hasAttribute('rowspan')) {
        el.setAttribute('rowSpan', el.getAttribute('rowspan'));
        el.removeAttribute('rowspan');
      }
      if (el.hasAttribute('style')) {
        const styleAttr = el.getAttribute('style');
        if (!styleAttr.includes('__JSX_OPEN__')) {
          const literal = styleStringToObjectLiteral(styleAttr);
          el.setAttribute('style', `__JSX_OPEN__${literal}__JSX_CLOSE__`);
        }
      }
    });

    // Bind fields
    p.fields.forEach(f => {
      const el = body.querySelector(`[data-field="${f.name}"]`);
      if (el) {
        const setter = `set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}`;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
          el.setAttribute('value', `__JSX_OPEN__${f.name}__JSX_CLOSE__`);
          el.setAttribute('onChange', `__JSX_OPEN__${escapeJsx(`(e) => ${setter}(e.target.value)`)}__JSX_CLOSE__`);
        } else {
          el.set_content(`__JSX_OPEN__${f.name}__JSX_CLOSE__`);
        }
      }
    });

    // Bind CTAs
    p.ctas.forEach(c => {
      const el = body.querySelector(`[data-cta-id="${c.id}"]`);
      if (el) {
        let handler = '';
        if (c.action === 'navigate') {
          handler = `() => nav("${c.target || '/'}")`;
        } else if (c.action === 'enqueueJob') {
          handler = `async () => {
            try {
              await mcp.enqueueJob("${c.jobType || 'job'}", { planBlueprintId: id });
              toast.success("Job enqueued: ${c.id}");
            } catch (e) {
              toast.error("Job failed: ${c.id}");
            }
          }`;
        } else if (c.action === 'save') {
          handler = `async () => {
            try {
              await mcp.saveRecord("${c.entity || 'Record'}", { id });
              toast.success("Saved: ${c.id}");
            } catch (e) {
              toast.error("Save failed: ${c.id}");
            }
          }`;
        } else {
          handler = `() => toast.info("Action: ${c.id}")`;
        }
        el.setAttribute('onClick', `__JSX_OPEN__${escapeJsx(handler)}__JSX_CLOSE__`);
        if (el.tagName === 'BUTTON' && !el.getAttribute('type')) {
          el.setAttribute('type', 'button');
        }
      }
    });
  }

  let jsx = body ? body.innerHTML : '';
  
  // Fix self-closing tags
  const voidTags = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
  voidTags.forEach(tag => {
    const regex = new RegExp(`<${tag}([^>]*?)>`, 'gi');
    jsx = jsx.replace(regex, (match, attrs) => {
      if (attrs.trim().endsWith('/')) return match;
      return `<${tag}${attrs} />`;
    });
  });

  // Unescape JSX placeholders
  jsx = jsx.replace(/"__JSX_OPEN__([\s\S]*?)__JSX_CLOSE__"/g, (match, content) => `{${unescapeHtml(content)}}`);
  jsx = jsx.replace(/__JSX_OPEN__([\s\S]*?)__JSX_CLOSE__/g, (match, content) => `{${unescapeHtml(content)}}`);

  const stateDecls = p.fields.map(f => 
    `const [${f.name}, set${f.name.charAt(0).toUpperCase() + f.name.slice(1)}] = React.useState("");`
  ).join('\n  ');

  const componentName = p.slug.split(/[-_]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('').replace(/(^\d|[^a-zA-Z0-9_])/g, '_');

  const pageTsx = `
import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useMCP } from "@/hooks/useMCP";

export default function ${componentName}() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id");
  const mcp = useMCP();
  ${stateDecls}

  return (
    <div className="p-6">
      ${jsx}
    </div>
  );
}
`;

  fs.writeFileSync(path.join(pagesDir, `${p.slug}.tsx`), pageTsx, 'utf-8');
  console.log(`   ✓ ${p.slug}.tsx (${p.route})`);
}

// Generate routes file
const routesTsx = `
/**
 * AUTO-GENERATED FILE. DO NOT EDIT MANUALLY.
 * Generated via scripts/compile-learnplay.js
 */
import React from "react";
import { Route } from "react-router-dom";
${pages.map((p, i) => `const Page${i} = React.lazy(() => import("./pages/generated/pages/${p.slug}"));`).join('\n')}

const generatedRouteCount = ${pages.length};

export const generatedRouteElements = [
${pages.map((p, i) => {
  const abs = p.route.startsWith('/') ? p.route : `/${p.route}`;
  return `  <Route key="gen-${i}" path="${abs}" element={<Page${i} />} />,`;
}).join('\n')}
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

fs.writeFileSync(path.join(WORKSPACE, 'src', 'routes.generated.tsx'), routesTsx, 'utf-8');

console.log(`\n✨ Compiled ${pages.length} LearnPlay pages into src/pages/generated`);
console.log(`📝 Routes file: src/routes.generated.tsx`);


