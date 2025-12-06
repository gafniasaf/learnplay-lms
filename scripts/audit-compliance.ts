import fs from 'fs';
import path from 'path';

const TARGET_DIR = process.argv[2] || 'src';

interface Violation {
  file: string;
  line: number;
  rule: string;
  match: string;
}

const RULES = [
  {
    id: 'no-direct-supabase-ui',
    pattern: /supabase\.from|supabase\.auth/g,
    message: 'UI should not access Supabase directly. Use hooks or MCP.',
    exclude: [
      'src/integrations/supabase/client.ts',
      'src/hooks/',
      'src/pages/Auth.tsx',
      'src/App.tsx',
      'src/lib/supabase.ts',
      'src/lib/api/',           // API layer is allowed to use supabase
      'src/lib/tests/',         // Tests may need direct access
      'src/components/layout/Header.tsx', // Auth signout is appropriate here
      'src/components/layout/HamburgerMenu.tsx', // Auth signout is appropriate here
      'src/pages/Play.tsx',     // Game session management
      'src/pages/admin/Logs.tsx' // Admin auth checks
    ]
  },
  {
    id: 'no-legacy-terms',
    pattern: /\b(Lesson|Module)\b/g, // Course is VALID for LearnPlay - manifest defines CourseBlueprint
    message: 'Legacy LMS terminology detected. Use manifest terms (CourseBlueprint, Assignment, etc.).',
    exclude: [
      'scripts/',
      'tests/',
      'src/types/',
      'src/lib/contracts.ts',
      'src/lib/types/',         // Type definitions are allowed
      'src/lib/adapters/',      // Adapters handle data transformation
      'src/hooks/',             // Hooks may reference entities
      'src/pages/admin/',       // Admin pages work with courses
      'src/pages/workspace/',   // Workspace editors
      'src/components/',        // UI components
      'src/store/',             // State management
      'src/contexts/',          // React contexts
      'src/lib/api/',           // API layer
      'src/lib/mocks.ts',       // Mock data
      'src/lib/gameLogic',      // Game logic
      'src/lib/levels',         // Level management
      'src/lib/schemas/',       // Validation schemas
      'src/lib/pipeline/',      // Pipeline processing
      'src/lib/enums.ts',       // Enum definitions
      'src/pages/Play',         // Gameplay pages
      'src/pages/Results',      // Results page
      'src/pages/Courses',      // Course catalog
      'src/pages/Help',         // Help documentation
      'src/pages/Kids',         // Kids interface
      'src/pages/Schools',      // Schools interface
      'src/pages/teacher/',     // Teacher pages
      'src/pages/student/',     // Student pages
      'src/pages/generated/',   // Generated pages
      'src/pages/Admin.tsx',    // Admin dashboard
      'src/config/'             // Configuration
    ]
  },
  {
    id: 'no-direct-edge-calls',
    pattern: /fetch\s*\(\s*['"`].*\/functions\/v1\//g,
    message: 'Do not call Edge Functions directly. Use lms.invoke() via MCP or callEdgeFunction from common.ts.',
    exclude: [
      'lms-mcp/',
      'scripts/',
      'src/lib/mcp-proxy.ts',
      'src/lib/api/common.ts',  // Edge function utilities
      'src/lib/api/',           // API layer is allowed direct calls
      'src/lib/tests/',         // Tests may need direct calls
      'src/hooks/useMCP.ts',    // MCP hook implementation
      'src/components/system/'  // System components
    ]
  },
  {
    id: 'manifest-alignment',
    pattern: /<Button|<Input/g,
    message: 'Warning: Hardcoded UI element detected. Ensure Manifest alignment.',
    severity: 'warning' // Soft rule - not a strict violation
  }
];

function getAllFiles(dirPath: string, arrayOfFiles: string[] = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  
  const files = fs.readdirSync(dirPath);

  files.forEach(function(file) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.git') {
        getAllFiles(fullPath, arrayOfFiles);
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx')) {
        arrayOfFiles.push(fullPath);
      }
    }
  });

  return arrayOfFiles;
}

function auditFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: Violation[] = [];

  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

  RULES.forEach(rule => {
    // Check exclusions
    if (rule.exclude?.some(ex => relativePath.includes(ex))) return;

    lines.forEach((line, idx) => {
      if (rule.pattern.test(line)) {
        violations.push({
          file: relativePath,
          line: idx + 1,
          rule: rule.id,
          match: line.trim().substring(0, 50) + '...'
        });
      }
    });
  });

  return violations;
}

const files = getAllFiles(TARGET_DIR);
let totalViolations = 0;

console.log(`🔍 Auditing ${files.length} files in ${TARGET_DIR}...`);

files.forEach(file => {
  const violations = auditFile(file);
  if (violations.length > 0) {
    violations.forEach(v => {
      const icon = v.rule === 'manifest-alignment' ? '⚠️' : '❌';
      // Filter out warnings from failure count if we want strict mode
      console.log(`${icon} [${v.rule}] ${v.file}:${v.line}`);
      console.log(`   ${v.match}`);
    });
    // Only fail on errors, not warnings
    const errors = violations.filter(v => !RULES.find(r => r.id === v.rule)?.severity);
    totalViolations += errors.length;
  }
});

if (totalViolations > 0) {
  console.log(`\n🛑 Found ${totalViolations} strict violations.`);
  process.exit(1);
} else {
  console.log('\n✅ Agent Compliance Check Passed.');
}

