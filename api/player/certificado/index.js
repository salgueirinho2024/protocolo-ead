// api/player/certificado/index.js
//   GET /api/player/certificado            — metadados do certificado (autenticado, funcionário)
//   GET /api/player/certificado/pdf        — devolve o PDF binário (público, via ?codigo=)
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
      `SELECT cert.codigo_validacao, cert.arquivo_pdf_url, cert.emitido_em, cert.valido_ate,
              t.titulo AS treinamento_titulo, t.carga_horaria_min,
              fc.nome AS funcionario_nome, fc.cpf
         FROM certificados cert
         JOIN matriculas m ON m.id = cert.matricula_id
         JOIN funcionarios_contrato fc ON fc.id = m.funcionario_id
         JOIN treinamentos t ON t.id = m.treinamento_id
        WHERE m.funcionario_id = $1
        LIMIT 1`,
      [user.id]
    );
    if (!rows[0]) return res.status(404).json({ erro: 'Certificado não encontrado.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar certificado.' });
  }
}

async function pdfCertificado(req, res) {
  // Rota pública por design (é o link que vai no certificado/QR code), mas só
  // funciona com o código de validação certo — não dá pra "listar" certificados.
  const codigo = (req.query.codigo || '').toString().toUpperCase().trim();
  if (!codigo) return res.status(400).json({ erro: 'Parâmetro codigo é obrigatório.' });

  try {
    const { rows } = await db.query(
      `SELECT arquivo_pdf_base64, codigo_validacao FROM certificados WHERE codigo_validacao = $1`,
      [codigo]
    );

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
