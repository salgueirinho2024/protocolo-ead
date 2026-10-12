// Uso: node materiais/_gerador/build.js
// Gera materiais/integracao/*.html e materiais/integracao/catalogo.json
const fs = require('fs');
const path = require('path');
const { renderizar } = require('./template');

const dirMods = path.join(__dirname, 'modulos');
const saida = path.join(__dirname, '..', 'integracao');
const arquivos = fs.readdirSync(dirMods).filter((f) => f.endsWith('.js')).sort();
const catalogo = [];

for (const f of arquivos) {
  const m = require(path.join(dirMods, f));
  const nome = `${String(m.numero).padStart(2, '0')}-${m.slug}.html`;
  fs.writeFileSync(path.join(saida, nome), renderizar(m));
  catalogo.push({
    ordem: m.numero,
    titulo: m.titulo,
    pagina: `/materiais/integracao/${nome}`,
    video_provider: 'youtube',
    video_provider_id: m.video?.id || null,
    video_titulo: m.video?.titulo || null,
    video_canal: m.video?.canal || null,
    duracao_segundos: m.video?.duracao_segundos || null,
    video_verificado: !!m.video?.verificado,
  });
  console.log('✔', nome);
}
fs.writeFileSync(path.join(saida, 'catalogo.json'), JSON.stringify(catalogo, null, 2));
