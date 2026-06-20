// api/admin/contratos.js
//   GET  /api/admin/contratos  — lista contratos
//   POST /api/admin/contratos  — cria contrato (compra de vagas)
const db = require('../../lib/db');
const { exigirAuth } = require('../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

  const user = exigirAuth(req, res, 'super_admin');
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        `SELECT c.id, c.vagas_contratadas, c.status, c.data_inicio,
                e.razao_social AS empresa_nome, t.titulo AS treinamento_titulo,
                COUNT(fc.id) AS vagas_usadas
           FROM contratos c
           JOIN empresas e ON e.id = c.empresa_id
           JOIN treinamentos t ON t.id = c.treinamento_id
           LEFT JOIN funcionarios_contrato fc ON fc.contrato_id = c.id
          GROUP BY c.id, e.razao_social, t.titulo
          ORDER BY c.criado_em DESC`
      );
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar contratos.' });
    }
  }

  // POST
  const { empresa_id, treinamento_id, vagas_contratadas, data_limite } = req.body || {};
  if (!empresa_id || !treinamento_id || !vagas_contratadas) {
    return res.status(400).json({ erro: 'Campos obrigatórios faltando.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO contratos (empresa_id, treinamento_id, vagas_contratadas, data_limite, criado_por)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [empresa_id, treinamento_id, vagas_contratadas, data_limite || null, user.id]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao criar contrato.' });
  }
};
