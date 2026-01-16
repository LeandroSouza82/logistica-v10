const fs = require('fs');
let sraw = fs.readFileSync('c:/Users/leand/logistica-v2/mobile/src/components/DeliveryApp.js', 'utf8');
let s = sraw;
// remove block comments
s = s.replace(/\/\*[\s\S]*?\*\//g, '');
// remove line comments
s = s.replace(/\/\/.*$/gm, '');
// remove strings
s = s.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "'");
s = s.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '"');
// remove templates
s = s.replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, '');

function findFunctionEnd(name) {
    const idx = s.indexOf(name);
    if (idx === -1) return null;
    let i = s.indexOf('{', idx);
    if (i === -1) return null;
    let depth = 1; let line = s.slice(0, i + 1).split('\n').length;
    for (i = i + 1; i < s.length; i++) {
        const ch = s[i];
        if (ch === '\n') line++;
        if (ch === '{') depth++;
        else if (ch == '}') { depth--; if (depth === 0) return { pos: i, line }; }
    }
    return null;
}

console.log('trying find');
const f = findFunctionEnd('export default function DeliveryApp');
console.log('found', f);

// counts
let paren = 0, brace = 0, brack = 0;
const parenStack = [];
const braceStack = [];
let line = 1;
for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\n') line++;
    if (ch === '(') { paren++; parenStack.push({ i, line }); }
    if (ch === ')') { paren--; parenStack.pop(); }
    if (ch === '{') { brace++; braceStack.push({ i, line }); }
    if (ch === '}') { brace--; braceStack.pop(); }
    if (ch === '[') brack++;
    if (ch === ']') brack--;
}
console.log('paren', paren, 'brace', brace, 'brack', brack);
if (parenStack.length > 0) { console.log('UNMATCHED ( positions (last 10):', parenStack.slice(-10)); }
if (braceStack.length > 0) { console.log('UNMATCHED { positions (last 10):', braceStack.slice(-10)); }
