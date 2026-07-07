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
  if (!metodoPermitido(req, res, 'GET', 'POST', 'PUT', 'DELETE')) return;

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        `SELECT e.id, e.razao_social, e.cnpj, e.email_contato, e.ativo,
                COUNT(DISTINCT f.id) AS total_funcionarios
           FROM empresas e
           LEFT JOIN funcionarios f ON f.empresa_id = e.id
          GROUP BY e.id
          ORDER BY e.criado_em DESC`
      );
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar empresas.' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'ID da empresa não informado.' });
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      // Remove usuários vinculados à empresa
      await client.query(
        `DELETE FROM usuarios WHERE id IN (SELECT usuario_id FROM empresa_usuarios WHERE empresa_id = $1)`,
        [id]
      );
      // Remove a empresa (cascata devia cuidar do resto, mas garantimos a ordem)
      const { rows } = await client.query(
        `DELETE FROM empresas WHERE id = $1 RETURNING id`, [id]
      );
      if (!rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ erro: 'Empresa não encontrada.' });
      }
      await client.query('COMMIT');
      return res.json({ mensagem: 'Empresa excluída.' });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao excluir empresa: ' + err.message });
    } finally {
      client.release();
    }
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'ID da empresa não informado.' });

    const { razao_social, cnpj, email_contato, telefone, ativo, admin_senha } = req.body || {};
    if (!razao_social || !cnpj) {
      return res.status(400).json({ erro: 'Campos obrigatórios faltando.' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: emp } = await client.query(
        `UPDATE empresas
            SET razao_social = $1, cnpj = $2, email_contato = $3, telefone = $4,
                ativo = COALESCE($5, ativo)
          WHERE id = $6
          RETURNING id`,
        [razao_social, cnpj.replace(/\D/g, ''), email_contato || null, telefone || null,
         typeof ativo === 'boolean' ? ativo : null, id]
      );

      if (!emp.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ erro: 'Empresa não encontrada.' });
      }

      // Senha do gestor é opcional na edição — só atualiza se foi enviada.
      if (admin_senha) {
        const hash = await bcrypt.hash(admin_senha, 12);
        await client.query(
          `UPDATE usuarios u
              SET senha_hash = $1
            WHERE u.id IN (SELECT usuario_id FROM empresa_usuarios WHERE empresa_id = $2)`,
          [hash, id]
        );
      }

      await client.query('COMMIT');
      return res.json({ empresaId: id });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return res.status(409).json({ erro: 'CNPJ ou e-mail já cadastrado.' });
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao editar empresa.' });
    } finally {
      client.release();
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
  if (!metodoPermitido(req, res, 'GET', 'POST', 'PUT', 'DELETE')) return;

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        `SELECT c.id, c.vagas_contratadas, c.status, c.data_inicio, c.data_limite,
                e.razao_social AS empresa_nome, t.titulo AS treinamento_titulo,
                COUNT(m.id) AS vagas_usadas
           FROM contratos c
           JOIN empresas e ON e.id = c.empresa_id
           JOIN treinamentos t ON t.id = c.treinamento_id
           LEFT JOIN matriculas m ON m.contrato_id = c.id
          GROUP BY c.id, e.razao_social, t.titulo
          ORDER BY c.criado_em DESC`
      );
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar contratos.' });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'ID do contrato não informado.' });
    try {
      const { rows } = await db.query(
        `DELETE FROM contratos WHERE id = $1 RETURNING id`, [id]
      );
      if (!rows[0]) return res.status(404).json({ erro: 'Contrato não encontrado.' });
      return res.json({ mensagem: 'Contrato excluído.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao excluir contrato: ' + err.message });
    }
  }

  if (req.method === 'PUT') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ erro: 'ID do contrato não informado.' });

    const { vagas_contratadas, data_limite, status } = req.body || {};
    const statusValidos = ['ativo', 'encerrado', 'cancelado'];
    if (status && !statusValidos.includes(status)) {
      return res.status(400).json({ erro: 'Status inválido.' });
    }

    try {
      if (vagas_contratadas) {
        const { rows: usoRows } = await db.query(
          `SELECT COUNT(*) AS usadas FROM matriculas WHERE contrato_id = $1`,
          [id]
        );
        if (parseInt(usoRows[0].usadas) > parseInt(vagas_contratadas)) {
          return res.status(422).json({ erro: `Não é possível reduzir para ${vagas_contratadas} vagas: já existem ${usoRows[0].usadas} funcionários vinculados a este contrato.` });
        }
      }

      const { rows } = await db.query(
        `UPDATE contratos
            SET vagas_contratadas = COALESCE($1, vagas_contratadas),
                data_limite = $2,
                status = COALESCE($3, status)
          WHERE id = $4
          RETURNING *`,
        [vagas_contratadas || null, data_limite || null, status || null, id]
      );
      if (!rows[0]) return res.status(404).json({ erro: 'Contrato não encontrado.' });
      return res.json(rows[0]);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao editar contrato.' });
    }
  }

  // POST
  const { empresa_id, treinamento_id, vagas_contratadas, data_limite, status } = req.body || {};
  if (!empresa_id || !treinamento_id || !vagas_contratadas) {
    return res.status(400).json({ erro: 'Campos obrigatórios faltando.' });
  }
  const statusValidos = ['ativo', 'encerrado', 'cancelado'];
  if (status && !statusValidos.includes(status)) {
    return res.status(400).json({ erro: 'Status inválido.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO contratos (empresa_id, treinamento_id, vagas_contratadas, data_limite, status, criado_por)
       VALUES ($1,$2,$3,$4,COALESCE($5::contrato_status,'ativo'::contrato_status),$6) RETURNING *`,
      [empresa_id, treinamento_id, vagas_contratadas, data_limite || null, status || null, user.id]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('Erro ao criar contrato:', err);
    if (err.code === '23503') {
      return res.status(422).json({ erro: 'Empresa ou treinamento informado não existe (FK).', detalhe: err.detail || err.message });
    }
    if (err.code === '23505') {
      return res.status(409).json({ erro: 'Contrato duplicado.', detalhe: err.detail || err.message });
    }
    if (err.code === '23502') {
      return res.status(400).json({ erro: 'Campo obrigatório faltando no banco.', detalhe: err.column || err.message });
    }
    if (err.code === '42703' || err.code === '42P01') {
      return res.status(500).json({ erro: 'Schema do banco desatualizado — rode as migrações em /migrations.', detalhe: err.message });
    }
    return res.status(500).json({ erro: 'Erro ao criar contrato: ' + (err.message || err.code || 'desconhecido'), detalhe: err.detail });
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