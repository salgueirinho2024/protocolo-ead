// api/empresa/funcionarios/index.js
//   GET    /api/empresa/funcionarios         — lista TODOS os funcionários da empresa
//                                                (sem limite de vagas aqui — a empresa
//                                                 cadastra quantos funcionários quiser)
//   POST   /api/empresa/funcionarios         — cadastra funcionário (nome/CPF/e-mail/senha)
//   PUT    /api/empresa/funcionarios/:fId    — edita funcionário (senha opcional)
//   DELETE /api/empresa/funcionarios/:fId    — remove funcionário (só se nenhuma matrícula
//                                                dele já foi iniciada)
//
//   GET    /api/empresa/contratos/:id/matriculas       — lista quem está vinculado a este
//                                                          contrato (funcionário + progresso)
//   POST   /api/empresa/contratos/:id/matriculas       — vincula um funcionário JÁ CADASTRADO
//                                                          a este contrato/treinamento
//                                                          (é AQUI que a trava de vagas entra)
//   DELETE /api/empresa/contratos/:id/matriculas/:mId  — desvincula (só se ainda não iniciou)
//
// (chega aqui via rewrites no vercel.json, que traduzem essas URLs "bonitas"
//  em query string — ver vercel.json)
//
// DESENHO: `funcionarios` é o cadastro único da empresa (1 pessoa = 1 login,
// reaproveitado pra sempre, sem limite de quantos podem existir). `matriculas`
// é o vínculo entre um funcionário e UM contrato específico — é só nesse
// vínculo que a vaga do contrato é consumida. Isso permite:
//   (a) cadastrar funcionários sem limite;
//   (b) vincular o mesmo funcionário a treinamentos diferentes;
//   (c) vincular de novo ao MESMO treinamento num contrato novo
//       (reciclagem/retreinamento), já que a trava é por
//       (funcionario_id, contrato_id) — não mais (funcionario_id,
//       treinamento_id) pra sempre.
const bcrypt = require('bcryptjs');
const db = require('../../../lib/db');
const { exigirAuth } = require('../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../lib/http');
const { calcularPeriodoTreinamentoFormatado } = require('../../../lib/periodoTreinamento');

// ─────────────────────────────────────────────────────────
// Funcionários (cadastro da empresa, sem limite de vagas)
// ─────────────────────────────────────────────────────────

async function handleFuncionarios(req, res, user, fId) {
  if (fId) {
    if (!metodoPermitido(req, res, 'PUT', 'DELETE')) return;

    if (req.method === 'DELETE') {
      try {
        const { rows } = await db.query(
          `SELECT f.empresa_id,
                  BOOL_OR(m.status IS NOT NULL AND m.status <> 'nao_iniciado') AS tem_matricula_iniciada
             FROM funcionarios f
             LEFT JOIN matriculas m ON m.funcionario_id = f.id
            WHERE f.id = $1
            GROUP BY f.empresa_id`,
          [fId]
        );
        if (!rows[0] || rows[0].empresa_id !== user.empresaId) {
          return res.status(404).json({ erro: 'Funcionário não encontrado.' });
        }
        if (rows[0].tem_matricula_iniciada) {
          return res.status(422).json({ erro: 'Não é possível remover um funcionário que já iniciou algum treinamento. Desvincule os treinamentos dele primeiro.' });
        }
        await db.query(`DELETE FROM funcionarios WHERE id = $1`, [fId]);
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
        `SELECT id, empresa_id FROM funcionarios WHERE id = $1`,
        [fId]
      );
      if (!fRows[0] || fRows[0].empresa_id !== user.empresaId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ erro: 'Funcionário não encontrado.' });
      }

      await client.query(
        `UPDATE funcionarios SET nome = $1, cpf = COALESCE($2, cpf), email = $3 WHERE id = $4`,
        [nome.trim(), cpfLimpo !== undefined ? cpfLimpo : null, email || null, fId]
      );

      if (senha) {
        const hash = await bcrypt.hash(senha, 12);
        await client.query(
          `UPDATE funcionario_acessos SET senha_hash = $1 WHERE funcionario_id = $2`,
          [hash, fId]
        );
      }

      await client.query('COMMIT');
      return res.json({ id: fId, nome: nome.trim() });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return res.status(409).json({ erro: 'Este CPF já está cadastrado para outro funcionário desta empresa.' });
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao editar funcionário.' });
    } finally {
      client.release();
    }
  }

  // ---- GET/POST /api/empresa/funcionarios ----
  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        `SELECT f.id, f.nome, f.cpf, f.email, f.criado_em,
                COUNT(m.id) AS total_treinamentos,
                COUNT(m.id) FILTER (WHERE m.status = 'concluido') AS treinamentos_concluidos
           FROM funcionarios f
           LEFT JOIN matriculas m ON m.funcionario_id = f.id
          WHERE f.empresa_id = $1
          GROUP BY f.id
          ORDER BY f.nome ASC`,
        [user.empresaId]
      );
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar funcionários.' });
    }
  }

  // POST — cadastro livre, SEM checagem de vagas (a vaga só é
  // consumida quando o funcionário é VINCULADO a um contrato)
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

    const { rows: fRows } = await client.query(
      `INSERT INTO funcionarios (empresa_id, nome, cpf, email) VALUES ($1,$2,$3,$4) RETURNING id`,
      [user.empresaId, nome.trim(), cpfLimpo, email || null]
    );

    const hash = await bcrypt.hash(senha, 12);
    await client.query(
      `INSERT INTO funcionario_acessos (funcionario_id, senha_hash) VALUES ($1,$2)`,
      [fRows[0].id, hash]
    );

    await client.query('COMMIT');
    return res.status(201).json({ id: fRows[0].id, nome: nome.trim(), cpf: cpfLimpo });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ erro: 'Este CPF já está cadastrado para outro funcionário desta empresa.' });
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao cadastrar funcionário.' });
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────
// Matrículas (vincular um funcionário já cadastrado a um
// contrato — é AQUI que a trava de vagas do contrato entra)
// ─────────────────────────────────────────────────────────

async function handleMatriculas(req, res, user, contratoId, mId) {
  const { rows: cRows } = await db.query(
    `SELECT empresa_id, treinamento_id FROM contratos WHERE id = $1`,
    [contratoId]
  );
  if (!cRows[0] || cRows[0].empresa_id !== user.empresaId) {
    return res.status(403).json({ erro: 'Contrato não encontrado.' });
  }

  if (mId) {
    if (!metodoPermitido(req, res, 'DELETE')) return;
    try {
      const { rows } = await db.query(
        `SELECT status FROM matriculas WHERE id = $1 AND contrato_id = $2`,
        [mId, contratoId]
      );
      if (!rows[0]) return res.status(404).json({ erro: 'Vínculo não encontrado.' });
      if (rows[0].status !== 'nao_iniciado') {
        return res.status(422).json({ erro: 'Não é possível desvincular quem já iniciou o treinamento.' });
      }
      await db.query(`DELETE FROM matriculas WHERE id = $1`, [mId]);
      return res.json({ mensagem: 'Desvinculado com sucesso.' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao desvincular funcionário.' });
    }
  }

  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        `SELECT m.id AS matricula_id, f.id AS funcionario_id, f.nome, f.cpf, f.email,
                m.status AS status_matricula, m.segundos_assistidos_total,
                m.iniciado_em, m.concluido_em, t.carga_horaria_min,
                cert.codigo_validacao AS certificado_codigo
           FROM matriculas m
           JOIN funcionarios f ON f.id = m.funcionario_id
           JOIN treinamentos t ON t.id = m.treinamento_id
           LEFT JOIN certificados cert ON cert.matricula_id = m.id
          WHERE m.contrato_id = $1
          ORDER BY f.nome ASC`,
        [contratoId]
      );
      // Período previsto (início/fim) de cada funcionário, calculado a
      // partir de quando ELE iniciou + carga horária ÷ 8h por dia — não
      // depende mais de uma data fixa cadastrada no treinamento.
      const comPeriodo = rows.map(r => ({
        ...r,
        periodo_previsto: calcularPeriodoTreinamentoFormatado(r.iniciado_em, r.carga_horaria_min),
      }));
      return res.json(comPeriodo);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar vínculos do contrato.' });
    }
  }

  // POST — vincular funcionário existente a este contrato
  const { funcionario_id } = req.body || {};
  if (!funcionario_id) {
    return res.status(400).json({ erro: 'funcionario_id é obrigatório.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: fRows } = await client.query(
      `SELECT id, empresa_id FROM funcionarios WHERE id = $1 FOR UPDATE`,
      [funcionario_id]
    );
    if (!fRows[0] || fRows[0].empresa_id !== user.empresaId) {
      await client.query('ROLLBACK');
      return res.status(404).json({ erro: 'Funcionário não encontrado.' });
    }

    const { rows: cRows2 } = await client.query(
      `SELECT c.vagas_contratadas, COUNT(m.id) AS usadas
         FROM contratos c
         LEFT JOIN matriculas m ON m.contrato_id = c.id
        WHERE c.id = $1
        GROUP BY c.id`,
      [contratoId]
    );
    if (parseInt(cRows2[0].usadas) >= parseInt(cRows2[0].vagas_contratadas)) {
      await client.query('ROLLBACK');
      return res.status(422).json({ erro: `Limite de ${cRows2[0].vagas_contratadas} vagas atingido para este contrato.` });
    }

    const { rows: mRows } = await client.query(
      `INSERT INTO matriculas (funcionario_id, contrato_id, treinamento_id)
       VALUES ($1, $2, $3) RETURNING id`,
      [funcionario_id, contratoId, cRows[0].treinamento_id]
    );

    await client.query('COMMIT');
    return res.status(201).json({ matricula_id: mRows[0].id });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ erro: 'Este funcionário já está vinculado a este contrato.' });
    if (err.code === 'check_violation' || /Limite de/.test(err.message || '')) {
      return res.status(422).json({ erro: 'Limite de vagas atingido para este contrato.' });
    }
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao vincular funcionário.' });
  } finally {
    client.release();
  }
}

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;

  const user = exigirAuth(req, res, 'empresa_admin');
  if (!user) return;

  const { fId: fIdParam, sub, contratoId: contratoIdParam, mId: mIdParam } = req.query;
  const fId = Array.isArray(fIdParam) ? fIdParam[0] : fIdParam;
  const contratoId = Array.isArray(contratoIdParam) ? contratoIdParam[0] : contratoIdParam;
  const mId = Array.isArray(mIdParam) ? mIdParam[0] : mIdParam;

  if (sub === 'matriculas') {
    if (!contratoId) return res.status(400).json({ erro: 'contratoId é obrigatório.' });
    return handleMatriculas(req, res, user, contratoId, mId);
  }

  return handleFuncionarios(req, res, user, fId);
};
