// lib/http.js — utilidades que o Express fazia automaticamente (CORS, parsing)
// e que em Vercel Functions cada handler precisa aplicar a si mesmo.

/**
 * Aplica os headers de CORS. Chame no início de cada handler.
 * Retorna true se a requisição era um preflight OPTIONS já respondido
 * (nesse caso o handler deve apenas `return`).
 */
function aplicarCors(req, res) {
  const origens = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : null;
  const origin = req.headers.origin;

  if (!origens) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && origens.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Garante que o método HTTP é um dos permitidos; senão já responde 405.
 * Retorna true se o método é válido (handler deve continuar).
 */
function metodoPermitido(req, res, ...metodos) {
  if (!metodos.includes(req.method)) {
    res.setHeader('Allow', metodos.join(', '));
    res.status(405).json({ erro: `Método ${req.method} não permitido nesta rota.` });
    return false;
  }
  return true;
}

/**
 * Valida as variáveis de ambiente obrigatórias. Chame uma vez por handler
 * (é barato, e protege contra deploys com .env mal configurado).
 */
function validarEnv(res) {
  if (!process.env.JWT_SECRET || !process.env.DATABASE_URL) {
    console.error('❌ JWT_SECRET ou DATABASE_URL não configurados nas variáveis de ambiente da Vercel.');
    res.status(500).json({ erro: 'Servidor mal configurado. Contate o administrador.' });
    return false;
  }
  return true;
}

module.exports = { aplicarCors, metodoPermitido, validarEnv };
