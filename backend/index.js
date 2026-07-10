import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db/pool.js';

// Rutas
import authRoutes from './routes/auth.js';
import productsRoutes from './routes/products.js';
import ordersRoutes from './routes/orders.js';
import productionRoutes from './routes/production.js';

// Cargar variables de entorno según el entorno
// En producción (Railway), las variables se inyectan directamente — no necesita archivo .env
const ENV = process.env.NODE_ENV || 'development';
if (ENV !== 'production') {
  dotenv.config({ path: `.env.${ENV}` });
}

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// Middlewares Globales
// ============================================================
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ============================================================
// Rutas
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/production', productionRoutes);

// Estado de la API y conexión a BD
app.get('/api/status', async (req, res) => {
  const status = {
    server: 'running',
    env: ENV,
    timestamp: new Date(),
    database: 'disconnected'
  };

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW(), current_database() as db_name');
    client.release();
    status.database = 'connected';
    status.dbTime = result.rows[0].now;
    status.dbName = result.rows[0].db_name;
    res.json(status);
  } catch (err) {
    status.database = 'error';
    status.error = err.message;
    res.status(500).json(status);
  }
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    project: 'Gosu Int API',
    version: '2.0.0',
    env: ENV,
    docs: '/api/status'
  });
});

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ============================================================
// Iniciar Servidor
// ============================================================
app.listen(PORT, () => {
  console.log(`\n🚀 Gosu Int API v2.0 corriendo en http://localhost:${PORT}`);
  console.log(`📦 Entorno: ${ENV}`);
  console.log(`🔗 Base de datos: ${process.env.DATABASE_URL ? 'Neon configurado' : 'No configurada'}\n`);
});
