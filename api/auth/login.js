// api/auth/login.js — POST /api/auth/login — super_admin e empresa_admin entram por e-mail + senha
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../lib/db');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'POST')) return;

  const { email, senha } = req.body || {};
  if (!email || !senha) return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });

  try {
    const { rows } = await db.query(
      `SELECT u.id, u.nome, u.email, u.senha_hash, u.role, u.ativo, eu.empresa_id
         FROM usuarios u
         LEFT JOIN empresa_usuarios eu ON eu.usuario_id = u.id
        WHERE u.email = $1
        LIMIT 1`,
      [email.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user || !user.ativo) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const senhaOk = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaOk) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const token = jwt.sign(
      { id: user.id, role: user.role, nome: user.nome, empresaId: user.empresa_id || null },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      usuario: { id: user.id, nome: user.nome, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno ao autenticar.' });
  }
};
