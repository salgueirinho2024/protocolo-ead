// api/player/sessao/iniciar.js — POST /api/player/sessao/iniciar — abre sessão de visualização
const db = require('../../../lib/db');
const { exigirAuth } = require('../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../lib/http');

async function minhaMatricula(matriculaId, funcionarioId) {
  const { rows } = await db.query(
    `SELECT id FROM matriculas WHERE id = $1 AND funcionario_id = $2`,
    [matriculaId, funcionarioId]
  );
  return rows[0] || null;
}

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'POST')) return;

  const user = exigirAuth(req, res, 'funcionario');
  if (!user) return;

  const { matricula_id, modulo_id } = req.body || {};
  if (!matricula_id || !modulo_id) return res.status(400).json({ erro: 'matricula_id e modulo_id são obrigatórios.' });

  try {
    const mat = await minhaMatricula(matricula_id, user.id);
    if (!mat) return res.status(403).json({ erro: 'Matrícula não encontrada.' });

    await db.query(
      `UPDATE matriculas SET status = 'em_andamento', iniciado_em = COALESCE(iniciado_em, now())
        WHERE id = $1 AND status = 'nao_iniciado'`,
      [matricula_id]
    );

    // Em Vercel, req.ip não existe nativamente — usamos o header padrão do proxy
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;

    const { rows } = await db.query(
      `INSERT INTO sessoes_visualizacao (matricula_id, modulo_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4) RETURNING id, inicio_em`,
      [matricula_id, modulo_id, ip, req.headers['user-agent'] || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao iniciar sessão.' });
  }
};
