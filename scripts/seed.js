// scripts/seed.js — cria (ou atualiza) o primeiro usuário super admin
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const readline = require('readline');

function pergunta(rl, texto) {
  return new Promise((resolve) => rl.question(texto, resolve));
}

async function seed() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não definido. Configure o arquivo .env primeiro.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n👤 Criar Super Admin\n');
  const nome = (await pergunta(rl, 'Nome: ')).trim();
  const email = (await pergunta(rl, 'E-mail: ')).trim();
  const senha = await pergunta(rl, 'Senha: ');
  rl.close();

  if (!nome || !email || !senha || senha.length < 6) {
    console.error('❌ Nome, e-mail e senha (mínimo 6 caracteres) são obrigatórios.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    const hash = await bcrypt.hash(senha, 12);
    const { rows } = await client.query(
      `INSERT INTO usuarios (nome, email, senha_hash, role)
       VALUES ($1, $2, $3, 'super_admin')
       ON CONFLICT (email) DO UPDATE SET nome = $1, senha_hash = $3
       RETURNING id, email`,
      [nome, email.toLowerCase(), hash]
    );
    console.log(`\n✅ Super admin criado/atualizado! E-mail: ${rows[0].email}\n`);
  } catch (err) {
    console.error('❌ Erro ao criar super admin:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
