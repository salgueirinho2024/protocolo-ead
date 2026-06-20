// api/admin/treinamentos/[id]/modulos.js
//   GET  /api/admin/treinamentos/:id/modulos  — lista módulos do treinamento
//   POST /api/admin/treinamentos/:id/modulos  — cria módulo
const db = require('../../../../lib/db');
const { exigirAuth } = require('../../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

  const user = exigirAuth(req, res, 'super_admin');
  if (!user) return;

  const { id } = req.query; // Vercel injeta os params de rota dinâmica em req.query

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        `SELECT * FROM treinamento_modulos WHERE treinamento_id = $1 ORDER BY ordem ASC`,
        [id]
      );
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar módulos.' });
    }
  }

  // POST
  const { titulo, ordem, video_provider_id, duracao_segundos } = req.body || {};
  if (!titulo || !ordem || !video_provider_id || !duracao_segundos) {
    return res.status(400).json({ erro: 'titulo, ordem, video_provider_id e duracao_segundos são obrigatórios.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO treinamento_modulos (treinamento_id, titulo, ordem, video_provider_id, duracao_segundos)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [id, titulo, ordem, video_provider_id, duracao_segundos]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ erro: 'Já existe um módulo com essa ordem neste treinamento.' });
    return res.status(500).json({ erro: 'Erro ao criar módulo.' });
  }
};
