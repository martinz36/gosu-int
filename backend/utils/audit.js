import pool from '../db/pool.js';

/**
 * Registra un log de auditoría en la base de datos.
 * @param {string} userId - ID del usuario ejecutor (puede ser null).
 * @param {string} userName - Nombre del usuario ejecutor.
 * @param {string} tenantId - ID del tenant involucrado (puede ser null).
 * @param {string} action - Acción ejecutada (ej. 'CREATE_TENANT').
 * @param {object} details - Objeto JSON con detalles adicionales.
 */
export async function logAudit(userId, userName, tenantId, action, details = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, user_name, tenant_id, action, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId || null,
        userName || 'System',
        tenantId || null,
        action,
        JSON.stringify(details),
      ]
    );
  } catch (err) {
    console.error('⚠️ [AUDIT ERROR] No se pudo guardar el log de auditoría:', err.message);
  }
}
