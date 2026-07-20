// api/player/certificado/index.js
//   GET /api/player/certificado       — lista certificados do funcionário logado
//                                       (inclui dados_certificado para o frontend gerar o PDF)
//   GET /api/player/certificado?rota=pdf&codigo=XXXX — rota de validação pública
//                                       (retorna metadados em JSON, pois o PDF é gerado no frontend)
const db = require('../../../lib/db');
const { exigirAuth } = require('../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../lib/http');
const { calcularPeriodoTreinamentoFormatado } = require('../../../lib/periodoTreinamento');
const { FUNDO_FRENTE_PADRAO_BASE64, FUNDO_VERSO_PADRAO_BASE64 } = require('../../../lib/certificadoFundoPadrao');

async function metadadosCertificado(req, res) {
  const user = exigirAuth(req, res, 'funcionario');
  if (!user) return;

  try {
    const { rows } = await db.query(
      `SELECT cert.id, cert.codigo_validacao, cert.arquivo_pdf_url, cert.emitido_em, cert.valido_ate,
              t.titulo AS treinamento_titulo, t.carga_horaria_min, t.conteudo_programatico,
              t.emissora_nome, t.emissora_cnpj,
              t.assinatura_base64, t.assinatura_nome, t.assinatura_cargo,
              t.responsavel_tecnico_nome, t.responsavel_tecnico_documento, t.instrutor_documento,
              t.certificado_fundo_frente_base64, t.certificado_fundo_verso_base64,
              m.iniciado_em,
              fc.nome AS funcionario_nome, fc.cpf
         FROM certificados cert
         JOIN matriculas m ON m.id = cert.matricula_id
         JOIN funcionarios fc ON fc.id = m.funcionario_id
         JOIN treinamentos t ON t.id = m.treinamento_id
        WHERE m.funcionario_id = $1
        ORDER BY cert.emitido_em DESC`,
      [user.id]
    );

    // Configuração global da emissora (responsável técnico / instrutor).
    // Antes só era buscada quando ALGUM certificado não tinha emissora_nome
    // própria, o que fazia o nome do responsável técnico e do instrutor
    // sumirem do certificado sempre que o treinamento tinha emissora_nome
    // preenchido. Agora é sempre buscada; cada campo abaixo é resolvido
    // individualmente, priorizando o que está cadastrado no treinamento.
    let emissoraGlobal = null;
    try {
      const { rows: er } = await db.query(`SELECT * FROM configuracao_emissora WHERE id = 1`);
      emissoraGlobal = er[0] || null;
    } catch (_) { /* tabela pode não existir */ }

    // Adiciona dados_certificado em cada registro para o frontend montar o PDF
    const resultado = rows.map(c => {
      // Período (início/fim) calculado a partir de quando o funcionário
      // iniciou o treinamento + carga horária ÷ 8h por dia.
      const periodo = calcularPeriodoTreinamentoFormatado(c.iniciado_em, c.carga_horaria_min);
      const emissora = {
        empresa_razao_social: c.emissora_nome || (emissoraGlobal && emissoraGlobal.empresa_razao_social) || null,
        empresa_cnpj:        c.emissora_cnpj || (emissoraGlobal && emissoraGlobal.empresa_cnpj) || null,
        assinatura_base64:   c.assinatura_base64 || null,
        assinatura_nome:     c.assinatura_nome || null,
        assinatura_cargo:    c.assinatura_cargo || null,
        instrutor_nome:      c.assinatura_nome || (emissoraGlobal && emissoraGlobal.instrutor_nome) || null,
        instrutor_documento: c.instrutor_documento || (emissoraGlobal && emissoraGlobal.instrutor_documento) || null,
        responsavel_tecnico_nome: c.responsavel_tecnico_nome || (emissoraGlobal && emissoraGlobal.responsavel_tecnico_nome) || null,
        responsavel_tecnico_documento: c.responsavel_tecnico_documento || (emissoraGlobal && emissoraGlobal.responsavel_tecnico_documento) || null,
        empresa_endereco: (emissoraGlobal && emissoraGlobal.empresa_endereco) || null,
        empresa_telefone: (emissoraGlobal && emissoraGlobal.empresa_telefone) || null,
        empresa_email:    (emissoraGlobal && emissoraGlobal.empresa_email) || null,
        // Nome do próprio funcionário/participante, para a 3ª linha de
        // assinatura no certificado (ciente/participante do treinamento).
        participante_nome: c.funcionario_nome,
        // Imagens de fundo do certificado (frente = página 1, verso = página 2).
        // Se o treinamento tiver a sua própria imagem cadastrada, ela tem
        // prioridade; senão, cai no fundo padrão embutido no código.
        fundo_frente_base64: c.certificado_fundo_frente_base64 || FUNDO_FRENTE_PADRAO_BASE64 || null,
        fundo_verso_base64: c.certificado_fundo_verso_base64 || FUNDO_VERSO_PADRAO_BASE64 || null,
      };
      return {
      ...c,
      dados_certificado: {
        nome: c.funcionario_nome,
        cpf: c.cpf,
        titulo: c.treinamento_titulo,
        carga_horaria_min: c.carga_horaria_min,
        conteudo_programatico: c.conteudo_programatico,
        data_inicio: periodo.data_inicio,
        data_fim: periodo.data_fim,
        data_conclusao: c.emitido_em ? new Date(c.emitido_em).toLocaleDateString('pt-BR') : '—',
        valido_ate: c.valido_ate ? new Date(c.valido_ate).toLocaleDateString('pt-BR') : null,
        codigo_validacao: c.codigo_validacao,
        emissora,
      },
      };
    });

    res.json(resultado);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar certificado.' });
  }
}

async function validacaoPublica(req, res) {
  const codigo = (req.query.codigo || '').toString().toUpperCase().trim();
  if (!codigo) return res.status(400).json({ erro: 'Parâmetro codigo é obrigatório.' });

  try {
    const { rows } = await db.query(
      `SELECT cert.codigo_validacao, cert.emitido_em, cert.valido_ate,
              t.titulo AS treinamento_titulo, t.carga_horaria_min,
              m.iniciado_em,
              fc.nome AS funcionario_nome
         FROM certificados cert
         JOIN matriculas m ON m.id = cert.matricula_id
         JOIN funcionarios fc ON fc.id = m.funcionario_id
         JOIN treinamentos t ON t.id = m.treinamento_id
        WHERE cert.codigo_validacao = $1`,
      [codigo]
    );

    if (!rows[0]) return res.status(404).json({ erro: 'Certificado não encontrado.' });
    const periodo = calcularPeriodoTreinamentoFormatado(rows[0].iniciado_em, rows[0].carga_horaria_min);
    res.json({ valido: true, ...rows[0], data_inicio: periodo.data_inicio, data_fim: periodo.data_fim });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao validar certificado.' });
  }
}

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET')) return;

  if (req.query.rota === 'pdf') {
    return validacaoPublica(req, res);
  }
  return metadadosCertificado(req, res);
};