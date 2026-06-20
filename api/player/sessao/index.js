// api/player/sessao/index.js
//   POST /api/player/sessao/iniciar   — abre sessão de visualização
//   POST /api/player/sessao/encerrar  — fecha sessão, soma tempo assistido
//
// Consolidado num único arquivo para caber no limite de 12 Serverless
// Functions do plano Hobby da Vercel. As duas URLs continuam existindo
// normalmente: um rewrite no vercel.json aponta ambas para este arquivo,
// adicionando ?acao=iniciar ou ?acao=encerrar na query.
const db = require('../../../lib/db');
const { exigirAuth } = require('../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../lib/http');

async function minhaMatricula(matriculaId, funcionarioId) {
  const { rows } = await db.query(
    `SELECT id FROM matriculas WHERE id = $1 AND funcionario_id = $2`,
    [matriculaId, funcionarioId]
  );
  return rows[0] || null;
}

async function iniciarSessao(req, res, user) {
  const { matricula_id, modulo_id } = req.body || {};
  if (!matricula_id || !modulo_id) return res.status(400).json({ erro: 'matricula_id e modulo_id são obrigatórios.' });

  try {
    const mat = await minhaMatricula(matricula_id, user.id);
    if (!mat) return res.status(403).json({ erro: 'Matrícula não encontrada.' });

    await db.query(
      `UPDATE matriculas SET status = 'em_andamento', iniciado_em = COALESCE(iniciado_em, now())
        WHERE id = $1 AND status = 'nao_iniciado'`,
      [matricula_id]
    );

    // Em Vercel, req.ip não existe nativamente — usamos o header padrão do proxy
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || null;

    const { rows } = await db.query(
      `INSERT INTO sessoes_visualizacao (matricula_id, modulo_id, ip_address, user_agent)
       VALUES ($1, $2, $3, $4) RETURNING id, inicio_em`,
      [matricula_id, modulo_id, ip, req.headers['user-agent'] || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao iniciar sessão.' });
  }
}

async function encerrarSessao(req, res, user) {
  const { sessao_id, matricula_id, modulo_id, segundos_efetivos, ultima_posicao_seg } = req.body || {};
  if (!sessao_id || !matricula_id || !modulo_id || segundos_efetivos === undefined) {
    return res.status(400).json({ erro: 'sessao_id, matricula_id, modulo_id e segundos_efetivos são obrigatórios.' });
  }
  // Proteção contra manipulação: limita em 3600s por sessão (1 hora)
  const segundosValidos = Math.min(Math.max(0, parseInt(segundos_efetivos) || 0), 3600);

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE sessoes_visualizacao SET fim_em = now(), segundos_efetivos = $2 WHERE id = $1`,
      [sessao_id, segundosValidos]
    );

    const { rows: modRows } = await client.query(
      `SELECT duracao_segundos FROM treinamento_modulos WHERE id = $1`,
      [modulo_id]
    );
    const duracaoModulo = modRows[0]?.duracao_segundos || 1;

    const { rows: mpRows } = await client.query(
      `INSERT INTO matricula_modulo_progresso (matricula_id, modulo_id, segundos_assistidos, ultima_posicao_seg)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (matricula_id, modulo_id)
       DO UPDATE SET
         segundos_assistidos = matricula_modulo_progresso.segundos_assistidos + $3,
         ultima_posicao_seg = $4,
         atualizado_em = now()
       RETURNING segundos_assistidos, concluido`,
      [matricula_id, modulo_id, segundosValidos, ultima_posicao_seg || 0]
    );

    const totalSegsMod = mpRows[0].segundos_assistidos;
    const moduloConcluido = totalSegsMod >= duracaoModulo * 0.95; // 95% = concluído

    if (moduloConcluido && !mpRows[0].concluido) {
      await client.query(
        `UPDATE matricula_modulo_progresso SET concluido = true WHERE matricula_id = $1 AND modulo_id = $2`,
        [matricula_id, modulo_id]
      );
    }

    await client.query(
      `UPDATE matriculas SET segundos_assistidos_total = segundos_assistidos_total + $2 WHERE id = $1`,
      [matricula_id, segundosValidos]
    );

    await client.query('COMMIT');
    res.json({ segundos_validos: segundosValidos, modulo_concluido: moduloConcluido });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ erro: 'Erro ao encerrar sessão.' });
  } finally {
    client.release();
  }
}

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'POST')) return;

  const user = exigirAuth(req, res, 'funcionario');
  if (!user) return;

  if (req.query.acao === 'encerrar') {
    return encerrarSessao(req, res, user);
  }
  return iniciarSessao(req, res, user);
};
