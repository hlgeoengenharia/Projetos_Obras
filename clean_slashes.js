const fs = require('fs');
let content = fs.readFileSync('src/customFields.js', 'utf8');

// Replace all \` with ` and \${ with ${ in the whole file since we only injected them there
content = content.replace(/\\\`/g, '`');
content = content.replace(/\\\$\{/g, '${');

fs.writeFileSync('src/customFields.js', content, 'utf8');
console.log('Cleaned up slashes');
