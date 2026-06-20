// lib/auth.js — valida o token JWT e checa o papel (role) do usuário
//
// No Express isso era middleware (autenticar, exigirRole) que rodava antes
// da rota. Em Vercel Functions não existe middleware chain automático —
// cada arquivo em /api é uma function isolada — então transformamos isso em
// uma função que cada handler chama explicitamente no início.
const jwt = require('jsonwebtoken');

/**
 * Lê e valida o token Bearer do header Authorization.
 * Retorna o payload decodificado ou null se inválido/ausente.
 */
function obterUsuario(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Exige autenticação e (opcionalmente) um papel específico.
 * Se inválido, já escreve a resposta de erro e retorna null.
 * Se válido, retorna o objeto do usuário (req.user equivalente).
 *
 * Uso típico no topo de um handler:
 *   const user = exigirAuth(req, res, 'super_admin');
 *   if (!user) return; // resposta de erro já foi enviada
 */
function exigirAuth(req, res, ...roles) {
  const user = obterUsuario(req);

  if (!user) {
    res.status(401).json({ erro: 'Token não fornecido, inválido ou expirado.' });
    return null;
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    res.status(403).json({ erro: 'Acesso negado para este tipo de usuário.' });
    return null;
  }

  return user;
}

module.exports = { obterUsuario, exigirAuth };
