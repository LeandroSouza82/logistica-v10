const fs = require('fs');
const content = fs.readFileSync('src/App.jsx', 'utf-8');

// Corrige o botão limpar que ficou incompleto
const fixedContent = content.replace(
    /<button onClick=\{limparEntregasAntigas\} style=\{\{ \.\.\.styles\.btnSend, background: '#ef4444', marginTop: 0 \}\}>\s*<button/,
    `<button onClick={limparEntregasAntigas} style={{ ...styles.btnSend, background: '#ef4444', marginTop: 0 }}>
                  <Trash2 size={18} /> LIMPAR ENTREGAS ANTIGAS
                </button>
                <button`
);

// Remove o </button> duplicado
const finalContent = fixedContent.replace(
    /🎁 GERAR ENTREGA DE TESTE\s*<\/button>\s*<\/button>/,
    `🎁 GERAR ENTREGA DE TESTE
                </button>`
);

fs.writeFileSync('src/App.jsx', finalContent);
console.log('OK');
