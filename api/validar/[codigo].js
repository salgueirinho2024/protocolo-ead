// api/validar/[codigo].js — GET /api/validar/:codigo — validação pública do certificado
// (usado pelo QR code impresso no PDF, pelo botão "🔗 Validar" e pela página pública
// /validar/:codigo). Antes só devolvia alguns campos (nome, curso, datas); agora traz
// tudo que a página pública precisa para desenhar o certificado de verdade — e não só
// um JSON com "válido: true/false" — incluindo os mesmos dados de emissora/assinatura
// usados na geração do PDF (ver lib/certificado.js e api/player/certificado/index.js).
const db = require('../../lib/db');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');
const { calcularPeriodoTreinamentoFormatado } = require('../../lib/periodoTreinamento');
const { FUNDO_FRENTE_PADRAO_BASE64, FUNDO_VERSO_PADRAO_BASE64 } = require('../../lib/certificadoFundoPadrao');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET')) return;

  const { codigo } = req.query;

  try {
    const { rows } = await db.query(
      `SELECT cert.codigo_validacao, cert.emitido_em, cert.valido_ate,
              fc.nome AS funcionario_nome, fc.cpf,
              t.titulo AS treinamento_titulo, t.carga_horaria_min, t.conteudo_programatico,
              t.emissora_nome, t.emissora_cnpj,
              t.assinatura_base64, t.assinatura_nome, t.assinatura_cargo,
              t.responsavel_tecnico_nome, t.responsavel_tecnico_documento, t.instrutor_documento,
              t.certificado_fundo_frente_base64, t.certificado_fundo_verso_base64,
              m.iniciado_em
         FROM certificados cert
         JOIN matriculas m ON m.id = cert.matricula_id
         JOIN funcionarios fc ON fc.id = m.funcionario_id
         JOIN treinamentos t ON t.id = m.treinamento_id
        WHERE cert.codigo_validacao = $1`,
      [(codigo || '').toUpperCase()]
    );
    if (!rows[0]) {
      return res.status(404).json({ valido: false, mensagem: 'Certificado não encontrado.' });
    }
    const cert = rows[0];
    const expirado = cert.valido_ate && new Date(cert.valido_ate) < new Date();

    // Configuração global da emissora, usada como fallback quando o
    // treinamento não tem seus próprios dados de emissão preenchidos
    // (mesma lógica de api/player/certificado/index.js).
    let emissoraGlobal = null;
    try {
      const { rows: er } = await db.query(`SELECT * FROM configuracao_emissora WHERE id = 1`);
      emissoraGlobal = er[0] || null;
    } catch (_) { /* tabela pode não existir */ }

    const periodo = calcularPeriodoTreinamentoFormatado(cert.iniciado_em, cert.carga_horaria_min);

    const emissora = {
      empresa_razao_social: cert.emissora_nome || (emissoraGlobal && emissoraGlobal.empresa_razao_social) || null,
      empresa_cnpj:        cert.emissora_cnpj || (emissoraGlobal && emissoraGlobal.empresa_cnpj) || null,
      assinatura_base64:   cert.assinatura_base64 || null,
      assinatura_nome:     cert.assinatura_nome || null,
      assinatura_cargo:    cert.assinatura_cargo || null,
      instrutor_nome:      cert.assinatura_nome || (emissoraGlobal && emissoraGlobal.instrutor_nome) || null,
      instrutor_documento: cert.instrutor_documento || (emissoraGlobal && emissoraGlobal.instrutor_documento) || null,
      responsavel_tecnico_nome: cert.responsavel_tecnico_nome || (emissoraGlobal && emissoraGlobal.responsavel_tecnico_nome) || null,
      responsavel_tecnico_documento: cert.responsavel_tecnico_documento || (emissoraGlobal && emissoraGlobal.responsavel_tecnico_documento) || null,
      empresa_endereco: (emissoraGlobal && emissoraGlobal.empresa_endereco) || null,
      empresa_telefone: (emissoraGlobal && emissoraGlobal.empresa_telefone) || null,
      empresa_email:    (emissoraGlobal && emissoraGlobal.empresa_email) || null,
      fundo_frente_base64: cert.certificado_fundo_frente_base64 || FUNDO_FRENTE_PADRAO_BASE64 || null,
      fundo_verso_base64: cert.certificado_fundo_verso_base64 || FUNDO_VERSO_PADRAO_BASE64 || null,
    };

    res.json({
      valido: !expirado,
      expirado,
      codigo_validacao: cert.codigo_validacao,
      emitido_em: cert.emitido_em,
      valido_ate: cert.valido_ate,
      funcionario_nome: cert.funcionario_nome,
      cpf: cert.cpf,
      treinamento_titulo: cert.treinamento_titulo,
      carga_horaria_min: cert.carga_horaria_min,
      conteudo_programatico: cert.conteudo_programatico,
      data_inicio: periodo.data_inicio,
      data_fim: periodo.data_fim,
      emissora,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao validar certificado.' });
  }
};
