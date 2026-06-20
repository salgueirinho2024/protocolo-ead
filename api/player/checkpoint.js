// api/player/checkpoint.js — POST /api/player/checkpoint — registra evento de checkpoint anti-fraude
const db = require('../../lib/db');
const { exigirAuth } = require('../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'POST')) return;

  const user = exigirAuth(req, res, 'funcionario');
  if (!user) return;

  const { sessao_id, posicao_video_seg, tipo, resultado, tempo_resposta_ms } = req.body || {};
  const resultadosValidos = ['respondido_ok', 'respondido_errado', 'nao_respondido', 'aba_oculta'];

  if (!sessao_id || !resultado || !resultadosValidos.includes(resultado)) {
    return res.status(400).json({ erro: 'Parâmetros inválidos para o checkpoint.' });
  }

  try {
    const { rows: sRows } = await db.query(
      `SELECT sv.id FROM sessoes_visualizacao sv
         JOIN matriculas m ON m.id = sv.matricula_id
        WHERE sv.id = $1 AND m.funcionario_id = $2`,
      [sessao_id, user.id]
    );
    if (!sRows[0]) return res.status(403).json({ erro: 'Sessão não encontrada.' });

    const { rows } = await db.query(
      `INSERT INTO checkpoints_antifraude (sessao_id, posicao_video_seg, tipo, resultado, tempo_resposta_ms)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [sessao_id, posicao_video_seg || 0, tipo || 'clique', resultado, tempo_resposta_ms || null]
    );

    if (resultado === 'aba_oculta') {
      await db.query(
        `UPDATE sessoes_visualizacao SET fim_em = now() WHERE id = $1 AND fim_em IS NULL`,
        [sessao_id]
      );
    }

    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao registrar checkpoint.' });
  }
};
