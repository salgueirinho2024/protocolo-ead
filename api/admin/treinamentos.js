// api/admin/treinamentos.js
//   GET  /api/admin/treinamentos              — lista treinamentos
//   POST /api/admin/treinamentos              — cria treinamento
//   PUT  /api/admin/treinamentos/:id          — edita treinamento
//   GET  /api/admin/treinamentos/:id/modulos  — lista módulos do treinamento
//   POST /api/admin/treinamentos/:id/modulos  — cria módulo
//
// Arquivo plano (sem subpasta catch-all) para caber no limite de 12
// Serverless Functions do plano Hobby da Vercel. O roteamento de
// /:id e /:id/modulos é feito via rewrites no vercel.json, que repassam
// id e sub como query string — mesmo padrão usado em api/admin/index.js
// para empresas e contratos (esse padrão já é validado e funciona).
const db = require('../../lib/db');
const { exigirAuth } = require('../../lib/auth');
const { aplicarCors, metodoPermitido, validarEnv } = require('../../lib/http');

async function handleTreinamentos(req, res) {
  if (!metodoPermitido(req, res, 'GET', 'POST')) return;

  if (req.method === 'GET') {
    try {
      const { rows } = await db.query(`SELECT * FROM treinamentos ORDER BY criado_em DESC`);
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ erro: 'Erro ao listar treinamentos.' });
    }
  }

  // POST
  const { titulo, descricao, carga_horaria_min, nota_minima_prova, validade_certificado_meses } = req.body || {};
  if (!titulo || !carga_horaria_min) {
    return res.status(400).json({ erro: 'Título e carga horária são obrigatórios.' });
  }
  try {
    const { rows } = await db.query(
      `INSERT INTO treinamentos (titulo, descricao, carga_horaria_min, nota_minima_prova, validade_certificado_meses)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [titulo, descricao || null, carga_horaria_min, nota_minima_prova ?? 70, validade_certificado_meses ?? null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: 'Erro ao criar treinamento.' });
  }
}

async function handleTreinamentoPorId(req, res, treinamentoId) {
  if (!metodoPermitido(req, res, 'PUT')) return;

  const { titulo, descricao, carga_horaria_min, nota_minima_prova, validade_certificado_meses } = req.body || {};
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
              validade_certificado_meses = $5
        WHERE id = $6
        RETURNING *`,
      [titulo, descricao || null, carga_horaria_min, nota_minima_prova ?? 70, validade_certificado_meses ?? null, treinamentoId]
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

async function handleModulos(req, res, treinamentoId) {
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

  const { id, sub } = req.query;

  if (!id) {
    return handleTreinamentos(req, res);
  }

  if (sub === 'modulos') {
    return handleModulos(req, res, id);
  }

  return handleTreinamentoPorId(req, res, id);
};
