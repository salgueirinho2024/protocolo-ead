// api/player/certificado/pdf.js — GET /api/player/certificado/pdf?codigo=CERT-XXXX-YYYY
//
// Substitui o antigo `express.static('/uploads/certificados')`. Como a Vercel
// não tem filesystem persistente, o PDF é guardado em base64 no banco
// (coluna certificados.arquivo_pdf_base64) e devolvido aqui como binário puro.
//
// Rota pública por design (é o link que vai no certificado/QR code), mas só
// funciona com o código de validação certo — não dá pra "listar" certificados.
const db = require('../../../lib/db');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET')) return;

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
};
