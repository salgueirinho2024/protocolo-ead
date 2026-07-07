// api/empresa/contratos/index.js — GET /api/empresa/contratos — contratos ativos da empresa logada
const db = require('../../../lib/db');
const { exigirAuth } = require('../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET')) return;

  const user = exigirAuth(req, res, 'empresa_admin');
  if (!user) return;

  try {
    const { rows } = await db.query(
      `SELECT c.id, c.vagas_contratadas, c.status,
              t.titulo AS treinamento_titulo, t.carga_horaria_min,
              COUNT(m.id) AS vagas_usadas
         FROM contratos c
         JOIN treinamentos t ON t.id = c.treinamento_id
         LEFT JOIN matriculas m ON m.contrato_id = c.id
        WHERE c.empresa_id = $1 AND c.status = 'ativo'
        GROUP BY c.id, t.titulo, t.carga_horaria_min
        ORDER BY c.criado_em DESC`,
      [user.empresaId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao listar contratos.' });
  }
};
