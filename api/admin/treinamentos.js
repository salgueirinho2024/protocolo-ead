// api/admin/treinamentos.js
//   GET    /api/admin/treinamentos                       — lista treinamentos
//   POST   /api/admin/treinamentos                       — cria treinamento
//   PUT    /api/admin/treinamentos/:id                    — edita treinamento
//   DELETE /api/admin/treinamentos/:id                    — exclui treinamento (bloqueado se houver contratos)
//   GET    /api/admin/treinamentos/:id/modulos             — lista módulos do treinamento
//   POST   /api/admin/treinamentos/:id/modulos             — cria módulo
//   PUT    /api/admin/treinamentos/:id/modulos/:moduloId   — edita módulo
//   DELETE /api/admin/treinamentos/:id/modulos/:moduloId   — exclui módulo (bloqueado se já houver progresso assistido)
//   GET    /api/admin/treinamentos/:id/perguntas                — lista perguntas da prova final
//   POST   /api/admin/treinamentos/:id/perguntas                — cria pergunta
//   PUT    /api/admin/treinamentos/:id/perguntas/:perguntaId     — edita pergunta
//   DELETE /api/admin/treinamentos/:id/perguntas/:perguntaId     — exclui pergunta
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
  // OBS: o treinamento NÃO tem mais data_inicio/data_fim fixas — é um
  // "molde" reutilizável, disponibilizado para várias empresas/contratos
  // diferentes. O período de cada funcionário é calculado individualmente
  // (ver lib/periodoTreinamento.js), a partir de quando ELE começou.
  const {
    titulo, descricao, carga_horaria_min, nota_minima_prova, validade_certificado_meses,
    conteudo_programatico, ativo,
    emissora_nome, emissora_cnpj,
    assinatura_base64, assinatura_nome, assinatura_cargo,
    responsavel_tecnico_nome, responsavel_tecnico_documento, responsavel_tecnico_assinatura_base64,
    instrutor_documento,
    certificado_fundo_frente_base64, certificado_fundo_verso_base64,
  } = req.body || {};
  if (!titulo || !carga_horaria_min) {
    return res.status(400).json({ erro: 'Título e carga horária são obrigatórios.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO treinamentos
         (titulo, descricao, carga_horaria_min, nota_minima_prova, validade_certificado_meses,
          conteudo_programatico, ativo,
          emissora_nome, emissora_cnpj, assinatura_base64, assinatura_nome, assinatura_cargo,
          responsavel_tecnico_nome, responsavel_tecnico_documento, responsavel_tecnico_assinatura_base64,
          instrutor_documento,
          certificado_fundo_frente_base64, certificado_fundo_verso_base64)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, TRUE),$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [titulo, descricao || null, carga_horaria_min, nota_minima_prova ?? 70, validade_certificado_meses ?? null,
       conteudo_programatico || null,
       typeof ativo === 'boolean' ? ativo : null,
       emissora_nome || null, emissora_cnpj || null,
       assinatura_base64 || null, assinatura_nome || null, assinatura_cargo || null,
       responsavel_tecnico_nome || null, responsavel_tecnico_documento || null, responsavel_tecnico_assinatura_base64 || null,
       instrutor_documento || null,
       certificado_fundo_frente_base64 || null, certificado_fundo_verso_base64 || null]
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
    conteudo_programatico, ativo,
    emissora_nome, emissora_cnpj,
    assinatura_base64, assinatura_nome, assinatura_cargo,
    responsavel_tecnico_nome, responsavel_tecnico_documento, responsavel_tecnico_assinatura_base64,
    instrutor_documento,
    certificado_fundo_frente_base64, certificado_fundo_verso_base64,
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
              ativo = COALESCE($7, ativo),
              emissora_nome = $9,
              emissora_cnpj = $10,
              assinatura_base64 = $11,
              assinatura_nome = $12,
              assinatura_cargo = $13,
              responsavel_tecnico_nome = $14,
              responsavel_tecnico_documento = $15,
              responsavel_tecnico_assinatura_base64 = $16,
              instrutor_documento = $17,
              certificado_fundo_frente_base64 = $18,
              certificado_fundo_verso_base64 = $19
        WHERE id = $8
        RETURNING *`,
      [titulo, descricao || null, carga_horaria_min, nota_minima_prova ?? 70, validade_certificado_meses ?? null,
       conteudo_programatico || null,
       typeof ativo === 'boolean' ? ativo : null, treinamentoId,
       emissora_nome || null, emissora_cnpj || null,
       assinatura_base64 || null, assinatura_nome || null, assinatura_cargo || null,
       responsavel_tecnico_nome || null, responsavel_tecnico_documento || null, responsavel_tecnico_assinatura_base64 || null,
       instrutor_documento || null,
       certificado_fundo_frente_base64 || null, certificado_fundo_verso_base64 || null]
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
    const { titulo, descricao, ordem, video_provider_id, duracao_segundos, pdf_url } = req.body || {};
    if (!titulo || !ordem || !duracao_segundos) {
      return res.status(400).json({ erro: 'titulo, ordem e duracao_segundos são obrigatórios.' });
    }
    try {
      const { rows } = await db.query(
        `UPDATE treinamento_modulos
            SET titulo = $1, ordem = $2, video_provider_id = $3, duracao_segundos = $4, pdf_url = $5, descricao = $8
          WHERE id = $6 AND treinamento_id = $7
          RETURNING *`,
        [titulo, ordem, video_provider_id || null, duracao_segundos, pdf_url || null, moduloId, treinamentoId, descricao || null]
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

  // POST modulos
  const { titulo, descricao, ordem, video_provider_id, duracao_segundos, pdf_url } = req.body || {};
  if (!titulo || !ordem || !duracao_segundos) {
    return res.status(400).json({ erro: 'titulo, ordem e duracao_segundos são obrigatórios.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO treinamento_modulos (treinamento_id, titulo, descricao, ordem, video_provider_id, duracao_segundos, pdf_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [treinamentoId, titulo, descricao || null, ordem, video_provider_id || null, duracao_segundos, pdf_url || null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ erro: 'Já existe um módulo com essa ordem neste treinamento.' });
    return res.status(500).json({ erro: 'Erro ao criar módulo.' });
  }
}

async function handlePerguntas(req, res, treinamentoId, perguntaId) {
  if (perguntaId) {
    if (!metodoPermitido(req, res, 'PUT', 'DELETE')) return;

    if (req.method === 'DELETE') {
      try {
        const { rows } = await db.query(
          `DELETE FROM treinamento_perguntas WHERE id = $1 AND treinamento_id = $2 RETURNING id`,
          [perguntaId, treinamentoId]
        );
        if (!rows[0]) return res.status(404).json({ erro: 'Pergunta não encontrada.' });
        return res.json({ mensagem: 'Pergunta excluída.' });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ erro: 'Erro ao excluir pergunta.' });
      }
    }

    // PUT
    const { pergunta, opcoes, resposta_correta, ordem } = req.body || {};
    if (!pergunta || !Array.isArray(opcoes) || opcoes.length < 2 ||
        resposta_correta === undefined || resposta_correta === null || !ordem) {
      return res.status(400).json({ erro: 'pergunta, opcoes (mín. 2), resposta_correta e ordem são obrigatórios.' });
    }
    if (resposta_correta < 0 || resposta_correta >= opcoes.length) {
      return res.status(400).json({ erro: 'resposta_correta deve ser um índice válido dentro de opcoes.' });
    }
    try {
      const { rows } = await db.query(
        `UPDATE treinamento_perguntas
            SET pergunta = $1, opcoes = $2::jsonb, resposta_correta = $3, ordem = $4
          WHERE id = $5 AND treinamento_id = $6
          RETURNING *`,
        [pergunta, JSON.stringify(opcoes), resposta_correta, ordem, perguntaId, treinamentoId]
      );
      if (!rows[0]) return res.status(404).json({ erro: 'Pergunta não encontrada.' });
      return res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ erro: 'Já existe uma pergunta com essa ordem neste treinamento.' });
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao atualizar pergunta.' });
    }
  }

  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(
        `SELECT * FROM treinamento_perguntas WHERE treinamento_id = $1 ORDER BY ordem ASC`,
        [treinamentoId]
      );
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar perguntas.' });
    }
  }

  // POST
  const { pergunta, opcoes, resposta_correta, ordem } = req.body || {};
  if (!pergunta || !Array.isArray(opcoes) || opcoes.length < 2 ||
      resposta_correta === undefined || resposta_correta === null || !ordem) {
    return res.status(400).json({ erro: 'pergunta, opcoes (mín. 2), resposta_correta e ordem são obrigatórios.' });
  }
  if (resposta_correta < 0 || resposta_correta >= opcoes.length) {
    return res.status(400).json({ erro: 'resposta_correta deve ser um índice válido dentro de opcoes.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO treinamento_perguntas (treinamento_id, pergunta, opcoes, resposta_correta, ordem)
       VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING *`,
      [treinamentoId, pergunta, JSON.stringify(opcoes), resposta_correta, ordem]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ erro: 'Já existe uma pergunta com essa ordem neste treinamento.' });
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao criar pergunta.' });
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

  if (sub === 'perguntas') {
    return handlePerguntas(req, res, id, req.query.perguntaId);
  }

  return handleTreinamentoPorId(req, res, id);
};