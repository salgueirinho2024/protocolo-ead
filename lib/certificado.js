// lib/certificado.js — gera o certificado em PDF, compatível com Vercel Functions
//
// Mudanças em relação à versão original (src/services/certificado.js):
//   1. puppeteer → puppeteer-core + @sparticuz/chromium
//      (o pacote "puppeteer" completo baixa um Chromium de ~300MB que não
//      cabe no limite de tamanho de uma função Vercel; @sparticuz/chromium
//      é uma build comprimida e compatível com o ambiente Lambda/Vercel)
//   2. Não grava mais em disco. Devolve o Buffer do PDF; quem chama decide
//      o que fazer com ele (no nosso caso: converter para base64 e salvar
//      na coluna arquivo_pdf_base64 do banco).
const path = require('path');
const db = require('./db');

function codigoAleatorio() {
  return 'CERT-' + Math.random().toString(36).slice(2, 6).toUpperCase()
    + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function formatarCPF(cpf) {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function minutosParaHoras(min) {
  const h = Math.floor(min / 60);
  return `${h}h${min % 60 > 0 ? ` ${min % 60}min` : ''}`;
}

function htmlCertificado({ nome, cpf, titulo, cargaHorariaMin, data, codigo, validoAte, emissora }) {
  const rodapeExtra = emissora && (emissora.responsavel_tecnico_nome || emissora.instrutor_nome) ? `
  <div class="footer">
    ${emissora.instrutor_nome ? `<div class="footer-item">
      <div class="footer-label">Instrutor</div>
      <div class="footer-value">${emissora.instrutor_nome}</div>
    </div>` : ''}
    ${emissora.responsavel_tecnico_nome ? `<div class="footer-item">
      <div class="footer-label">Responsável Técnico</div>
      <div class="footer-value">${emissora.responsavel_tecnico_nome}</div>
    </div>` : ''}
  </div>` : '';
  const emissoraLinha = emissora && emissora.empresa_razao_social
    ? `<div class="qr-hint">Emitido por ${emissora.empresa_razao_social}${emissora.empresa_cnpj ? ' — CNPJ ' + emissora.empresa_cnpj : ''}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: 842px; height: 595px;
    font-family: 'Inter', sans-serif;
    background: #f6f4ee;
    display: flex; align-items: center; justify-content: center;
  }
  .cert {
    width: 780px; height: 548px;
    border: 2px solid #1f3d37;
    border-radius: 16px;
    background: #fffdf9;
    background-image: repeating-linear-gradient(135deg, transparent, transparent 18px, rgba(0,0,0,.025) 18px, rgba(0,0,0,.025) 19px);
    padding: 48px 56px;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; position: relative;
  }
  .border-inner {
    position: absolute; inset: 8px;
    border: 1px solid rgba(31,61,55,.25); border-radius: 10px; pointer-events: none;
  }
  .seal {
    width: 64px; height: 64px; border-radius: 50%;
    border: 2px solid #c5731f;
    display: flex; align-items: center; justify-content: center;
    color: #c5731f; font-family: 'Fraunces', serif; font-weight: 700; font-size: 24px;
    margin-bottom: 20px;
  }
  .eyebrow {
    font-size: 11px; letter-spacing: .1em; text-transform: uppercase;
    color: #c5731f; font-weight: 600; margin-bottom: 8px;
  }
  .declaracao { font-size: 14px; color: #6b6759; margin-bottom: 4px; }
  .nome {
    font-family: 'Fraunces', serif; font-size: 36px; font-weight: 600;
    color: #15231f; letter-spacing: -.01em; margin: 8px 0 2px;
  }
  .cpf { font-size: 12px; color: #9a9690; letter-spacing: .04em; margin-bottom: 20px; font-variant-numeric: tabular-nums; }
  .concluiu { font-size: 13px; color: #6b6759; margin-bottom: 4px; }
  .titulo {
    font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600;
    color: #1f3d37; margin-bottom: 4px;
  }
  .carga { font-size: 12.5px; color: #9a9690; }
  .divider {
    width: 60px; height: 1px; background: #d8d3c4; margin: 20px auto;
  }
  .footer { display: flex; gap: 48px; justify-content: center; margin-top: 12px; }
  .footer-item { text-align: center; }
  .footer-label { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #9a9690; margin-bottom: 4px; }
  .footer-value { font-size: 12px; font-weight: 600; color: #15231f; }
  .codigo { font-family: monospace; letter-spacing: .08em; }
  .qr-hint { font-size: 10px; color: #c0bbb0; margin-top: 16px; }
</style>
</head>
<body>
<div class="cert">
  <div class="border-inner"></div>
  <div class="seal">P</div>
  <div class="eyebrow">Certificado de Conclusão</div>
  <div class="declaracao">Certificamos que</div>
  <div class="nome">${nome}</div>
  <div class="cpf">CPF ${formatarCPF(cpf)}</div>
  <div class="concluiu">concluiu com êxito o treinamento</div>
  <div class="titulo">${titulo}</div>
  <div class="carga">com carga horária de ${minutosParaHoras(cargaHorariaMin)}</div>
  <div class="divider"></div>
  <div class="footer">
    <div class="footer-item">
      <div class="footer-label">Data de conclusão</div>
      <div class="footer-value">${data}</div>
    </div>
    ${validoAte ? `<div class="footer-item">
      <div class="footer-label">Válido até</div>
      <div class="footer-value">${validoAte}</div>
    </div>` : ''}
    <div class="footer-item">
      <div class="footer-label">Código de validação</div>
      <div class="footer-value codigo">${codigo}</div>
    </div>
  </div>
  ${rodapeExtra}
  <div class="qr-hint">Verifique a autenticidade em ${process.env.APP_URL || ''}/validar/${codigo}</div>
  ${emissoraLinha}
</div>
</body>
</html>`;
}

/**
 * Abre um browser Chromium compatível com o ambiente serverless da Vercel.
 * @sparticuz/chromium entrega os binários comprimidos; puppeteer-core
 * conecta neles sem precisar baixar um Chromium próprio no build.
 */
async function abrirBrowser() {
  const chromium = require('@sparticuz/chromium');
  const puppeteer = require('puppeteer-core');

  const executablePath = await chromium.executablePath();

  return puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: chromium.headless,
    defaultViewport: chromium.defaultViewport,
  });
}

/**
 * Gera o PDF do certificado em memória e devolve o Buffer + metadados.
 * NÃO grava em disco (filesystem da Vercel é efêmero).
 */
async function gerarPdfBuffer({ nome, cpf, titulo, cargaHorariaMin, data, codigo, validoAte }) {
  const html = htmlCertificado({ nome, cpf, titulo, cargaHorariaMin, data, codigo, validoAte });

  const browser = await abrirBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({
      width: '842px',
      height: '595px',
      printBackground: true,
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

/**
 * Gera o certificado e salva o PDF (como base64) no banco.
 * Retorna { codigo_validacao, arquivo_pdf_url, emitido_em }.
 *
 * arquivo_pdf_url aqui NÃO é mais um caminho de arquivo estático — é a URL
 * da rota /api/player/certificado/pdf, que lê o base64 do banco e devolve
 * o PDF puro (ver api/player/certificado/pdf.js).
 */
async function gerarCertificadoPDF(matriculaId, funcionarioId) {
  const { rows } = await db.query(
    `SELECT fc.nome, fc.cpf, t.titulo, t.carga_horaria_min, t.validade_certificado_meses,
            m.concluido_em
       FROM matriculas m
       JOIN funcionarios_contrato fc ON fc.id = m.funcionario_id
       JOIN treinamentos t ON t.id = m.treinamento_id
      WHERE m.id = $1 AND m.funcionario_id = $2`,
    [matriculaId, funcionarioId]
  );

  if (!rows[0]) throw new Error('Matrícula não encontrada para geração do certificado.');
  const { nome, cpf, titulo, carga_horaria_min, validade_certificado_meses, concluido_em } = rows[0];

  const { rows: emissoraRows } = await db.query(`SELECT * FROM configuracao_emissora WHERE id = 1`);
  const emissora = emissoraRows[0] || null;

  const codigo = codigoAleatorio();
  const dataConclusao = new Date(concluido_em || Date.now());
  const dataFormatada = dataConclusao.toLocaleDateString('pt-BR');

  let validoAteFormatado = null;
  let validoAteDate = null;
  if (validade_certificado_meses) {
    validoAteDate = new Date(dataConclusao);
    validoAteDate.setMonth(validoAteDate.getMonth() + validade_certificado_meses);
    validoAteFormatado = validoAteDate.toLocaleDateString('pt-BR');
  }

  const pdfBuffer = await gerarPdfBuffer({
    nome, cpf, titulo, cargaHorariaMin: carga_horaria_min,
    data: dataFormatada, codigo, validoAte: validoAteFormatado, emissora,
  });

  const pdfBase64 = pdfBuffer.toString('base64');
  const urlPdf = `${process.env.APP_URL || ''}/api/player/certificado/pdf?codigo=${codigo}`;

  const { rows: certRows } = await db.query(
    `INSERT INTO certificados (matricula_id, codigo_validacao, arquivo_pdf_url, arquivo_pdf_base64, valido_ate)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (matricula_id) DO UPDATE
       SET codigo_validacao = $2, arquivo_pdf_url = $3, arquivo_pdf_base64 = $4, valido_ate = $5
     RETURNING codigo_validacao, arquivo_pdf_url, emitido_em`,
    [matriculaId, codigo, urlPdf, pdfBase64, validoAteDate ? validoAteDate.toISOString().slice(0, 10) : null]
  );

  return certRows[0];
}

module.exports = { gerarCertificadoPDF };
