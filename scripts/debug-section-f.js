const fs = require('fs');
const planContent = fs.readFileSync('PLAN.md', 'utf-8');

// Find Section F
const sectionFMatch = planContent.match(/## F\. Business Logic Specifications([\s\S]*?)(?=## [G-Z]|$)/i);
if (!sectionFMatch) {
  console.log('Section F not found');
  process.exit(1);
}
const sectionF = sectionFMatch[1];
console.log('Section F length:', sectionF.length);
console.log('First 500 chars of Section F:');
console.log(sectionF.substring(0, 500));
console.log('\n---\n');

// Try to find stores
const storePattern = /####\s+(\w+)\s*\n\*\*Purpose:\*\*/gi;
const matches = [...sectionF.matchAll(storePattern)];
console.log('Store pattern matches:', matches.length);
matches.forEach(m => console.log('  -', m[1]));

// Check for useGameStateStore specifically
if (sectionF.includes('useGameStateStore')) {
  console.log('\nuseGameStateStore found in Section F');
  const idx = sectionF.indexOf('useGameStateStore');
  console.log('Context around it:');
  console.log(sectionF.substring(idx - 50, idx + 100));
}







