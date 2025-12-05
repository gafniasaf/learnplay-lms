const fs = require('fs');
const planContent = fs.readFileSync('PLAN.md', 'utf-8');

// Find Section F using a simpler approach
const fStart = planContent.indexOf('## F. Business Logic');
const gStart = planContent.indexOf('## G. Environment');

if (fStart === -1) {
  console.log('Section F not found');
  process.exit(1);
}

console.log('F starts at position:', fStart);
console.log('G starts at position:', gStart);

const sectionF = planContent.substring(fStart, gStart);
console.log('Section F length:', sectionF.length);
console.log('First 300 chars of Section F:');
console.log(sectionF.substring(0, 300));
console.log('\n---\n');

// Try to find F.4 stores section
const f4Start = sectionF.indexOf('### F.4 Client-Side Stores');
if (f4Start !== -1) {
  console.log('F.4 found at position:', f4Start);
  const f4Content = sectionF.substring(f4Start, f4Start + 500);
  console.log('F.4 content preview:');
  console.log(f4Content);
}

// Check for useGameStateStore
if (sectionF.includes('useGameStateStore')) {
  console.log('\n\nuseGameStateStore found in Section F');
}
