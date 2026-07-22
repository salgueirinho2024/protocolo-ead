// lib/certificado.js
//
// Cada treinamento carrega seu próprio cabeçalho de emissão
// (empresa emissora + assinatura digital em base64). A tabela
// global configuracao_emissora é usada apenas como fallback se
// o treinamento não tiver os campos preenchidos.
const db = require('./db');
const { calcularPeriodoTreinamentoFormatado } = require('./periodoTreinamento');
const { FUNDO_FRENTE_PADRAO_BASE64, FUNDO_VERSO_PADRAO_BASE64 } = require('./certificadoFundoPadrao');

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
            t.responsavel_tecnico_nome, t.responsavel_tecnico_documento, t.instrutor_documento,
            t.responsavel_tecnico_assinatura_base64,
            t.assinatura_escala, t.responsavel_tecnico_assinatura_escala,
            t.certificado_fundo_frente_base64, t.certificado_fundo_verso_base64,
            m.iniciado_em, m.concluido_em
       FROM matriculas m
       JOIN funcionarios fc ON fc.id = m.funcionario_id
       JOIN treinamentos t ON t.id = m.treinamento_id
      WHERE m.id = $1 AND m.funcionario_id = $2`,
    [matriculaId, funcionarioId]
  );

  if (!rows[0]) throw new Error('Matrícula não encontrada para geração do certificado.');
  const r = rows[0];

  const concluido_em = concluido_em_override || r.concluido_em || new Date();

  // Configuração global da emissora (responsável técnico / instrutor).
  // Antes só era buscada quando o treinamento NÃO tinha emissora própria,
  // o que fazia o nome do responsável técnico e do instrutor sumirem do
  // certificado sempre que o treinamento tinha emissora_nome preenchido.
  // Agora é sempre buscada: cada campo é resolvido individualmente,
  // dando prioridade ao que está cadastrado no treinamento.
  let emissoraGlobal = null;
  try {
    const { rows: er } = await db.query(`SELECT * FROM configuracao_emissora WHERE id = 1`);
    emissoraGlobal = er[0] || null;
  } catch (_) { /* tabela pode não existir */ }

  const emissora = {
    empresa_razao_social: r.emissora_nome || (emissoraGlobal && emissoraGlobal.empresa_razao_social) || null,
    empresa_cnpj:        r.emissora_cnpj || (emissoraGlobal && emissoraGlobal.empresa_cnpj) || null,
    assinatura_base64:   r.assinatura_base64 || null,
    assinatura_nome:     r.assinatura_nome || null,
    assinatura_cargo:    r.assinatura_cargo || null,
    instrutor_nome:      r.assinatura_nome || (emissoraGlobal && emissoraGlobal.instrutor_nome) || null,
    instrutor_documento: r.instrutor_documento || (emissoraGlobal && emissoraGlobal.instrutor_documento) || null,
    responsavel_tecnico_nome: r.responsavel_tecnico_nome || (emissoraGlobal && emissoraGlobal.responsavel_tecnico_nome) || null,
    responsavel_tecnico_documento: r.responsavel_tecnico_documento || (emissoraGlobal && emissoraGlobal.responsavel_tecnico_documento) || null,
    responsavel_tecnico_assinatura_base64: r.responsavel_tecnico_assinatura_base64 || null,
    assinatura_escala: r.assinatura_escala || 100,
    responsavel_tecnico_assinatura_escala: r.responsavel_tecnico_assinatura_escala || 100,
    empresa_endereco: (emissoraGlobal && emissoraGlobal.empresa_endereco) || null,
    empresa_telefone: (emissoraGlobal && emissoraGlobal.empresa_telefone) || null,
    empresa_email:    (emissoraGlobal && emissoraGlobal.empresa_email) || null,
    // Nome do próprio funcionário/participante, para a 3ª linha de
    // assinatura no certificado (ciente/participante do treinamento).
    participante_nome: r.nome,
    // Imagens de fundo do certificado (frente = página 1, verso = página 2).
    // Se o treinamento tiver a sua própria imagem cadastrada, ela tem
    // prioridade; senão, cai no fundo padrão embutido no código (sem
    // precisar reenviar essas imagens toda vez que um treinamento novo
    // for criado). O desenho antigo (moldura/folhas em CSS/SVG) só entra
    // em jogo se nem o fundo padrão estiver disponível.
    fundo_frente_base64: r.certificado_fundo_frente_base64 || FUNDO_FRENTE_PADRAO_BASE64 || null,
    fundo_verso_base64: r.certificado_fundo_verso_base64 || FUNDO_VERSO_PADRAO_BASE64 || null,
  };

  const codigo = codigoAleatorio();
  const dataConclusao = new Date(concluido_em);

  // Período do treinamento (início/fim) calculado a partir de QUANDO O
  // FUNCIONÁRIO iniciou (r.iniciado_em) + carga horária ÷ 8h por dia.
  // Não depende mais de datas fixas cadastradas no treinamento.
  const periodo = calcularPeriodoTreinamentoFormatado(r.iniciado_em, r.carga_horaria_min);

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
      data_inicio: periodo.data_inicio,
      data_fim: periodo.data_fim,
      data_conclusao: dataConclusao.toLocaleDateString('pt-BR'),
      valido_ate: validoAteDate ? validoAteDate.toLocaleDateString('pt-BR') : null,
      codigo_validacao: codigo,
      url_validacao: urlValidacao,
      emissora,
    },
  };
}

// Monta os dados de um certificado "de exemplo" (funcionário fictício),
// usados na pré-visualização durante o cadastro/edição do treinamento —
// antes de qualquer funcionário ter concluído o curso de verdade. Usa
// exatamente a mesma resolução de emissora/fundo/assinatura do certificado
// real, a partir dos campos ainda não salvos que estão no formulário.
async function montarPreviewCertificado(campos = {}) {
  let emissoraGlobal = null;
  try {
    const { rows: er } = await db.query(`SELECT * FROM configuracao_emissora WHERE id = 1`);
    emissoraGlobal = er[0] || null;
  } catch (_) { /* tabela pode não existir */ }

  const emissora = {
    empresa_razao_social: campos.emissora_nome || (emissoraGlobal && emissoraGlobal.empresa_razao_social) || null,
    empresa_cnpj:        campos.emissora_cnpj || (emissoraGlobal && emissoraGlobal.empresa_cnpj) || null,
    assinatura_base64:   campos.assinatura_base64 || null,
    assinatura_nome:     campos.assinatura_nome || null,
    assinatura_cargo:    campos.assinatura_cargo || null,
    instrutor_nome:      campos.assinatura_nome || (emissoraGlobal && emissoraGlobal.instrutor_nome) || null,
    instrutor_documento: campos.instrutor_documento || (emissoraGlobal && emissoraGlobal.instrutor_documento) || null,
    responsavel_tecnico_nome: campos.responsavel_tecnico_nome || (emissoraGlobal && emissoraGlobal.responsavel_tecnico_nome) || null,
    responsavel_tecnico_documento: campos.responsavel_tecnico_documento || (emissoraGlobal && emissoraGlobal.responsavel_tecnico_documento) || null,
    responsavel_tecnico_assinatura_base64: campos.responsavel_tecnico_assinatura_base64 || null,
    assinatura_escala: campos.assinatura_escala || 100,
    responsavel_tecnico_assinatura_escala: campos.responsavel_tecnico_assinatura_escala || 100,
    empresa_endereco: (emissoraGlobal && emissoraGlobal.empresa_endereco) || null,
    empresa_telefone: (emissoraGlobal && emissoraGlobal.empresa_telefone) || null,
    empresa_email:    (emissoraGlobal && emissoraGlobal.empresa_email) || null,
    participante_nome: 'Fulano de Tal da Silva',
    fundo_frente_base64: campos.certificado_fundo_frente_base64 || FUNDO_FRENTE_PADRAO_BASE64 || null,
    fundo_verso_base64: campos.certificado_fundo_verso_base64 || FUNDO_VERSO_PADRAO_BASE64 || null,
  };

  const hoje = new Date();
  const periodo = calcularPeriodoTreinamentoFormatado(hoje, campos.carga_horaria_min || 60);

  return {
    nome: 'Fulano de Tal da Silva',
    cpf: '000.000.000-00',
    titulo: campos.titulo || 'Nome do Treinamento',
    carga_horaria_min: campos.carga_horaria_min || 60,
    conteudo_programatico: campos.conteudo_programatico || '',
    data_inicio: periodo.data_inicio,
    data_fim: periodo.data_fim,
    data_conclusao: hoje.toLocaleDateString('pt-BR'),
    valido_ate: null,
    codigo_validacao: 'CERT-PREVIEW',
    url_validacao: `${process.env.APP_URL || ''}/validar/CERT-PREVIEW`,
    emissora,
  };
}

module.exports = { gerarCertificadoPDF, montarPreviewCertificado };
