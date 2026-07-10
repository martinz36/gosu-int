import { useState } from 'react';
import { auth } from '../services/api';

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('admin@gosu.gg');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await auth.login(email, password);
      localStorage.setItem('gosu_token', data.token);
      localStorage.setItem('gosu_user', JSON.stringify(data.user));
      onLogin(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'var(--bg-primary)',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            fontSize: '36px',
            fontWeight: '900',
            letterSpacing: '-1px',
            background: 'linear-gradient(135deg, var(--cyan-neon), var(--pink-neon))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: '8px',
          }}>
            GOSU INT
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
            Portal B2B de Distribuidores
          </p>
        </div>

        {/* Card */}
        <div className="glass-panel" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '24px', textAlign: 'center' }}>
            Iniciar Sesión
          </h2>

          {error && (
            <div style={{
              background: 'rgba(255, 60, 60, 0.1)',
              border: '1px solid rgba(255, 60, 60, 0.4)',
              color: '#ff6b6b',
              padding: '12px',
              borderRadius: '8px',
              fontSize: '13px',
              marginBottom: '16px',
              textAlign: 'center',
            }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="tu@email.com"
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--cyan-neon)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Contraseña
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box',
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--cyan-neon)'}
                onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
              />
            </div>

            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              className="btn-neon"
              style={{ padding: '14px', fontSize: '15px', fontWeight: '700', marginTop: '8px', opacity: loading ? 0.7 : 1 }}
            >
              {loading ? '⏳ Ingresando...' : 'Ingresar al Portal B2B'}
            </button>
          </form>

          <div style={{ marginTop: '24px', textAlign: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              ¿No tienes acceso? Contacta a tu representante de ventas.
            </p>
          </div>
        </div>

        {/* Demo hint */}
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Demo: admin@gosu.gg / GosuAdmin2026!
          </p>
        </div>
      </div>
    </div>
  );
}
