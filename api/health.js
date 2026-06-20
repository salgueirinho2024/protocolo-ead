// api/health.js — GET /api/health — health check simples
const { aplicarCors, metodoPermitido } = require('../lib/http');

module.exports = (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!metodoPermitido(req, res, 'GET')) return;

  res.json({ status: 'ok', ts: new Date().toISOString() });
};
