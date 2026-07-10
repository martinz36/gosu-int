import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';

const { Pool } = pkg;

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configurar CORS
app.use(cors());
app.use(express.json());

// Configurar la conexión a la base de datos Neon (PostgreSQL)
// Si process.env.DATABASE_URL no está definido, usaremos una configuración vacía o de fallback
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Ruta de estado general
app.get('/api/status', async (req, res) => {
  const status = {
    server: 'running',
    timestamp: new Date(),
    database: 'disconnected'
  };

  try {
    if (process.env.DATABASE_URL) {
      // Intentar una consulta rápida para comprobar la BD
      const client = await pool.connect();
      const result = await client.query('SELECT NOW()');
      client.release();
      status.database = 'connected';
      status.dbTime = result.rows[0].now;
    } else {
      status.database = 'not_configured';
    }
    res.json(status);
  } catch (err) {
    status.database = 'error';
    status.error = err.message;
    res.status(500).json(status);
  }
});

// Endpoint básico de bienvenida
app.get('/', (req, res) => {
  res.send('API de Gosu Int funcionando correctamente.');
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor de backend corriendo en http://localhost:${PORT}`);
});
