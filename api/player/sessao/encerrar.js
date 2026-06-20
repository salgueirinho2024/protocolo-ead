// api/player/sessao/encerrar.js — POST /api/player/sessao/encerrar — fecha sessão e atualiza progresso
const db = require('../../../lib/db');
const { exigirAuth } = require('../../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'POST')) return;

  const user = exigirAuth(req, res, 'funcionario');
  if (!user) return;

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
};
