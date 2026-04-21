import { Link, Outlet, useLocation } from 'react-router-dom';
import { ShoppingCart, LogIn, Store, Settings, LogOut, Menu, X, Mail } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useEffect, useState } from 'react';
import { signInWithGoogle, signInWithEmailPassword, logOut, getAuthErrorMessage } from '../../firebase';
import { useAuthState } from '../../hooks/useAuthState';

export default function Layout() {
  const { totalItems } = useCart();
  const { user, isAdmin } = useAuthState();
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'google' | 'email'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeMenu = () => setIsMobileMenuOpen(false);

  useEffect(() => {
    if (user) {
      setAuthError(null);
      setPassword('');
      setIsAuthLoading(false);
    }
  }, [user]);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setIsAuthLoading(true);
    try {
      await signInWithGoogle();
      closeMenu();
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleEmailSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setAuthError('Completa email y contrasena.');
      return;
    }

    setAuthError(null);
    setIsAuthLoading(true);
    try {
      await signInWithEmailPassword(email, password);
      setPassword('');
      closeMenu();
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsAuthLoading(false);
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] overflow-hidden font-sans bg-bg text-ink w-full">
      <header className="md:hidden flex items-center justify-between p-4 bg-surface border-b border-border z-20 flex-shrink-0">
        <Link to="/" className="text-lg font-extrabold tracking-tight text-primary flex items-center gap-2" onClick={closeMenu}>
          <Store className="w-5 h-5" /> DISTRI-CORP
        </Link>
        <button onClick={() => setIsMobileMenuOpen(true)}>
          <Menu className="w-6 h-6 text-ink" />
        </button>
      </header>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-ink/20 z-40 md:hidden backdrop-blur-sm" onClick={closeMenu} />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-surface p-6 flex flex-col flex-shrink-0 transition-transform duration-300 md:static md:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between md:hidden mb-8">
          <Link to="/" className="text-xl font-extrabold tracking-tight text-primary flex items-center gap-2" onClick={closeMenu}>
            <Store className="w-6 h-6" /> DISTRI-CORP
          </Link>
          <button onClick={closeMenu}>
            <X className="w-6 h-6 text-ink-muted" />
          </button>
        </div>

        <Link to="/" className="hidden md:flex text-xl font-extrabold tracking-tight text-primary mb-10 items-center gap-2" onClick={closeMenu}>
          <Store className="w-6 h-6" />
          DISTRI-CORP
        </Link>

        <div className="mb-8 overflow-y-auto">
          <div className="text-[11px] uppercase tracking-wider text-ink-muted mb-3 font-semibold">Navegación</div>
          <Link
            to="/"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-sm mb-1 transition-colors ${
              location.pathname === '/' ? 'bg-accent text-primary font-semibold' : 'text-ink hover:bg-neutral-100'
            }`}
          >
            Catálogo
          </Link>
          <Link
            to="/cart"
            onClick={closeMenu}
            className={`flex items-center justify-between px-3 py-2 rounded-md text-sm mb-1 transition-colors ${
              location.pathname === '/cart' ? 'bg-accent text-primary font-semibold' : 'text-ink hover:bg-neutral-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4" />
              <span>Pedido</span>
            </div>
            {totalItems > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold text-white bg-primary rounded-full">
                {totalItems}
              </span>
            )}
          </Link>

          {user && isAdmin && (
            <Link
              to="/admin"
              onClick={closeMenu}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm mb-1 transition-colors ${
                location.pathname === '/admin' ? 'bg-accent text-primary font-semibold' : 'text-ink hover:bg-neutral-100'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Administración</span>
            </Link>
          )}
        </div>

        <div className="mt-auto pt-6 border-t border-border shrink-0">
          {user ? (
            <div className="flex flex-col gap-3 text-sm">
              <div className="px-3 text-ink-muted truncate" title={user.email || ''}>
                {user.email}
              </div>
              <button
                onClick={() => {
                  logOut();
                  closeMenu();
                }}
                className="flex items-center gap-2 px-3 py-2 text-ink hover:bg-neutral-100 rounded-md transition-colors w-full text-left"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => {
                  setAuthMode('google');
                  void handleGoogleSignIn();
                }}
                disabled={isAuthLoading}
                className="flex items-center justify-center gap-2 w-full bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                <LogIn className="w-4 h-4" />
                <span>{isAuthLoading && authMode === 'google' ? 'Ingresando...' : 'Ingresar con Google'}</span>
              </button>
              <button
                onClick={() => {
                  setAuthError(null);
                  setAuthMode('email');
                }}
                className={`flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                  authMode === 'email'
                    ? 'bg-accent text-primary border-primary/30'
                    : 'bg-transparent text-ink border-border hover:bg-neutral-100'
                }`}
              >
                <Mail className="w-4 h-4" />
                <span>Ingresar con email</span>
              </button>
              {authMode === 'email' && (
                <div className="space-y-2 pt-1">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white text-ink"
                    autoComplete="email"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contrasena"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white text-ink"
                    autoComplete="current-password"
                  />
                  <button
                    onClick={() => {
                      void handleEmailSignIn();
                    }}
                    disabled={isAuthLoading}
                    className="w-full bg-ink text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                  >
                    {isAuthLoading ? 'Verificando...' : 'Entrar con email'}
                  </button>
                </div>
              )}
              {authError && <p className="px-1 text-xs text-red-600 leading-snug">{authError}</p>}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-x-hidden overflow-y-auto relative h-full">
        <Outlet />
      </main>
    </div>
  );
}
