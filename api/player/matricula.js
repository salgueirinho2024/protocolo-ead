// api/player/matricula.js
//   GET /api/player/matricula — matrícula ativa do funcionário com progresso por módulo
//   PUT /api/player/matricula — "Editar Conta": o próprio funcionário atualiza
//                                seu e-mail e/ou senha (exige a senha atual
//                                para trocar a senha). Vive neste mesmo arquivo
//                                pra não estourar o limite de 12 Serverless
//                                Functions do plano Hobby da Vercel — ver
//                                comentário em api/auth/login.js.
const bcrypt = require('bcryptjs');
const db = require('../../lib/db');
const { exigirAuth } = require('../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');
const { calcularPeriodoTreinamentoFormatado } = require('../../lib/periodoTreinamento');

async function handlePut(req, res, user) {
  const { email, senha_atual, senha_nova } = req.body || {};

  if (senha_nova && senha_nova.length < 6) {
    return res.status(400).json({ erro: 'A nova senha deve ter pelo menos 6 caracteres.' });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE funcionarios SET email = $1 WHERE id = $2`,
      [email || null, user.id]
    );

    if (senha_nova) {
      const { rows } = await client.query(
        `SELECT senha_hash FROM funcionario_acessos WHERE funcionario_id = $1`,
        [user.id]
      );
      const senhaAtualOk = rows[0]?.senha_hash && senha_atual && await bcrypt.compare(senha_atual, rows[0].senha_hash);
      if (!senhaAtualOk) {
        await client.query('ROLLBACK');
        return res.status(401).json({ erro: 'Senha atual incorreta.' });
      }
      const hash = await bcrypt.hash(senha_nova, 12);
      await client.query(
        `UPDATE funcionario_acessos SET senha_hash = $1 WHERE funcionario_id = $2`,
        [hash, user.id]
      );
    }

    await client.query('COMMIT');
    return res.json({ mensagem: 'Dados atualizados com sucesso.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao atualizar conta.' });
  } finally {
    client.release();
  }
}

module.exports = async (req, res) => {
  if (aplicarCors(req, res)) return;
  if (!validarEnv(res)) return;
  if (!metodoPermitido(req, res, 'GET', 'PUT')) return;

  const user = exigirAuth(req, res, 'funcionario');
  if (!user) return;

  if (req.method === 'PUT') return handlePut(req, res, user);

  try {
    const { rows } = await db.query(
      `SELECT m.id, m.treinamento_id, m.status, m.segundos_assistidos_total,
              m.nota_prova_final, m.iniciado_em, m.concluido_em,
              t.titulo AS treinamento_titulo, t.carga_horaria_min, t.nota_minima_prova,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', mod.id, 'titulo', mod.titulo, 'descricao', mod.descricao, 'ordem', mod.ordem,
                    'duracao_segundos', mod.duracao_segundos,
                    'video_provider_id', mod.video_provider_id,
                    'pdf_url', mod.pdf_url,
                    'segundos_assistidos', COALESCE(mp.segundos_assistidos, 0),
                    'concluido', COALESCE(mp.concluido, false),
                    'ultima_posicao_seg', COALESCE(mp.ultima_posicao_seg, 0)
                  ) ORDER BY mod.ordem
                ) FILTER (WHERE mod.id IS NOT NULL),
                '[]'
              ) AS modulos
         FROM matriculas m
         JOIN treinamentos t ON t.id = m.treinamento_id
         LEFT JOIN treinamento_modulos mod ON mod.treinamento_id = t.id
         LEFT JOIN matricula_modulo_progresso mp ON mp.matricula_id = m.id AND mp.modulo_id = mod.id
        WHERE m.funcionario_id = $1
        GROUP BY m.id, t.titulo, t.carga_horaria_min, t.nota_minima_prova`,
      [user.id]
    );
    // Período previsto (início/fim), calculado a partir de quando o
    // funcionário iniciou este treinamento + carga horária ÷ 8h por dia.
    // Substitui a antiga data_inicio/data_fim fixa do treinamento.
    const comPeriodo = rows.map(m => ({
      ...m,
      periodo_previsto: calcularPeriodoTreinamentoFormatado(m.iniciado_em, m.carga_horaria_min),
    }));
    res.json(comPeriodo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar matrícula.' });
  }
};
