const fs = require('fs');
let s = fs.readFileSync('c:/Users/leand/logistica-v2/mobile/src/components/DeliveryApp.js', 'utf8');
// remove block comments
s = s.replace(/\/\*[\s\S]*?\*\//g, '');
// remove line comments
s = s.replace(/\/\/.*$/gm, '');
// remove strings
s = s.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, "'");
s = s.replace(/"[^"\\]*(?:\\.[^"\\]*)*"/g, '"');
// remove templates
s = s.replace(/`[^`\\]*(?:\\.[^`\\]*)*`/g, '');
let paren = 0, brace = 0, brack = 0;
for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') paren++;
    if (ch === ')') paren--;
    if (ch === '{') brace++;
    if (ch === '}') brace--;
    if (ch === '[') brack++;
    if (ch === ']') brack--;
}
console.log('paren', paren, 'brace', brace, 'brack', brack);
