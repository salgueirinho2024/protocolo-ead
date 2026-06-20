// lib/db.js — conexão com o PostgreSQL, adaptada para Vercel Functions
//
// Em serverless, cada invocação pode rodar num container novo, mas containers
// "quentes" são reaproveitados entre chamadas. Por isso guardamos o Pool numa
// variável global: se o container for reaproveitado, reaproveitamos a conexão
// também, em vez de abrir uma nova a cada request (isso esgotaria o limite de
// conexões do Postgres rapidinho).
const { Pool } = require('pg');

let pool = global.__pgPool;

if (!pool) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 5, // serverless: cada função roda isolada, então mantemos baixo por instância
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('Erro inesperado no pool de conexões do banco:', err.message);
  });

  global.__pgPool = pool;
}

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
