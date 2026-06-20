// api/auth/login.js
//   POST /api/auth/login              — super_admin e empresa_admin entram por e-mail + senha
//   POST /api/auth/login-funcionario  — funcionário entra por CPF + senha
//
// Consolidado num único arquivo para caber no limite de 12 Serverless
// Functions do plano Hobby da Vercel. A URL /api/auth/login-funcionario
// continua existindo normalmente: um rewrite no vercel.json aponta as duas
// URLs para este mesmo arquivo, adicionando ?tipo=funcionario na query
// quando a rota é a de funcionário (ver vercel.json).
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../lib/db');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');

async function loginAdminOuEmpresa(req, res) {
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
}

async function loginFuncionario(req, res) {
  const cpf = ((req.body || {}).cpf || '').replace(/\D/g, '');
  const { senha } = req.body || {};

  if (!cpf || cpf.length !== 11 || !senha) {
    return res.status(400).json({ erro: 'CPF (11 dígitos) e senha são obrigatórios.' });
  }

  try {
    const { rows } = await db.query(
      `SELECT fc.id, fc.nome, fc.cpf, fc.contrato_id, fa.senha_hash, fa.id AS acesso_id
         FROM funcionarios_contrato fc
         JOIN funcionario_acessos fa ON fa.funcionario_id = fc.id
        WHERE fc.cpf = $1
        LIMIT 1`,
      [cpf]
    );

    const func = rows[0];
    if (!func || !func.senha_hash) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    const senhaOk = await bcrypt.compare(senha, func.senha_hash);
    if (!senhaOk) return res.status(401).json({ erro: 'Credenciais inválidas.' });

    await db.query(`UPDATE funcionario_acessos SET ultimo_login_em = now() WHERE id = $1`, [func.acesso_id]);

    const token = jwt.sign(
      { id: func.id, role: 'funcionario', nome: func.nome, contratoId: func.contrato_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, funcionario: { id: func.id, nome: func.nome, cpf: func.cpf } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno ao autenticar.' });
  }
}

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'POST')) return;

  if (req.query.tipo === 'funcionario') {
    return loginFuncionario(req, res);
  }
  return loginAdminOuEmpresa(req, res);
};
