// api/empresa/contratos/[id]/funcionarios/[[...fId]].js
//   GET    /api/empresa/contratos/:id/funcionarios        — lista funcionários do contrato
//   POST   /api/empresa/contratos/:id/funcionarios        — cadastra funcionário (trava de vagas aqui)
//   DELETE /api/empresa/contratos/:id/funcionarios/:fId   — remove funcionário (só se ainda não iniciou)
//
// Consolidado num único arquivo (catch-all opcional [[...fId]]) para caber
// no limite de 12 Serverless Functions do plano Hobby da Vercel. O Vercel
// entrega req.query.fId como array: [] quando a URL não tem o segmento
// extra (GET/POST) e ['algum-id'] quando tem (DELETE).
const bcrypt = require('bcryptjs');
const db = require('../../../../../lib/db');
const { exigirAuth } = require('../../../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;

  const user = exigirAuth(req, res, 'empresa_admin');
  if (!user) return;

  const { id, fId: fIdParam } = req.query;
  const fId = Array.isArray(fIdParam) ? fIdParam[0] : fIdParam;

  // ---- DELETE /api/empresa/contratos/:id/funcionarios/:fId ----
  if (fId) {
    if (!metodoPermitido(req, res, 'DELETE')) return;

    try {
      const { rows } = await db.query(
        `SELECT m.status, c.empresa_id
           FROM funcionarios_contrato fc
           JOIN contratos c ON c.id = fc.contrato_id
           LEFT JOIN matriculas m ON m.funcionario_id = fc.id
          WHERE fc.id = $1`,
        [fId]
      );

      if (!rows[0] || rows[0].empresa_id !== user.empresaId) {
        return res.status(404).json({ erro: 'Funcionário não encontrado.' });
      }
      if (rows[0].status && rows[0].status !== 'nao_iniciado') {
        return res.status(422).json({ erro: 'Não é possível remover quem já iniciou o treinamento.' });
      }

      await db.query(`DELETE FROM funcionarios_contrato WHERE id = $1`, [fId]);
      return res.json({ mensagem: 'Removido com sucesso.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao remover funcionário.' });
    }
  }

  // ---- GET/POST /api/empresa/contratos/:id/funcionarios ----
  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

  if (req.method === 'GET') {
    try {
      const { rows: cRows } = await db.query(`SELECT empresa_id FROM contratos WHERE id = $1`, [id]);
      if (!cRows[0] || cRows[0].empresa_id !== user.empresaId) {
        return res.status(403).json({ erro: 'Contrato não encontrado.' });
      }

      const { rows } = await db.query(
        `SELECT fc.id, fc.nome, fc.cpf, fc.email, fc.criado_em,
                m.status AS status_matricula, m.segundos_assistidos_total, m.concluido_em,
                cert.codigo_validacao AS certificado_codigo
           FROM funcionarios_contrato fc
           LEFT JOIN matriculas m ON m.funcionario_id = fc.id
           LEFT JOIN certificados cert ON cert.matricula_id = m.id
          WHERE fc.contrato_id = $1
          ORDER BY fc.criado_em ASC`,
        [id]
      );
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar funcionários.' });
    }
  }

  // POST
  const { nome, cpf, email, senha } = req.body || {};
  const cpfLimpo = (cpf || '').replace(/\D/g, '');

  if (!nome || cpfLimpo.length !== 11 || !senha) {
    return res.status(400).json({ erro: 'Nome, CPF (11 dígitos) e senha são obrigatórios.' });
  }
  if (senha.length < 6) {
    return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: cRows } = await client.query(
      `SELECT c.vagas_contratadas, c.empresa_id, c.treinamento_id, COUNT(fc.id) AS usadas
         FROM contratos c
         LEFT JOIN funcionarios_contrato fc ON fc.contrato_id = c.id
        WHERE c.id = $1
        GROUP BY c.id`,
      [id]
    );

    if (!cRows[0] || cRows[0].empresa_id !== user.empresaId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ erro: 'Contrato não encontrado.' });
    }
    if (parseInt(cRows[0].usadas) >= parseInt(cRows[0].vagas_contratadas)) {
      await client.query('ROLLBACK');
      return res.status(422).json({ erro: `Limite de ${cRows[0].vagas_contratadas} vagas atingido para este contrato.` });
    }

    const { rows: fRows } = await client.query(
      `INSERT INTO funcionarios_contrato (contrato_id, nome, cpf, email) VALUES ($1,$2,$3,$4) RETURNING id`,
      [id, nome.trim(), cpfLimpo, email || null]
    );

    const hash = await bcrypt.hash(senha, 12);
    await client.query(
      `INSERT INTO funcionario_acessos (funcionario_id, senha_hash) VALUES ($1,$2)`,
      [fRows[0].id, hash]
    );

    await client.query(
      `INSERT INTO matriculas (funcionario_id, treinamento_id) VALUES ($1,$2)`,
      [fRows[0].id, cRows[0].treinamento_id]
    );

    await client.query('COMMIT');
    return res.status(201).json({ id: fRows[0].id, nome: nome.trim(), cpf: cpfLimpo });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ erro: 'CPF já cadastrado neste contrato.' });
    if (err.code === 'check_violation' || /Limite de/.test(err.message || '')) {
      return res.status(422).json({ erro: 'Limite de vagas atingido para este contrato.' });
    }
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao cadastrar funcionário.' });
  } finally {
    client.release();
  }
};
