// api/player/matricula.js — GET /api/player/matricula — matrícula ativa do funcionário com progresso por módulo
const db = require('../../lib/db');
const { exigirAuth } = require('../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET')) return;

  const user = exigirAuth(req, res, 'funcionario');
  if (!user) return;

  try {
    const { rows } = await db.query(
      `SELECT m.id, m.treinamento_id, m.status, m.segundos_assistidos_total,
              m.nota_prova_final, m.iniciado_em, m.concluido_em,
              t.titulo AS treinamento_titulo, t.carga_horaria_min, t.nota_minima_prova,
              json_agg(
                json_build_object(
                  'id', mod.id, 'titulo', mod.titulo, 'ordem', mod.ordem,
                  'duracao_segundos', mod.duracao_segundos,
                  'video_provider_id', mod.video_provider_id,
                  'segundos_assistidos', COALESCE(mp.segundos_assistidos, 0),
                  'concluido', COALESCE(mp.concluido, false),
                  'ultima_posicao_seg', COALESCE(mp.ultima_posicao_seg, 0)
                ) ORDER BY mod.ordem
              ) AS modulos
         FROM matriculas m
         JOIN treinamentos t ON t.id = m.treinamento_id
         JOIN treinamento_modulos mod ON mod.treinamento_id = t.id
         LEFT JOIN matricula_modulo_progresso mp ON mp.matricula_id = m.id AND mp.modulo_id = mod.id
        WHERE m.funcionario_id = $1
        GROUP BY m.id, t.titulo, t.carga_horaria_min, t.nota_minima_prova`,
      [user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar matrícula.' });
  }
};
