// api/player/certificado/index.js — GET /api/player/certificado — metadados do certificado do funcionário
const db = require('../../../lib/db');
const { exigirAuth } = require('../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET')) return;

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
};
