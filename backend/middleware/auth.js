import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'gosu-dev-secret-change-in-prod';

/**
 * Middleware que verifica el JWT Bearer token.
 * Adjunta req.user = { id, tenant_id, role, email } al request.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticación requerido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

/**
 * Middleware que verifica que el usuario sea administrador.
 * Debe usarse después de requireAuth.
 */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
  }
  next();
}
