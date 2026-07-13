import { Router } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../db/pool.js';
import { requireAuth, requireSuperAdmin, requireTenantAdmin } from '../middleware/auth.js';
import { logAudit } from '../utils/audit.js';

const router = Router();

// ============================================================
// GET /api/users/global (Solo Super Admin)
// Retorna la lista de todos los usuarios registrados en el sistema,
// indicando a qué tenant pertenecen y sus roles.
// ============================================================
router.get('/global', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.client_category, u.created_at, t.name as tenant_name, t.slug as tenant_slug
       FROM users u
       JOIN tenants t ON t.id = u.tenant_id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener usuarios globales:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// POST /api/users/superadmin (Solo Super Admin)
// Crea un nuevo usuario Super Admin para control y soporte interno.
// ============================================================
router.post('/superadmin', requireAuth, requireSuperAdmin, async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos.' });
  }

  // Los Super Admins se registran bajo el tenant por defecto (Gosu Accessories)
  const PLATFORM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

  try {
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Este email ya está registrado.' });
    }

    const salt = await bcrypt.genSalt(12);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'superadmin')
       RETURNING id, name, email, role, created_at`,
      [PLATFORM_TENANT_ID, name, email.toLowerCase(), password_hash]
    );

    const newSuperAdmin = result.rows[0];

    // Registrar en auditoría
    await logAudit(
      req.user.id,
      req.user.name,
      null,
      'CREATE_SUPERADMIN',
      { new_user_id: newSuperAdmin.id, new_user_email: newSuperAdmin.email }
    );

    res.status(201).json({
      message: 'Nuevo administrador de plataforma registrado con éxito.',
      user: newSuperAdmin,
    });
// ============================================================
// CRUD CLIENTES DISTRIBUIDORES B2B (Solo Tenant Admin)
// ============================================================

// 1. GET /api/users/clients - Obtiene los clientes distribuidores del tenant
router.get('/clients', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;

  try {
    const result = await pool.query(
      `SELECT 
         u.id, u.name, u.email, u.is_active, u.created_at,
         p.company_name, p.tax_id, p.billing_address, p.forwarder_address, 
         p.custom_moa_usd, p.client_category, p.destination_country
       FROM users u
       JOIN b2b_client_profiles p ON p.user_id = u.id AND p.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.role = 'b2b_client'
       ORDER BY u.created_at DESC`,
      [tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener clientes distribuidores:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// 2. POST /api/users/clients - Registra un nuevo distribuidor B2B de forma transaccional
router.post('/clients', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { 
    name, email, password, company_name, tax_id, 
    billing_address, forwarder_address, custom_moa_usd, 
    client_category, destination_country 
  } = req.body;

  if (!name || !email || !password || !company_name || !tax_id || !billing_address || !forwarder_address) {
    return res.status(400).json({ error: 'Faltan campos obligatorios para registrar al distribuidor.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validar si el email ya existe
    const existing = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'El correo electrónico ya está registrado.' });
    }

    // Hashear contraseña
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Insertar en users
    const userResult = await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'b2b_client')
       RETURNING id, name, email, role, created_at`,
      [tenant_id, name, email.toLowerCase(), password_hash]
    );
    const newUser = userResult.rows[0];

    // Insertar en b2b_client_profiles
    const moa = parseFloat(custom_moa_usd) || 1000.00;
    await client.query(
      `INSERT INTO b2b_client_profiles (
         tenant_id, user_id, company_name, tax_id, billing_address, 
         forwarder_address, custom_moa_usd, client_category, destination_country
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        tenant_id, newUser.id, company_name, tax_id, billing_address, 
        forwarder_address, moa, client_category || 'retail_store', destination_country || 'USA'
      ]
    );

    // Guardar auditoría
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_value, new_value)
       VALUES ($1, $2, 'CREATE_B2B_CLIENT', 'users', $3, null, $4)`,
      [tenant_id, req.user.id, newUser.id, email.toLowerCase()]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: 'Distribuidor B2B registrado con éxito.', client: newUser });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al registrar distribuidor B2B:', err);
    res.status(500).json({ error: 'Error al registrar distribuidor en la base de datos.' });
  } finally {
    client.release();
  }
});

// 3. PUT /api/users/clients/:id - Edita los datos del distribuidor B2B
router.put('/clients/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;
  const { 
    name, email, company_name, tax_id, 
    billing_address, forwarder_address, custom_moa_usd, 
    client_category, destination_country, is_active 
  } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validar pertenencia al tenant
    const checkResult = await client.query('SELECT id FROM users WHERE id=$1 AND tenant_id=$2 AND role=\'b2b_client\'', [id, tenant_id]);
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Distribuidor B2B no encontrado.' });
    }

    // Actualizar user
    const isActiveVal = is_active !== undefined ? is_active : true;
    await client.query(
      `UPDATE users 
       SET name=$1, email=$2, is_active=$3, updated_at=CURRENT_TIMESTAMP 
       WHERE id=$4 AND tenant_id=$5`,
      [name, email.toLowerCase(), isActiveVal, id, tenant_id]
    );

    // Actualizar perfil
    const moa = parseFloat(custom_moa_usd) || 1000.00;
    await client.query(
      `UPDATE b2b_client_profiles 
       SET company_name=$1, tax_id=$2, billing_address=$3, forwarder_address=$4, 
           custom_moa_usd=$5, client_category=$6, destination_country=$7, updated_at=CURRENT_TIMESTAMP
       WHERE user_id=$8 AND tenant_id=$9`,
      [company_name, tax_id, billing_address, forwarder_address, moa, client_category, destination_country, id, tenant_id]
    );

    // Guardar auditoría
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_value, new_value)
       VALUES ($1, $2, 'UPDATE_B2B_CLIENT', 'users', $3, null, $4)`,
      [tenant_id, req.user.id, id, email.toLowerCase()]
    );

    await client.query('COMMIT');
    res.json({ message: 'Datos del distribuidor B2B actualizados con éxito.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al actualizar distribuidor B2B:', err);
    res.status(500).json({ error: 'Error al actualizar distribuidor.' });
  } finally {
    client.release();
  }
});

// 4. DELETE /api/users/clients/:id - Elimina al distribuidor B2B
router.delete('/clients/:id', requireAuth, requireTenantAdmin, async (req, res) => {
  const { tenant_id } = req.user;
  const { id } = req.params;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Validar pertenencia al tenant
    const checkResult = await client.query('SELECT email FROM users WHERE id=$1 AND tenant_id=$2 AND role=\'b2b_client\'', [id, tenant_id]);
    if (checkResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Distribuidor B2B no encontrado.' });
    }

    const clientEmail = checkResult.rows[0].email;

    // Eliminar perfil y usuario (perfil se borra ON DELETE CASCADE por FK user_id)
    await client.query('DELETE FROM users WHERE id=$1 AND tenant_id=$2', [id, tenant_id]);

    // Guardar auditoría
    await client.query(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_value, new_value)
       VALUES ($1, $2, 'DELETE_B2B_CLIENT', 'users', $3, $4, null)`,
      [tenant_id, req.user.id, id, clientEmail]
    );

    await client.query('COMMIT');
    res.json({ message: 'Distribuidor B2B eliminado con éxito.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al eliminar distribuidor B2B:', err);
    res.status(500).json({ error: 'Error al eliminar distribuidor del sistema.' });
  } finally {
    client.release();
  }
});

export default router;
