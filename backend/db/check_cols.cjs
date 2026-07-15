const pg = require('pg');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const tables = [
  'sales_orders', 'sales_order_items', 'production_orders', 
  'production_order_items', 'products', 'inventory', 'tenants', 'users'
];

async function run() {
  for (const t of tables) {
    const r = await pool.query(
      `SELECT column_name, data_type, is_nullable, column_default 
       FROM information_schema.columns 
       WHERE table_name = $1 ORDER BY ordinal_position`, [t]
    );
    console.log(`\n=== ${t.toUpperCase()} ===`);
    r.rows.forEach(c => console.log(`  ${c.column_name} [${c.data_type}] nullable=${c.is_nullable} default=${c.column_default}`));
  }
  process.exit(0);
}
run().catch(e => { console.error(e.message); process.exit(1); });
