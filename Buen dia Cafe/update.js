const fs = require('fs');

let lines = fs.readFileSync('index.html', 'utf8').split('\n');

let newLines = lines.slice(0, 363);
newLines.push('    <!-- Firebase SDKs -->');
newLines.push('    <script src="https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js"></script>');
newLines.push('    <script src="https://www.gstatic.com/firebasejs/10.9.0/firebase-database-compat.js"></script>');
newLines.push('    ');
newLines.push('    <!-- App Logic -->');
newLines.push('    <script src="app.js"></script>');
newLines = newLines.concat(lines.slice(823));

fs.writeFileSync('index.html', newLines.join('\n'), 'utf8');
console.log('Successfully updated index.html');
