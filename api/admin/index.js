// api/admin/index.js
//   GET/POST /api/admin/empresas   — lista/cria empresas clientes
//   GET/POST /api/admin/contratos  — lista/cria contratos (venda de vagas)
//   GET      /api/admin/suspeitos  — matrículas com sinais de fraude
//
// Consolidado num único arquivo para caber no limite de 12 Serverless
// Functions do plano Hobby da Vercel. As três URLs continuam existindo
// normalmente: rewrites no vercel.json apontam todas para este arquivo,
// adicionando ?recurso=empresas|contratos|suspeitos na query.
const bcrypt = require('bcryptjs');
const db = require('../../lib/db');
const { exigirAuth } = require('../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');

async function handleEmpresas(req, res) {
  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

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
}

async function handleContratos(req, res, user) {
  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        `SELECT c.id, c.vagas_contratadas, c.status, c.data_inicio,
                e.razao_social AS empresa_nome, t.titulo AS treinamento_titulo,
                COUNT(fc.id) AS vagas_usadas
           FROM contratos c
           JOIN empresas e ON e.id = c.empresa_id
           JOIN treinamentos t ON t.id = c.treinamento_id
           LEFT JOIN funcionarios_contrato fc ON fc.contrato_id = c.id
          GROUP BY c.id, e.razao_social, t.titulo
          ORDER BY c.criado_em DESC`
      );
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar contratos.' });
    }
  }

  // POST
  const { empresa_id, treinamento_id, vagas_contratadas, data_limite } = req.body || {};
  if (!empresa_id || !treinamento_id || !vagas_contratadas) {
    return res.status(400).json({ erro: 'Campos obrigatórios faltando.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO contratos (empresa_id, treinamento_id, vagas_contratadas, data_limite, criado_por)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [empresa_id, treinamento_id, vagas_contratadas, data_limite || null, user.id]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao criar contrato.' });
  }
}

async function handleSuspeitos(req, res) {
  if (!metodoPermitido(req, res, 'GET')) return;

  try {
    const { rows } = await db.query(`SELECT * FROM vw_matriculas_suspeitas`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar matrículas suspeitas.' });
  }
}

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;

  const user = exigirAuth(req, res, 'super_admin');
  if (!user) return;

  switch (req.query.recurso) {
    case 'contratos':
      return handleContratos(req, res, user);
    case 'suspeitos':
      return handleSuspeitos(req, res);
    case 'empresas':
      return handleEmpresas(req, res);
    default:
      return res.status(404).json({ erro: 'Recurso não encontrado.' });
  }
};
