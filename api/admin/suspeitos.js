// api/admin/suspeitos.js — GET /api/admin/suspeitos — painel anti-fraude
const db = require('../../lib/db');
const { exigirAuth } = require('../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET')) return;

  const user = exigirAuth(req, res, 'super_admin');
  if (!user) return;

  try {
    const { rows } = await db.query(`SELECT * FROM vw_matriculas_suspeitas`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar matrículas suspeitas.' });
  }
};
