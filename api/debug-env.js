// api/debug-env.js — ARQUIVO TEMPORÁRIO DE DIAGNÓSTICO
// Acesse GET /api/debug-env no navegador (sem precisar estar logado) pra
// confirmar se a variável DEBUG_ERRORS está realmente visível na função.
// APAGAR este arquivo depois de resolver o problema — não deixar em produção.
module.exports = (req, res) => {
  res.json({
    debug_errors_definido: process.env.DEBUG_ERRORS !== undefined,
    debug_errors_valor: process.env.DEBUG_ERRORS || null,
    node_env: process.env.NODE_ENV || null,
    tem_database_url: !!process.env.DATABASE_URL,
    tem_jwt_secret: !!process.env.JWT_SECRET,
  });
};
