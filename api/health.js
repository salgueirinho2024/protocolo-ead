// api/health.js — GET /api/health — health check simples
const { aplicarCors, metodoPermitido } = require('../lib/http');

module.exports = (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!metodoPermitido(req, res, 'GET')) return;

  res.json({
    status: 'ok',
    ts: new Date().toISOString(),
    // DEBUG TEMPORÁRIO — remover depois de diagnosticar o erro 500 da prova.
    debug_errors_definido: process.env.DEBUG_ERRORS !== undefined,
    debug_errors_valor: process.env.DEBUG_ERRORS || null,
  });
};