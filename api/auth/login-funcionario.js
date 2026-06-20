// api/auth/login-funcionario.js — POST /api/auth/login-funcionario — funcionário entra por CPF + senha
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../lib/db');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'POST')) return;

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
};
