/**
 * Plan Init Script
 * 
 * Initializes a new Golden Plan workspace by copying templates.
 * 
 * Usage: npx tsx scripts/plan-init.ts [target-directory] [--name "Product Name"]
 */

import fs from 'fs';
import path from 'path';

const TEMPLATE_DIR = path.join(__dirname, '..', 'templates', 'golden-plan');

interface InitOptions {
  targetDir: string;
  productName: string;
  entityName: string;
  entitySlug: string;
}

function parseArgs(): InitOptions {
  const args = process.argv.slice(2);
  let targetDir = '.';
  let productName = 'My Product';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) {
      productName = args[i + 1];
      i++;
    } else if (!args[i].startsWith('--')) {
      targetDir = args[i];
    }
  }
  
  // Derive entity name from product name
  const entityName = productName.replace(/\s+/g, '');
  const entitySlug = productName.toLowerCase().replace(/\s+/g, '-');
  
  return { targetDir, productName, entityName, entitySlug };
}

function copyAndReplace(src: string, dest: string, replacements: Record<string, string>) {
  let content = fs.readFileSync(src, 'utf-8');
  
  for (const [placeholder, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }
  
  fs.writeFileSync(dest, content);
}

function copyDir(srcDir: string, destDir: string, replacements: Record<string, string>) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name.replace('.template', ''));
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath, replacements);
    } else {
      copyAndReplace(srcPath, destPath, replacements);
      console.log(`   Created: ${path.relative(process.cwd(), destPath)}`);
    }
  }
}

async function main() {
  const options = parseArgs();
  const { targetDir, productName, entityName, entitySlug } = options;
  
  console.log('🏭 Initializing Golden Plan workspace...');
  console.log(`   Target: ${path.resolve(targetDir)}`);
  console.log(`   Product: ${productName}`);
  
  // Check if templates exist
  if (!fs.existsSync(TEMPLATE_DIR)) {
    console.error('❌ Template directory not found:', TEMPLATE_DIR);
    process.exit(1);
  }
  
  // Check if target already has a PLAN.md
  const planPath = path.join(targetDir, 'PLAN.md');
  if (fs.existsSync(planPath)) {
    console.error('❌ PLAN.md already exists in target directory.');
    console.error('   Use a different directory or remove the existing plan.');
    process.exit(1);
  }
  
  // Create target directory if needed
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  // Define replacements
  const replacements: Record<string, string> = {
    '[Product Name]': productName,
    '[product-name]': entitySlug,
    '[EntityName]': entityName,
    '[entity-slug]': entitySlug,
    '[DATE]': new Date().toISOString().split('T')[0],
    '[NAME]': process.env.USER || 'Author',
    '[job_id]': `analyze_${entitySlug.replace(/-/g, '_')}`,
    '[ChildEntity]': `${entityName}Item`,
    '[child-slug]': `${entitySlug}-item`,
  };
  
  // Copy template files
  copyDir(TEMPLATE_DIR, targetDir, replacements);
  
  console.log('\n🎉 Golden Plan workspace initialized!');
  console.log('\n📋 Next steps:');
  console.log('   1. Edit PLAN.md - Fill in your product details');
  console.log('   2. Edit system-manifest.json - Define your entities');
  console.log('   3. Edit mockups/ - Customize your UI mockups');
  console.log('   4. Run: npx tsx scripts/factory-guard.ts ' + targetDir);
  console.log('   5. Run: npx tsx scripts/scaffold-manifest.ts');
  console.log('   6. Run: npx tsx scripts/generate-logic.ts ' + targetDir);
  console.log('   7. Run: npx tsx scripts/compile-mockups.ts ' + targetDir);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});



