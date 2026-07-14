import pkg from 'pg';

// En producción (Railway), DATABASE_URL es inyectada como variable de entorno del sistema
// En desarrollo local, la cargamos del .env.development
const ENV = process.env.NODE_ENV || 'development';
if (ENV !== 'production') {
  const dotenv = await import('dotenv');
  dotenv.default.config({ path: `.env.${ENV}` });
}

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de Neon:', err);
});

export default pool;
