// lib/certificado.js
//
// Cada treinamento carrega seu próprio cabeçalho de emissão
// (empresa emissora + assinatura digital em base64). A tabela
// global configuracao_emissora é usada apenas como fallback se
// o treinamento não tiver os campos preenchidos.
const db = require('./db');

function codigoAleatorio() {
  return 'CERT-' + Math.random().toString(36).slice(2, 6).toUpperCase()
    + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

async function gerarCertificadoPDF(matriculaId, funcionarioId, concluido_em_override = null) {
  const { rows } = await db.query(
    `SELECT fc.nome, fc.cpf,
            t.titulo, t.carga_horaria_min, t.validade_certificado_meses,
            t.conteudo_programatico,
            t.emissora_nome, t.emissora_cnpj,
            t.assinatura_base64, t.assinatura_nome, t.assinatura_cargo,
            m.concluido_em
       FROM matriculas m
       JOIN funcionarios_contrato fc ON fc.id = m.funcionario_id
       JOIN treinamentos t ON t.id = m.treinamento_id
      WHERE m.id = $1 AND m.funcionario_id = $2`,
    [matriculaId, funcionarioId]
  );

  if (!rows[0]) throw new Error('Matrícula não encontrada para geração do certificado.');
  const r = rows[0];

  const concluido_em = concluido_em_override || r.concluido_em || new Date();

  // Fallback global (treinamentos antigos sem emissora própria)
  let emissoraGlobal = null;
  if (!r.emissora_nome) {
    try {
      const { rows: er } = await db.query(`SELECT * FROM configuracao_emissora WHERE id = 1`);
      emissoraGlobal = er[0] || null;
    } catch (_) { /* tabela pode não existir */ }
  }

  const emissora = {
    empresa_razao_social: r.emissora_nome || (emissoraGlobal && emissoraGlobal.empresa_razao_social) || null,
    empresa_cnpj:        r.emissora_cnpj || (emissoraGlobal && emissoraGlobal.empresa_cnpj) || null,
    assinatura_base64:   r.assinatura_base64 || null,
    assinatura_nome:     r.assinatura_nome || (emissoraGlobal && emissoraGlobal.instrutor_nome) || null,
    assinatura_cargo:    r.assinatura_cargo || null,
    instrutor_nome:      emissoraGlobal && emissoraGlobal.instrutor_nome,
    responsavel_tecnico_nome: emissoraGlobal && emissoraGlobal.responsavel_tecnico_nome,
  };

  const codigo = codigoAleatorio();
  const dataConclusao = new Date(concluido_em);

  let validoAteDate = null;
  if (r.validade_certificado_meses) {
    validoAteDate = new Date(dataConclusao);
    validoAteDate.setMonth(validoAteDate.getMonth() + r.validade_certificado_meses);
  }

  const urlPdf = `${process.env.APP_URL || ''}/api/player/certificado?rota=pdf&codigo=${codigo}`;
  const urlValidacao = `${process.env.APP_URL || ''}/validar/${codigo}`;

  const { rows: certRows } = await db.query(
    `INSERT INTO certificados (matricula_id, codigo_validacao, arquivo_pdf_url, arquivo_pdf_base64, valido_ate)
     VALUES ($1, $2, $3, NULL, $4)
     ON CONFLICT (matricula_id) DO UPDATE
       SET codigo_validacao = $2, arquivo_pdf_url = $3, arquivo_pdf_base64 = NULL, valido_ate = $4
     RETURNING codigo_validacao, arquivo_pdf_url, emitido_em`,
    [matriculaId, codigo, urlPdf, validoAteDate ? validoAteDate.toISOString().slice(0, 10) : null]
  );

  return {
    ...certRows[0],
    dados_certificado: {
      nome: r.nome,
      cpf: r.cpf,
      titulo: r.titulo,
      carga_horaria_min: r.carga_horaria_min,
      conteudo_programatico: r.conteudo_programatico,
      data_conclusao: dataConclusao.toLocaleDateString('pt-BR'),
      valido_ate: validoAteDate ? validoAteDate.toLocaleDateString('pt-BR') : null,
      codigo_validacao: codigo,
      url_validacao: urlValidacao,
      emissora,
    },
  };
}

module.exports = { gerarCertificadoPDF };
