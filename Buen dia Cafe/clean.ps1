$lines = Get-Content 'index.html' -Encoding UTF8
$newLines = $lines[0..362]
$newLines += '    <!-- Firebase SDKs -->'
$newLines += '    <script src="https://www.gstatic.com/firebasejs/10.9.0/firebase-app-compat.js"></script>'
$newLines += '    <script src="https://www.gstatic.com/firebasejs/10.9.0/firebase-database-compat.js"></script>'
$newLines += '    <!-- App Logic -->'
$newLines += '    <script src="app.js"></script>'
$newLines += $lines[823..($lines.Count - 1)]
$newLines | Set-Content 'index.html' -Encoding UTF8
