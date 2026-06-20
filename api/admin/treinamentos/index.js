// api/admin/treinamentos/index.js
//   GET  /api/admin/treinamentos  — lista treinamentos
//   POST /api/admin/treinamentos  — cria treinamento
const db = require('../../../lib/db');
const { exigirAuth } = require('../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

  const user = exigirAuth(req, res, 'super_admin');
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(`SELECT * FROM treinamentos ORDER BY criado_em DESC`);
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar treinamentos.' });
    }
  }

  // POST
  const { titulo, descricao, carga_horaria_min, nota_minima_prova, validade_certificado_meses } = req.body || {};
  if (!titulo || !carga_horaria_min) {
    return res.status(400).json({ erro: 'Título e carga horária são obrigatórios.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO treinamentos (titulo, descricao, carga_horaria_min, nota_minima_prova, validade_certificado_meses)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [titulo, descricao || null, carga_horaria_min, nota_minima_prova ?? 70, validade_certificado_meses ?? null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao criar treinamento.' });
  }
};
