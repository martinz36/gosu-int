import pool from './pool.js';

async function bulkLoadTestStock() {
  console.log('🔄 Iniciando carga masiva de stock de prueba (1000 unidades) para todos los productos...');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Obtener todos los productos
    const productsRes = await client.query('SELECT id, tenant_id, name FROM products');
    const products = productsRes.rows;
    console.log(`🔎 Encontrados ${products.length} productos en la base de datos.`);

    for (const prod of products) {
      // 2. Obtener el stock físico actual
      const invRes = await client.query(
        'SELECT stock_physical_cases FROM inventory WHERE product_id = $1 AND tenant_id = $2',
        [prod.id, prod.tenant_id]
      );
      
      const currentStock = invRes.rows.length > 0 ? invRes.rows[0].stock_physical_cases : 0;
      const targetStock = 1000;
      const diff = targetStock - currentStock;

      if (diff === 0) {
        console.log(`➡️ Producto "${prod.name}" ya tiene 1000 unidades. Omitiendo.`);
        continue;
      }

      // 3. Actualizar o insertar en la tabla inventory
      await client.query(
        `INSERT INTO inventory (tenant_id, product_id, stock_physical_cases, stock_in_production_cases)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (tenant_id, product_id)
         DO UPDATE SET stock_physical_cases = $3, updated_at = CURRENT_TIMESTAMP`,
        [prod.tenant_id, prod.id, targetStock]
      );

      // 4. Registrar movimiento en la tabla de Kardex
      await client.query(
        `INSERT INTO inventory_kardex (tenant_id, product_id, movement_type, quantity_cases, previous_stock, new_stock, notes, created_by)
         VALUES ($1, $2, 'INITIAL', $3, $4, $5, $6, null)`,
        [prod.tenant_id, prod.id, diff, currentStock, targetStock, 'Carga masiva automática de prueba para simular stock']
      );

      console.log(`✅ Ajustado "${prod.name}": ${currentStock} ➡️ ${targetStock} (Kardex: ${diff > 0 ? '+' : ''}${diff})`);
    }

    await client.query('COMMIT');
    console.log('🎉 Carga masiva de stock de prueba completada exitosamente.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error durante la carga masiva de stock de prueba:', err);
    throw err;
  } finally {
    client.release();
  }
}

bulkLoadTestStock()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
