// api/validar/[codigo].js — GET /api/validar/:codigo — validação pública do certificado (QR code / link externo)
const db = require('../../lib/db');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET')) return;

  const { codigo } = req.query;

  try {
    const { rows } = await db.query(
      `SELECT cert.codigo_validacao, cert.emitido_em, cert.valido_ate,
              fc.nome AS funcionario_nome,
              t.titulo AS treinamento_titulo,
              t.carga_horaria_min
         FROM certificados cert
         JOIN matriculas m ON m.id = cert.matricula_id
         JOIN funcionarios_contrato fc ON fc.id = m.funcionario_id
         JOIN treinamentos t ON t.id = m.treinamento_id
        WHERE cert.codigo_validacao = $1`,
      [(codigo || '').toUpperCase()]
    );
    if (!rows[0]) {
      return res.status(404).json({ valido: false, mensagem: 'Certificado não encontrado.' });
    }
    const cert = rows[0];
    const expirado = cert.valido_ate && new Date(cert.valido_ate) < new Date();
    res.json({ valido: !expirado, expirado, ...cert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao validar certificado.' });
  }
};
