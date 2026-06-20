// api/admin/treinamentos.js
//   GET    /api/admin/treinamentos                       — lista treinamentos
//   POST   /api/admin/treinamentos                       — cria treinamento
//   PUT    /api/admin/treinamentos/:id                    — edita treinamento
//   DELETE /api/admin/treinamentos/:id                    — exclui treinamento (bloqueado se houver contratos)
//   GET    /api/admin/treinamentos/:id/modulos             — lista módulos do treinamento
//   POST   /api/admin/treinamentos/:id/modulos             — cria módulo
//   PUT    /api/admin/treinamentos/:id/modulos/:moduloId   — edita módulo
//   DELETE /api/admin/treinamentos/:id/modulos/:moduloId   — exclui módulo (bloqueado se já houver progresso assistido)
//
// Arquivo plano (sem subpasta catch-all) para caber no limite de 12
// Serverless Functions do plano Hobby da Vercel. O roteamento de
// /:id, /:id/modulos e /:id/modulos/:moduloId é feito via rewrites no
// vercel.json, que repassam id, sub e moduloId como query string — mesmo
// padrão usado em api/admin/index.js (validado e funcionando).
const db = require('../../lib/db');
const { exigirAuth } = require('../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');

async function handleTreinamentos(req, res) {
  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        `SELECT t.*, COALESCE(COUNT(tm.id), 0) AS total_modulos
           FROM treinamentos t
           LEFT JOIN treinamento_modulos tm ON tm.treinamento_id = t.id
          GROUP BY t.id
          ORDER BY t.criado_em DESC`
      );
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar treinamentos.' });
    }
  }

  // POST
  const {
    titulo, descricao, carga_horaria_min, nota_minima_prova, validade_certificado_meses,
    conteudo_programatico, data_inicio, data_fim, ativo,
  } = req.body || {};
  if (!titulo || !carga_horaria_min) {
    return res.status(400).json({ erro: 'Título e carga horária são obrigatórios.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO treinamentos
         (titulo, descricao, carga_horaria_min, nota_minima_prova, validade_certificado_meses,
          conteudo_programatico, data_inicio, data_fim, ativo)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, TRUE))
       RETURNING *`,
      [titulo, descricao || null, carga_horaria_min, nota_minima_prova ?? 70, validade_certificado_meses ?? null,
       conteudo_programatico || null, data_inicio || null, data_fim || null,
       typeof ativo === 'boolean' ? ativo : null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao criar treinamento.' });
  }
}

async function handleTreinamentoPorId(req, res, treinamentoId) {
  if (!metodoPermitido(req, res, 'PUT', 'DELETE')) return;

  if (req.method === 'DELETE') {
    try {
      const { rows } = await db.query(`DELETE FROM treinamentos WHERE id = $1 RETURNING id`, [treinamentoId]);
      if (!rows[0]) return res.status(404).json({ erro: 'Treinamento não encontrado.' });
      return res.json({ mensagem: 'Treinamento excluído.' });
    } catch (err) {
      if (err.code === '23503') {
        return res.status(409).json({ erro: 'Não é possível excluir: existem contratos vinculados a este treinamento. Inative o treinamento em vez de excluir.' });
      }
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao excluir treinamento.' });
    }
  }

  // PUT
  const {
    titulo, descricao, carga_horaria_min, nota_minima_prova, validade_certificado_meses,
    conteudo_programatico, data_inicio, data_fim, ativo,
  } = req.body || {};
  if (!titulo || !carga_horaria_min) {
    return res.status(400).json({ erro: 'Título e carga horária são obrigatórios.' });
  }
  try {
    const { rows } = await db.query(
      `UPDATE treinamentos
          SET titulo = $1,
              descricao = $2,
              carga_horaria_min = $3,
              nota_minima_prova = $4,
              validade_certificado_meses = $5,
              conteudo_programatico = $6,
              data_inicio = $7,
              data_fim = $8,
              ativo = COALESCE($9, ativo)
        WHERE id = $10
        RETURNING *`,
      [titulo, descricao || null, carga_horaria_min, nota_minima_prova ?? 70, validade_certificado_meses ?? null,
       conteudo_programatico || null, data_inicio || null, data_fim || null,
       typeof ativo === 'boolean' ? ativo : null, treinamentoId]
    );
    if (!rows[0]) {
      return res.status(404).json({ erro: 'Treinamento não encontrado.' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao atualizar treinamento.' });
  }
}

async function handleModulos(req, res, treinamentoId, moduloId) {
  if (moduloId) {
    if (!metodoPermitido(req, res, 'PUT', 'DELETE')) return;

    if (req.method === 'DELETE') {
      try {
        const { rows: prog } = await db.query(
          `SELECT 1 FROM matricula_modulo_progresso
            WHERE modulo_id = $1 AND (segundos_assistidos > 0 OR concluido = TRUE)
            LIMIT 1`,
          [moduloId]
        );
        if (prog[0]) {
          return res.status(422).json({ erro: 'Não é possível excluir: já existe progresso de algum funcionário neste módulo.' });
        }
        const { rows } = await db.query(
          `DELETE FROM treinamento_modulos WHERE id = $1 AND treinamento_id = $2 RETURNING id`,
          [moduloId, treinamentoId]
        );
        if (!rows[0]) return res.status(404).json({ erro: 'Módulo não encontrado.' });
        return res.json({ mensagem: 'Módulo excluído.' });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ erro: 'Erro ao excluir módulo.' });
      }
    }

    // PUT
    const { titulo, ordem, video_provider_id, duracao_segundos } = req.body || {};
    if (!titulo || !ordem || !video_provider_id || !duracao_segundos) {
      return res.status(400).json({ erro: 'titulo, ordem, video_provider_id e duracao_segundos são obrigatórios.' });
    }
    try {
      const { rows } = await db.query(
        `UPDATE treinamento_modulos
            SET titulo = $1, ordem = $2, video_provider_id = $3, duracao_segundos = $4
          WHERE id = $5 AND treinamento_id = $6
          RETURNING *`,
        [titulo, ordem, video_provider_id, duracao_segundos, moduloId, treinamentoId]
      );
      if (!rows[0]) return res.status(404).json({ erro: 'Módulo não encontrado.' });
      return res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ erro: 'Já existe um módulo com essa ordem neste treinamento.' });
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao atualizar módulo.' });
    }
  }

  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        `SELECT * FROM treinamento_modulos WHERE treinamento_id = $1 ORDER BY ordem ASC`,
        [treinamentoId]
      );
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar módulos.' });
    }
  }

  // POST
  const { titulo, ordem, video_provider_id, duracao_segundos } = req.body || {};
  if (!titulo || !ordem || !video_provider_id || !duracao_segundos) {
    return res.status(400).json({ erro: 'titulo, ordem, video_provider_id e duracao_segundos são obrigatórios.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO treinamento_modulos (treinamento_id, titulo, ordem, video_provider_id, duracao_segundos)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [treinamentoId, titulo, ordem, video_provider_id, duracao_segundos]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ erro: 'Já existe um módulo com essa ordem neste treinamento.' });
    return res.status(500).json({ erro: 'Erro ao criar módulo.' });
  }
}

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;

  const user = exigirAuth(req, res, 'super_admin');
  if (!user) return;

  const { id, sub, moduloId } = req.query;

  if (!id) {
    return handleTreinamentos(req, res);
  }

  if (sub === 'modulos') {
    return handleModulos(req, res, id, moduloId);
  }

  return handleTreinamentoPorId(req, res, id);
};
