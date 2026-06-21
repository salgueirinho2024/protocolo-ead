// lib/certificado.js
//
// Versão sem Puppeteer/Chromium — o PDF é gerado no navegador do aluno
// via html2pdf.js (frontend). O servidor apenas salva os metadados no banco
// e devolve os dados necessários para o frontend montar o certificado.
const db = require('./db');

function codigoAleatorio() {
  return 'CERT-' + Math.random().toString(36).slice(2, 6).toUpperCase()
    + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

/**
 * Salva o registro do certificado no banco (sem gerar PDF).
 * Retorna os dados completos para o frontend gerar o PDF visualmente.
 *
 * @param {string} matriculaId
 * @param {string} funcionarioId
 * @param {Date|string|null} concluido_em_override — timestamp do RETURNING do UPDATE
 */
async function gerarCertificadoPDF(matriculaId, funcionarioId, concluido_em_override = null) {
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
  const { nome, cpf, titulo, carga_horaria_min, validade_certificado_meses } = rows[0];

  const concluido_em = concluido_em_override || rows[0].concluido_em || new Date();

  const { rows: emissoraRows } = await db.query(`SELECT * FROM configuracao_emissora WHERE id = 1`);
  const emissora = emissoraRows[0] || null;

  const codigo = codigoAleatorio();
  const dataConclusao = new Date(concluido_em);

  let validoAteDate = null;
  if (validade_certificado_meses) {
    validoAteDate = new Date(dataConclusao);
    validoAteDate.setMonth(validoAteDate.getMonth() + validade_certificado_meses);
  }

  // Salva no banco sem PDF (arquivo_pdf_base64 = null, arquivo_pdf_url = '')
  const urlPdf = `${process.env.APP_URL || ''}/api/player/certificado?rota=pdf&codigo=${codigo}`;

  const { rows: certRows } = await db.query(
    `INSERT INTO certificados (matricula_id, codigo_validacao, arquivo_pdf_url, arquivo_pdf_base64, valido_ate)
     VALUES ($1, $2, $3, NULL, $4)
     ON CONFLICT (matricula_id) DO UPDATE
       SET codigo_validacao = $2, arquivo_pdf_url = $3, arquivo_pdf_base64 = NULL, valido_ate = $4
     RETURNING codigo_validacao, arquivo_pdf_url, emitido_em`,
    [matriculaId, codigo, urlPdf, validoAteDate ? validoAteDate.toISOString().slice(0, 10) : null]
  );

  // Retorna tudo que o frontend precisa para gerar o PDF
  return {
    ...certRows[0],
    dados_certificado: {
      nome,
      cpf,
      titulo,
      carga_horaria_min,
      data_conclusao: dataConclusao.toLocaleDateString('pt-BR'),
      valido_ate: validoAteDate ? validoAteDate.toLocaleDateString('pt-BR') : null,
      codigo_validacao: codigo,
      emissora,
    },
  };
}

module.exports = { gerarCertificadoPDF };