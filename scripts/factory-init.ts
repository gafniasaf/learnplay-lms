import fs from 'fs';
import path from 'path';

const projectName = process.argv[2];

if (!projectName) {
  console.error('❌ Usage: npm run factory:init <ProjectName>');
  process.exit(1);
}

const slug =
  projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';

const rootDir = process.cwd();
const templateDir = path.join(rootDir, 'cursor-playground', 'template');
const workspacesDir = path.join(rootDir, 'cursor-playground', 'workspaces');
const targetDir = path.join(workspacesDir, slug);

if (!fs.existsSync(templateDir)) {
  console.error('❌ Missing cursor-playground/template.');
  process.exit(1);
}

if (!fs.existsSync(workspacesDir)) {
  fs.mkdirSync(workspacesDir, { recursive: true });
}

if (fs.existsSync(targetDir)) {
  console.error('❌ Workspace already exists: ' + targetDir);
  process.exit(1);
}

fs.cpSync(templateDir, targetDir, { recursive: true });

const placeholderFiles = ['system-manifest.json', 'PLAN.md', 'user_journey.md'];
placeholderFiles.forEach((file) => {
  const filePath = path.join(targetDir, file);
  if (fs.existsSync(filePath)) {
    const contents = fs.readFileSync(filePath, 'utf-8');
    fs.writeFileSync(filePath, contents.replace(/\{\{PROJECT_NAME\}\}/g, projectName));
  }
});

const mockupDir = path.join(targetDir, 'mockups');
if (fs.existsSync(mockupDir)) {
  const files = fs.readdirSync(mockupDir);
  files.forEach((file) => {
    const mockupPath = path.join(mockupDir, file);
    const contents = fs.readFileSync(mockupPath, 'utf-8');
    fs.writeFileSync(mockupPath, contents.replace(/\{\{PROJECT_NAME\}\}/g, projectName));
  });
}

console.log('\n🏗️  Workspace created: ' + targetDir);
console.log('\nNext steps:');
console.log('1. Open this folder in Cursor.');
console.log('2. Fill in manifest, plan, journey, and mockups.');
console.log('3. Run `npm run factory:guard <workspace>` until it passes.');
console.log('4. Hand off to Ignite Zero with `npm run factory <workspace>` when approved.');
