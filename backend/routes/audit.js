import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireSuperAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================================
// GET /api/audit (Solo Super Admin)
// Retorna la lista de logs de auditoría ordenados cronológicamente
// ============================================================
router.get('/', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT al.id, al.user_id, al.user_name, al.tenant_id, al.action, al.details, al.created_at, t.name as tenant_name
       FROM audit_logs al
       LEFT JOIN tenants t ON t.id = al.tenant_id
       ORDER BY al.created_at DESC
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener audit logs:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ============================================================
// GET /api/audit/metrics (Solo Super Admin)
// Calcula métricas globales de uso y facturación SaaS
// ============================================================
router.get('/metrics', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    // 1. Conteo de Tenants según estado
    const tenantStates = await pool.query(
      `SELECT status, COUNT(*) as count 
       FROM tenants 
       WHERE deleted_at IS NULL 
       GROUP BY status`
    );

    let activeTenants = 0;
    let suspendedTenants = 0;
    let blockedTenants = 0;

    tenantStates.rows.forEach(row => {
      if (row.status === 'active') activeTenants = parseInt(row.count);
      if (row.status === 'suspended') suspendedTenants = parseInt(row.count);
      if (row.status === 'blocked') blockedTenants = parseInt(row.count);
    });

    // 2. Conteo total de usuarios
    const usersCount = await pool.query('SELECT COUNT(*) as count FROM users');
    const totalUsers = parseInt(usersCount.rows[0].count);

    // 3. Estación de Ingresos SaaS (suma de precios de planes de tenants activos)
    const revenueResult = await pool.query(
      `SELECT COALESCE(SUM(p.price_usd), 0) as estim
       FROM tenants t
       JOIN plans p ON p.id = t.plan_id
       WHERE t.deleted_at IS NULL AND t.status = 'active'`
    );
    const monthlyRevenueEstim = parseFloat(revenueResult.rows[0].estim);

    // 4. Nuevos usuarios creados este mes
    const newUsersResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM users 
       WHERE created_at >= date_trunc('month', CURRENT_DATE)`
    );
    const newUsersThisMonth = parseInt(newUsersResult.rows[0].count);

    // 5. Distribución de inquilinos por plan
    const planDistrib = await pool.query(
      `SELECT p.name as plan_name, COUNT(t.id) as count
       FROM tenants t
       JOIN plans p ON p.id = t.plan_id
       WHERE t.deleted_at IS NULL
       GROUP BY p.name`
    );

    res.json({
      activeTenants,
      suspendedTenants,
      blockedTenants,
      totalUsers,
      monthlyRevenueEstim,
      newUsersThisMonth,
      planDistribution: planDistrib.rows,
    });
  } catch (err) {
    console.error('Error al obtener métricas SaaS:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

export default router;
