import pool from './pool.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.development') });

async function fix() {
  try {
    // Actualizar la contraseña del admin con el hash correcto para 'GosuAdmin2026!'
    const correctHash = '$2b$12$xDKb0X0JPWMjFn4eGjPgeOO405fAEeuUepqebJe42i03aBXR3cGZi';
    
    const r = await pool.query(
      "UPDATE users SET password_hash = $1 WHERE email = 'admin@gosu.gg' RETURNING id, email, role",
      [correctHash]
    );
    
    if (r.rows.length > 0) {
      console.log('✅ Contraseña del admin actualizada correctamente.');
      console.log('   Usuario:', r.rows[0].email, '| Rol:', r.rows[0].role);
    } else {
      console.log('⚠️  No se encontró el usuario admin. Verifica el seed.');
    }
    process.exit(0);
  } catch(err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

fix();
