const fs = require('fs');
const path = process.argv[2] || 'mobile/src/components/DeliveryApp.js';
const txt = fs.readFileSync(path, 'utf8');
const lines = txt.split('\n');
let brace = 0;
for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    // update brace count ignoring braces inside strings (simple heuristic)
    // remove string literals
    const noStr = l.replace(/(['"`])(?:(?!\1|\\).|\\.)*\1/g, '');
    for (const ch of noStr) {
        if (ch === '{') brace++;
        if (ch === '}') brace--;
    }
    if (/\bawait\b/.test(l)) {
        console.log('Line', i + 1, 'braceLevel=', brace);
        console.log('   >', l.trim());
        const start = Math.max(0, i - 3);
        const end = Math.min(lines.length - 1, i + 3);
        for (let j = start; j <= end; j++) {
            console.log((j + 1).toString().padStart(4), lines[j]);
        }
        console.log('---');
    }
}
