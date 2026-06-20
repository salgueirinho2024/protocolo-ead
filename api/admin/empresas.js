// api/admin/empresas.js
//   GET  /api/admin/empresas  — lista empresas
//   POST /api/admin/empresas  — cria empresa + usuário admin dela
const bcrypt = require('bcryptjs');
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
        `SELECT e.id, e.razao_social, e.cnpj, e.email_contato, e.ativo,
                COUNT(DISTINCT fc.id) AS total_funcionarios
           FROM empresas e
           LEFT JOIN contratos c ON c.empresa_id = e.id
           LEFT JOIN funcionarios_contrato fc ON fc.contrato_id = c.id
          GROUP BY e.id
          ORDER BY e.criado_em DESC`
      );
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar empresas.' });
    }
  }

  // POST
  const { razao_social, cnpj, email_contato, telefone, admin_email, admin_senha } = req.body || {};
  if (!razao_social || !cnpj || !admin_email || !admin_senha) {
    return res.status(400).json({ erro: 'Campos obrigatórios faltando.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: emp } = await client.query(
      `INSERT INTO empresas (razao_social, cnpj, email_contato, telefone) VALUES ($1,$2,$3,$4) RETURNING id`,
      [razao_social, cnpj.replace(/\D/g, ''), email_contato || null, telefone || null]
    );

    const hash = await bcrypt.hash(admin_senha, 12);
    const { rows: usr } = await client.query(
      `INSERT INTO usuarios (nome, email, senha_hash, role) VALUES ($1,$2,$3,'empresa_admin') RETURNING id`,
      [razao_social, admin_email.toLowerCase().trim(), hash]
    );

    await client.query(
      `INSERT INTO empresa_usuarios (empresa_id, usuario_id) VALUES ($1,$2)`,
      [emp[0].id, usr[0].id]
    );

    await client.query('COMMIT');
    return res.status(201).json({ empresaId: emp[0].id, usuarioId: usr[0].id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ erro: 'CNPJ ou e-mail já cadastrado.' });
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao criar empresa.' });
  } finally {
    client.release();
  }
};
