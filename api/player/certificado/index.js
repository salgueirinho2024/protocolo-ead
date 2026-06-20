// api/player/certificado/index.js
//   GET /api/player/certificado            — lista (array) de certificados do funcionário logado
//   GET /api/player/certificado/pdf        — devolve o PDF binário, via ?codigo= (público,
//                                              usado no QR code) OU ?id= (autenticado, usado
//                                              pelo botão "Baixar PDF" da listagem)
//
// Consolidado num único arquivo para caber no limite de 12 Serverless
// Functions do plano Hobby da Vercel. A URL /api/player/certificado/pdf
// continua existindo normalmente: um rewrite no vercel.json aponta para
// este arquivo, adicionando ?rota=pdf na query (além do ?codigo= que o
// cliente já envia).
//
// Substitui o antigo `express.static('/uploads/certificados')`. Como a Vercel
// não tem filesystem persistente, o PDF é guardado em base64 no banco
// (coluna certificados.arquivo_pdf_base64) e devolvido aqui como binário puro.
const db = require('../../../lib/db');
const { exigirAuth } = require('../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../lib/http');

async function metadadosCertificado(req, res) {
  const user = exigirAuth(req, res, 'funcionario');
  if (!user) return;

  try {
    const { rows } = await db.query(
      `SELECT cert.id, cert.codigo_validacao, cert.arquivo_pdf_url, cert.emitido_em, cert.valido_ate,
              t.titulo AS treinamento_titulo, t.carga_horaria_min,
              fc.nome AS funcionario_nome, fc.cpf
         FROM certificados cert
         JOIN matriculas m ON m.id = cert.matricula_id
         JOIN funcionarios_contrato fc ON fc.id = m.funcionario_id
         JOIN treinamentos t ON t.id = m.treinamento_id
        WHERE m.funcionario_id = $1
        ORDER BY cert.emitido_em DESC`,
      [user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar certificado.' });
  }
}

async function pdfCertificado(req, res) {
  const codigo = (req.query.codigo || '').toString().toUpperCase().trim();
  const id = (req.query.id || '').toString().trim();

  if (!codigo && !id) {
    return res.status(400).json({ erro: 'Parâmetro codigo ou id é obrigatório.' });
  }

  try {
    let rows;
    if (codigo) {
      // Rota pública por design (é o link que vai no certificado/QR code), mas só
      // funciona com o código de validação certo — não dá pra "listar" certificados.
      ({ rows } = await db.query(
        `SELECT arquivo_pdf_base64, codigo_validacao FROM certificados WHERE codigo_validacao = $1`,
        [codigo]
      ));
    } else {
      // Download autenticado pelo próprio funcionário a partir da listagem
      // ("Baixar PDF"). Confere que o certificado pertence a quem está logado.
      const user = exigirAuth(req, res, 'funcionario');
      if (!user) return;
      ({ rows } = await db.query(
        `SELECT cert.arquivo_pdf_base64, cert.codigo_validacao
           FROM certificados cert
           JOIN matriculas m ON m.id = cert.matricula_id
          WHERE cert.id = $1 AND m.funcionario_id = $2`,
        [id, user.id]
      ));
    }

    if (!rows[0] || !rows[0].arquivo_pdf_base64) {
      return res.status(404).json({ erro: 'Certificado não encontrado.' });
    }

    const pdfBuffer = Buffer.from(rows[0].arquivo_pdf_base64, 'base64');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${rows[0].codigo_validacao}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.status(200).send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar o PDF do certificado.' });
  }
}

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET')) return;

  if (req.query.rota === 'pdf') {
    return pdfCertificado(req, res);
  }
  return metadadosCertificado(req, res);
};
