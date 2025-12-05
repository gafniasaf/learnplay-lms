const fs = require('fs');
const path = require('path');

const mockupsDir = path.join(process.cwd(), 'mockups');
const coveragePath = path.join(mockupsDir, 'coverage.json');

console.log('Mockups dir:', mockupsDir);
console.log('Exists:', fs.existsSync(mockupsDir));

const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
console.log('Coverage routes:', coverage.routes.length);

for (const route of coverage.routes) {
  for (const state of route.states) {
    const statePath = path.join(mockupsDir, state.file);
    const exists = fs.existsSync(statePath);
    if (!exists) {
      console.log('MISSING:', state.file, 'for route', route.path);
    }
  }
}

// List all HTML files
function getAllFiles(dir, ext = '.html') {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(path.relative(mockupsDir, fullPath));
    }
  }
  return results;
}

const htmlFiles = getAllFiles(mockupsDir);
console.log('HTML files found:', htmlFiles.length);
htmlFiles.forEach(f => console.log('  -', f));



