import express from 'express';
import dotenv from 'dotenv';
import pool from './db/pool.js';

// Rutas
import authRoutes from './routes/auth.js';
import productsRoutes from './routes/products.js';
import ordersRoutes from './routes/orders.js';
import productionRoutes from './routes/production.js';

// Cargar variables de entorno según el entorno
// En producción (Railway), las variables se inyectan directamente
const ENV = process.env.NODE_ENV || 'development';
if (ENV !== 'production') {
  dotenv.config({ path: `.env.${ENV}` });
}

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CORS — Middleware manual (más confiable que el paquete cors
//        con Express 5 en Railway)
// ============================================================
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // Orígenes siempre permitidos: localhost, *.vercel.app, *.railway.app
  // y cualquier FRONTEND_URL configurado explícitamente
  const isAllowed =
    !origin ||
    /^http:\/\/localhost(:\d+)?$/.test(origin) ||
    /^https:\/\/.*\.vercel\.app$/.test(origin) ||
    /^https:\/\/.*\.railway\.app$/.test(origin) ||
    (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL);

  if (isAllowed) {
    // Devolver el origin exacto del request (requerido cuando credentials: true)
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400'); // cache preflight 24h
  }

  // Responder inmediatamente a los preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  next();
});

// ============================================================
// Body Parser
// ============================================================
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
    server:    'running',
    env:       ENV,
    timestamp: new Date(),
    database:  'disconnected',
    cors:      'manual-middleware-v3',
  };

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW(), current_database() as db_name');
    client.release();
    status.database = 'connected';
    status.dbTime   = result.rows[0].now;
    status.dbName   = result.rows[0].db_name;
    res.json(status);
  } catch (err) {
    status.database = 'error';
    status.error    = err.message;
    res.status(500).json(status);
  }
});

// Ruta raíz
app.get('/', (req, res) => {
  res.json({
    project: 'Gosu Int API',
    version: '2.0.0',
    env:     ENV,
    docs:    '/api/status',
  });
});

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err.message);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ============================================================
// Iniciar Servidor
// ============================================================
app.listen(PORT, () => {
  console.log(`\n🚀 Gosu Int API v2.0 corriendo en http://localhost:${PORT}`);
  console.log(`📦 Entorno: ${ENV}`);
  console.log(`🔗 Base de datos: ${process.env.DATABASE_URL ? 'Neon configurado ✓' : '⚠️  No configurada'}`);
  console.log(`🌐 CORS: middleware manual activo\n`);
});
