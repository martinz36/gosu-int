import express from 'express';
import dotenv from 'dotenv';
import pool from './db/pool.js';

// Rutas
import authRoutes from './routes/auth.js';
import productsRoutes from './routes/products.js';
import ordersRoutes from './routes/orders.js';
import productionRoutes from './routes/production.js';
import tenantsRoutes from './routes/tenants.js';
import plansRoutes from './routes/plans.js';
import usersRoutes from './routes/users.js';
import auditRoutes from './routes/audit.js';
import configRoutes from './routes/config.js';
import pricingTiersRoutes from './routes/pricingTiers.js';

// Cargar variables de entorno según el entorno
// En producción (Railway), las variables se inyectan directamente
const ENV = process.env.NODE_ENV || 'development';
if (ENV !== 'production') {
  dotenv.config({ path: `.env.${ENV}` });
}

// Auto-ejecutar migraciones en el arranque para asegurar que existan las columnas color y production_files_url
const runAutoMigrations = async () => {
  if (!process.env.DATABASE_URL) return;
  try {
    const client = await pool.connect();
    console.log('🔄 Ejecutando migraciones automáticas de inicio...');
    
    // 1. Agregar columna color si no existe
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS color VARCHAR(100);
    `);
    console.log('✅ Columna color verificada/agregada.');

    // 2. Agregar columna production_files_url si no existe
    await client.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS production_files_url VARCHAR(512);
    `);
    console.log('✅ Columna production_files_url verificada/agregada.');

    // 3. Agregar columna must_change_password si no existe
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    console.log('✅ Columna must_change_password verificada/agregada.');

    // 3.5. Agregar columnas de Cloudinary a la tabla tenants si no existen
    await client.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cloudinary_cloud_name VARCHAR(255);
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cloudinary_upload_preset VARCHAR(255);
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cloudinary_api_key VARCHAR(255);
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cloudinary_api_secret VARCHAR(255);
    `);
    console.log('✅ Columnas de Cloudinary verificadas/agregadas a la tabla tenants.');

    // 3.6. Agregar columnas de Stripe a la tabla tenants si no existen
    await client.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_secret_key VARCHAR(512);
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_publishable_key VARCHAR(512);
    `);
    console.log('✅ Columnas de Stripe verificadas/agregadas a la tabla tenants.');

    // 4. Migrar estados antiguos de órdenes de producción a los nuevos estados
    await client.query(`
      UPDATE production_orders SET status = 'Proforma' WHERE status IN ('Quotation', 'Draft');
    `);
    await client.query(`
      UPDATE production_orders SET status = 'QC Control' WHERE status = 'QC Inspection';
    `);
    await client.query(`
      UPDATE production_orders SET status = 'Shipped' WHERE status IN ('Port', 'Transit');
    `);
    console.log('✅ Migraciones de estados de órdenes de producción completadas.');

    // 5. Migrar estados antiguos de pago de sales_orders
    await client.query(`
      UPDATE sales_orders SET payment_status = 'Pendiente' WHERE payment_status = 'pending';
    `);
    await client.query(`
      UPDATE sales_orders SET payment_status = 'Pagado' WHERE payment_status = 'paid';
    `);
    await client.query(`
      UPDATE sales_orders SET payment_status = 'Pendiente' WHERE payment_status IS NULL OR payment_status = '';
    `);
    console.log('✅ Migraciones de estado de pago de ventas completadas.');

    // 6. Agregar columnas stripe_session_id y credit_due_date a sales_orders
    await client.query(`
      ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(512);
      ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS credit_due_date DATE;
    `);
    console.log('✅ Columnas stripe_session_id y credit_due_date agregadas a sales_orders.');

    client.release();
    console.log('🎉 Migraciones automáticas completadas.');
  } catch (err) {
    console.error('⚠️ Advertencia en migraciones automáticas:', err.message);
  }
};
runAutoMigrations();

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
app.use(express.json({ limit: '50mb' }));

// ============================================================
// Rutas
// ============================================================
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/tenants', tenantsRoutes);
app.use('/api/plans', plansRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/config', configRoutes);
app.use('/api/pricing-tiers', pricingTiersRoutes);

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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Gosu Int API v2.0 corriendo en http://0.0.0.0:${PORT}`);
  console.log(`📦 Entorno: ${ENV}`);
  console.log(`🔗 Base de datos: ${process.env.DATABASE_URL ? 'Neon configurado ✓' : '⚠️  No configurada'}`);
  console.log(`🌐 CORS: middleware manual activo\n`);
});
