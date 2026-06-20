// scripts/migrate.js — executa o schema.sql no banco configurado em DATABASE_URL
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrar() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL não definido. Configure o arquivo .env primeiro.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  try {
    console.log('⚙️  Executando schema.sql...');
    const schemaPath = path.join(__dirname, '../schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(sql);
    console.log('✅ Tabelas criadas/atualizadas com sucesso!');
    console.log('   (este script é seguro para rodar de novo a qualquer momento)');
  } catch (err) {
    console.error('❌ Erro ao rodar a migration:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrar();
