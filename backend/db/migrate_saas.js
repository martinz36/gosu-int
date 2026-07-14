import pool from './pool.js';

async function migrate() {
  console.log('🔄 Iniciando Migración SaaS (Fase 4)...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Crear tabla de PLANES
    await client.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name       VARCHAR(100) UNIQUE NOT NULL,
        max_users  INTEGER NOT NULL,
        price_usd  NUMERIC(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla plans creada/verificada.');

    // Seed de Planes
    await client.query(`
      INSERT INTO plans (name, max_users, price_usd)
      VALUES 
        ('Básico', 5, 99.00),
        ('Pro', 20, 299.00),
        ('Enterprise', 9999, 999.00)
      ON CONFLICT (name) DO UPDATE 
      SET max_users = EXCLUDED.max_users, price_usd = EXCLUDED.price_usd
    `);
    console.log('✅ Planes semilla insertados/actualizados.');

    // 2. Modificar tabla TENANTS
    await client.query(`
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'active';
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id);
      ALTER TABLE tenants ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
    `);
    console.log('✅ Columnas status, plan_id y deleted_at agregadas a tenants.');

    // Asignar el plan 'Básico' por defecto a cualquier tenant que no tenga plan asignado
    const defaultPlanResult = await client.query("SELECT id FROM plans WHERE name = 'Básico'");
    const defaultPlanId = defaultPlanResult.rows[0].id;

    await client.query(`
      UPDATE tenants 
      SET plan_id = $1 
      WHERE plan_id IS NULL
    `, [defaultPlanId]);
    console.log('✅ Asignado plan "Básico" a los tenants existentes.');

    // Hacer plan_id NOT NULL después de asignar valores por defecto
    await client.query(`
      ALTER TABLE tenants ALTER COLUMN plan_id SET NOT NULL
    `);

    // 3. Crear tabla AUDIT_LOGS
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
        user_name  VARCHAR(255) NOT NULL,
        tenant_id  UUID,
        action     VARCHAR(100) NOT NULL,
        details    JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla audit_logs creada/verificada.');

    await client.query('COMMIT');
    console.log('🎉 Migración SaaS completada con éxito.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error durante la migración:', err);
    throw err;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
