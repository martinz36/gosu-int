import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'gosu-dev-secret-change-in-prod';

/**
 * Middleware que verifica el JWT Bearer token.
 * Adjunta req.user = { id, tenant_id, role, email } al request.
 */
export function requireAuth(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

/**
 * Middleware que verifica que el usuario sea administrador del tenant.
 * Debe usarse después de requireAuth.
 */
export function requireTenantAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'tenant_admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador de empresa (Tenant Admin).' });
  }
  next();
}

/**
 * Middleware que verifica que el usuario sea super administrador de la plataforma.
 * Debe usarse después de requireAuth.
 */
export function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de super administrador de la plataforma.' });
  }
  next();
}

/**
 * Middleware que verifica que el usuario sea un cliente B2B.
 * Debe usarse después de requireAuth.
 */
export function requireB2BClient(req, res, next) {
  if (!req.user || req.user.role !== 'b2b_client') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de cliente B2B.' });
  }
  next();
}
