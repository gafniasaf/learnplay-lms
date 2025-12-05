const fs = require('fs');
fs.writeFileSync('test-output.txt', 'Script ran at ' + new Date().toISOString());
console.log('Done!');



