// api/empresa/contratos/[id]/funcionarios/index.js
//   GET    /api/empresa/contratos/:id/funcionarios        — lista funcionários do contrato
//   POST   /api/empresa/contratos/:id/funcionarios        — cadastra funcionário (trava de vagas aqui)
//   PUT    /api/empresa/contratos/:id/funcionarios/:fId   — edita funcionário (nome/CPF/e-mail, senha opcional)
//   DELETE /api/empresa/contratos/:id/funcionarios/:fId   — remove funcionário (só se ainda não iniciou)
//                                                             (chega aqui via rewrite no vercel.json,
//                                                              que passa o fId como query string)
//
// Anti-fraude de reuso de CPF (decisão tomada no protocolo): um CPF já
// cadastrado para um treinamento DENTRO DA MESMA EMPRESA (em qualquer
// contrato, mesmo encerrado/recriado) não pode ser cadastrado de novo para
// o mesmo treinamento por essa empresa — mas outra empresa cliente pode,
// já que o mesmo treinamento pode ser vendido a clientes diferentes. Isso
// evita o golpe de encerrar/recriar contrato pra "reciclar" vaga, sem
// travar o uso legítimo do catálogo por múltiplos clientes.
//
// Checagem feita a nível de aplicação (consulta antes do INSERT/UPDATE).
// Não há constraint a nível de banco ainda — pendência conhecida, fica
// para uma sessão futura se quiserem a "rede de segurança" extra no
// Postgres (índice único parcial ou trigger cruzando cpf+treinamento_id+
// empresa_id, que não são colunas diretas de funcionarios_contrato).
const bcrypt = require('bcryptjs');
const db = require('../../../../../lib/db');
const { exigirAuth } = require('../../../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../../../lib/http');

async function cpfJaUsadoNoTreinamento(client, { cpf, empresaId, treinamentoId, ignorarFuncionarioId }) {
  const { rows } = await client.query(
    `SELECT fc.id
       FROM funcionarios_contrato fc
       JOIN contratos c ON c.id = fc.contrato_id
      WHERE fc.cpf = $1 AND c.empresa_id = $2 AND c.treinamento_id = $3
        AND fc.id <> COALESCE($4, '00000000-0000-0000-0000-000000000000'::uuid)
      LIMIT 1`,
    [cpf, empresaId, treinamentoId, ignorarFuncionarioId || null]
  );
  return !!rows[0];
}

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;

  const user = exigirAuth(req, res, 'empresa_admin');
  if (!user) return;

  const { id, fId: fIdParam } = req.query;
  const fId = Array.isArray(fIdParam) ? fIdParam[0] : fIdParam;

  // ---- PUT/DELETE /api/empresa/contratos/:id/funcionarios/:fId ----
  if (fId) {
    if (!metodoPermitido(req, res, 'PUT', 'DELETE')) return;

    if (req.method === 'DELETE') {
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

    // PUT — editar nome/CPF/e-mail, resetar senha opcionalmente
    const { nome, cpf, email, senha } = req.body || {};
    const cpfLimpo = cpf !== undefined ? (cpf || '').replace(/\D/g, '') : undefined;

    if (!nome || (cpfLimpo !== undefined && cpfLimpo.length !== 11)) {
      return res.status(400).json({ erro: 'Nome é obrigatório e, se informado, o CPF deve ter 11 dígitos.' });
    }
    if (senha && senha.length < 6) {
      return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: fRows } = await client.query(
        `SELECT fc.id, fc.cpf AS cpf_atual, fc.contrato_id, c.empresa_id, c.treinamento_id
           FROM funcionarios_contrato fc
           JOIN contratos c ON c.id = fc.contrato_id
          WHERE fc.id = $1`,
        [fId]
      );

      if (!fRows[0] || fRows[0].empresa_id !== user.empresaId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ erro: 'Funcionário não encontrado.' });
      }

      const novoCpf = cpfLimpo !== undefined ? cpfLimpo : fRows[0].cpf_atual;

      // Reaplica a regra anti-fraude se o CPF estiver sendo trocado
      if (novoCpf !== fRows[0].cpf_atual) {
        const jaUsado = await cpfJaUsadoNoTreinamento(client, {
          cpf: novoCpf,
          empresaId: fRows[0].empresa_id,
          treinamentoId: fRows[0].treinamento_id,
          ignorarFuncionarioId: fId,
        });
        if (jaUsado) {
          await client.query('ROLLBACK');
          return res.status(409).json({ erro: 'Este CPF já está cadastrado para este treinamento nesta empresa.' });
        }
      }

      await client.query(
        `UPDATE funcionarios_contrato SET nome = $1, cpf = $2, email = $3 WHERE id = $4`,
        [nome.trim(), novoCpf, email || null, fId]
      );

      if (senha) {
        const hash = await bcrypt.hash(senha, 12);
        await client.query(
          `UPDATE funcionario_acessos SET senha_hash = $1 WHERE funcionario_id = $2`,
          [hash, fId]
        );
      }

      await client.query('COMMIT');
      return res.json({ id: fId, nome: nome.trim(), cpf: novoCpf });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return res.status(409).json({ erro: 'CPF já cadastrado neste contrato.' });
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao editar funcionário.' });
    } finally {
      client.release();
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

    // Anti-fraude: mesmo CPF não pode repetir o mesmo treinamento dentro
    // da mesma empresa, mesmo em outro contrato (encerrado/recriado).
    const jaUsado = await cpfJaUsadoNoTreinamento(client, {
      cpf: cpfLimpo,
      empresaId: cRows[0].empresa_id,
      treinamentoId: cRows[0].treinamento_id,
    });
    if (jaUsado) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Este CPF já está cadastrado para este treinamento nesta empresa.' });
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
