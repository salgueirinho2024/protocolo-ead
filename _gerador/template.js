// Template compartilhado das páginas de material de apoio.
// Cada módulo exporta um objeto (ver modulos/*.js) e o build.js gera um
// HTML 100% autocontido (sem CDN) em materiais/integracao/.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Permite **negrito** inline nos textos.
const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

function bloco(b) {
  switch (b.tipo) {
    case 'p': return `<p>${inline(b.texto)}</p>`;
    case 'h3': return `<h3>${inline(b.texto)}</h3>`;
    case 'ul': return `<ul>${b.itens.map((i) => `<li>${inline(i)}</li>`).join('')}</ul>`;
    case 'ol': return `<ol>${b.itens.map((i) => `<li>${inline(i)}</li>`).join('')}</ol>`;
    case 'callout':
      return `<aside class="callout ${b.variante || 'info'}"><strong>${esc(b.titulo)}</strong><p>${inline(b.texto)}</p></aside>`;
    case 'cards':
      return `<div class="cards">${b.itens.map((c) => `<div class="card"><h4>${inline(c.titulo)}</h4><p>${inline(c.texto)}</p></div>`).join('')}</div>`;
    case 'tabela':
      return `<div class="scroll"><table><thead><tr>${b.colunas.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${b.linhas
        .map((l) => `<tr>${l.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    default: throw new Error('Bloco desconhecido: ' + b.tipo);
  }
}

function renderizar(m) {
  const secoes = m.secoes.map((s, i) => `
    <section id="s${i + 1}">
      <h2><span class="num">${i + 1}</span>${esc(s.titulo)}</h2>
      ${s.blocos.map(bloco).join('\n')}
    </section>`).join('\n');
  const indice = m.secoes.map((s, i) => `<li><a href="#s${i + 1}">${esc(s.titulo)}</a></li>`).join('');
  const video = m.video && m.video.id
    ? `<div class="video-standalone" id="video-standalone" hidden><div class="ratio"><iframe src="https://www.youtube.com/embed/${esc(m.video.id)}?rel=0" title="${esc(m.titulo)}" allowfullscreen loading="lazy"></iframe></div></div>`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(m.titulo)} — Integração de Novos Colaboradores</title>
<style>
:root{--bg:#F0F7F4;--card:#fff;--text:#1B2D24;--muted:#52796F;--primary:#1B4332;--accent:#40916C;--accent-soft:#D8F3DC;--line:#CFE3D8;--warn-bg:#FFF4E5;--warn:#B45309;--danger-bg:#FDECEE;--danger:#B42318;}
@media (prefers-color-scheme:dark){:root{--bg:#0E1712;--card:#1B2A21;--text:#E7F1EA;--muted:#8FAC9C;--primary:#95D5B2;--accent:#52B788;--accent-soft:#1F3A2B;--line:#2D4A39;--warn-bg:#3A2A12;--warn:#F4A261;--danger-bg:#3D1A1E;--danger:#F28B93;}}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:20px 16px 56px}
header.topo{background:var(--primary);color:#fff;border-radius:12px;padding:22px 22px 20px;margin-bottom:18px}
@media (prefers-color-scheme:dark){header.topo{background:#14291F}}
.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;margin:0 0 6px}
header.topo h1{margin:0 0 8px;font-size:clamp(22px,4.5vw,30px);line-height:1.2}
header.topo p{margin:0;opacity:.92}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.chip{background:rgba(255,255,255,.14);border-radius:999px;padding:3px 12px;font-size:13px}
.video-standalone{margin-bottom:18px}
.ratio{position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;background:#000}
.ratio iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
nav.indice,.objetivos{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin-bottom:18px}
nav.indice h2,.objetivos h2{margin:0 0 8px;font-size:15px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
nav.indice ol{margin:0;padding-left:20px}
nav.indice a{color:var(--accent);text-decoration:none}
nav.indice a:hover{text-decoration:underline}
.objetivos ul{margin:0;padding-left:20px}
section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 22px;margin-bottom:16px}
section h2{margin:0 0 12px;font-size:20px;color:var(--primary);display:flex;gap:10px;align-items:center;line-height:1.3}
.num{flex:none;display:inline-grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;font-size:14px}
h3{margin:18px 0 6px;font-size:17px}
h4{margin:0 0 4px;font-size:15px;color:var(--primary)}
p{margin:0 0 12px}
ul,ol{margin:0 0 12px;padding-left:22px}
li{margin-bottom:4px}
.callout{border-left:4px solid var(--accent);background:var(--accent-soft);border-radius:8px;padding:12px 16px;margin:14px 0}
.callout.atencao{border-color:var(--warn);background:var(--warn-bg)}
.callout.perigo{border-color:var(--danger);background:var(--danger-bg)}
.callout p{margin:4px 0 0}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:12px 0}
.card{border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.card p{margin:0;font-size:15px}
.scroll{overflow-x:auto;margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:15px}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{background:var(--accent-soft);color:var(--primary)}
.resumo{background:var(--primary);color:#fff;border-radius:12px;padding:18px 22px;margin-bottom:16px}
@media (prefers-color-scheme:dark){.resumo{background:#14291F}}
.resumo h2{margin:0 0 8px;font-size:17px}
.resumo ul{margin:0}
footer.base{font-size:13px;color:var(--muted);border-top:1px solid var(--line);padding-top:14px}
footer.base ul{margin:6px 0 0;padding-left:18px}
@media print{body{background:#fff}.video-standalone{display:none}section,.objetivos,nav.indice{break-inside:avoid}}
</style>
</head>
<body>
<div class="wrap">
  <header class="topo">
    <p class="eyebrow">Integração de Novos Colaboradores · Módulo ${m.numero}</p>
    <h1>${esc(m.titulo)}</h1>
    <p>${inline(m.subtitulo)}</p>
    <div class="meta">${m.chips.map((c) => `<span class="chip">${esc(c)}</span>`).join('')}</div>
  </header>
  ${video}
  <div class="objetivos"><h2>Ao final deste módulo você será capaz de</h2><ul>${m.objetivos.map((o) => `<li>${inline(o)}</li>`).join('')}</ul></div>
  <nav class="indice"><h2>Neste módulo</h2><ol>${indice}</ol></nav>
  ${secoes}
  <div class="resumo"><h2>Para guardar</h2><ul>${m.resumo.map((r) => `<li>${inline(r)}</li>`).join('')}</ul></div>
  <footer class="base">
    <strong>Base normativa deste módulo</strong>
    <ul>${m.base.map((b) => `<li>${inline(b)}</li>`).join('')}</ul>
    <p style="margin-top:10px">Material de apoio elaborado para o curso de integração. Em caso de dúvida, o texto oficial das normas prevalece e a empresa pode complementá-lo com procedimentos próprios.</p>
  </footer>
</div>
<script>
  // Fora do player (aberto direto por link), mostra o vídeo do módulo no topo.
  // Dentro do player ele já aparece ao lado, então não duplica.
  try{ if(window.self===window.top){ var v=document.getElementById('video-standalone'); if(v) v.hidden=false; } }catch(e){}
</script>
</body>
</html>`;
}

module.exports = { renderizar };
