const fs = require('fs');
const s = fs.readFileSync('c:/Users/leand/logistica-v2/mobile/src/components/DeliveryApp.js', 'utf8');
let paren = 0, brace = 0, brack = 0;
let line = 1;
let state = null;
for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const nxt = s[i + 1];
    if (ch === '\n') line++;
    if (state) {
        if (state === '//' && ch === '\n') { state = null; continue; }
        if (state === '/*' && ch === '*' && nxt === '/') { state = null; i++; continue; }
        if ((state === '"' || state === "'" || state === '`') && ch === '\\') { i++; continue; }
        if (state === '"' && ch === '"') { state = null; continue; }
        if (state === "'" && ch === "'") { state = null; continue; }
        if (state === '`' && ch === '`') { state = null; continue; }
        continue;
    } else {
        if (ch === '/' && nxt === '/') { state = '//'; i++; continue; }
        if (ch === '/' && nxt === '*') { state = '/*'; i++; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { state = ch; continue; }
        if (ch === '(') { paren++; }
        else if (ch === ')') { paren--; if (paren < 0) { console.log('UNMATCHED ) at line', line); console.log('context', s.slice(Math.max(0, i - 40), i + 40)); break; } }
        if (ch == '{') { brace++; }
        else if (ch == '}') { brace--; if (brace < 0) { console.log('UNMATCHED } at line', line); console.log('context', s.slice(Math.max(0, i - 40), i + 40)); break; } }
    }
    console.log('final paren', paren, 'brace', brace, 'line', line);
