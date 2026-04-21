import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  ShoppingCart,
  LogIn,
  Store,
  Settings,
  LogOut,
  Menu,
  X,
  Mail,
  type LucideIcon,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useEffect, useState } from 'react';
import {
  signInWithGoogle,
  signInWithEmailPassword,
  logOut,
  getAuthErrorMessage,
} from '../../firebase';
import { useAuthState } from '../../hooks/useAuthState';

type MobileNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

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
  const isCurrentPath = (path: string) => location.pathname === path;
  const mobileNavItems: MobileNavItem[] = [
    { to: '/', label: 'Catalogo', icon: Store },
    { to: '/cart', label: 'Pedido', icon: ShoppingCart, badge: totalItems || undefined },
    ...(isAdmin ? [{ to: '/admin', label: 'Admin', icon: Settings }] : []),
  ];
  const mobileNavGridClass = mobileNavItems.length === 3 ? 'grid-cols-3' : 'grid-cols-2';

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
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-bg font-sans text-ink md:flex-row">
      <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur-sm md:hidden">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2 text-lg font-extrabold tracking-tight text-primary"
          onClick={closeMenu}
        >
          <Store className="h-5 w-5" />
          <span className="truncate">DISTRI-CORP</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            to="/cart"
            className="flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-2 text-sm font-semibold text-ink"
            onClick={closeMenu}
          >
            <ShoppingCart className="h-4 w-4" />
            <span>Pedido</span>
            {totalItems > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                {totalItems}
              </span>
            )}
          </Link>

          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg text-ink"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm md:hidden"
          onClick={closeMenu}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-xs shrink-0 flex-col border-r border-border bg-surface p-5 transition-transform duration-300 md:static md:w-64 md:max-w-none md:translate-x-0 md:p-6 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-8 flex items-center justify-between md:hidden">
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-primary"
            onClick={closeMenu}
          >
            <Store className="h-6 w-6" />
            DISTRI-CORP
          </Link>

          <button onClick={closeMenu} aria-label="Cerrar menu">
            <X className="h-6 w-6 text-ink-muted" />
          </button>
        </div>

        <Link
          to="/"
          className="mb-10 hidden items-center gap-2 text-xl font-extrabold tracking-tight text-primary md:flex"
          onClick={closeMenu}
        >
          <Store className="h-6 w-6" />
          DISTRI-CORP
        </Link>

        <div className="mb-8 overflow-y-auto">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Navegacion
          </div>

          <Link
            to="/"
            onClick={closeMenu}
            className={`mb-1 block rounded-md px-3 py-2 text-sm transition-colors ${
              isCurrentPath('/') ? 'bg-accent font-semibold text-primary' : 'text-ink hover:bg-neutral-100'
            }`}
          >
            Catalogo
          </Link>

          <Link
            to="/cart"
            onClick={closeMenu}
            className={`mb-1 flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
              isCurrentPath('/cart') ? 'bg-accent font-semibold text-primary' : 'text-ink hover:bg-neutral-100'
            }`}
          >
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              <span>Pedido</span>
            </div>
            {totalItems > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                {totalItems}
              </span>
            )}
          </Link>

          {user && isAdmin && (
            <Link
              to="/admin"
              onClick={closeMenu}
              className={`mb-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                isCurrentPath('/admin') ? 'bg-accent font-semibold text-primary' : 'text-ink hover:bg-neutral-100'
              }`}
            >
              <Settings className="h-4 w-4" />
              <span>Administracion</span>
            </Link>
          )}
        </div>

        <div className="mt-auto shrink-0 border-t border-border pt-6">
          {user ? (
            <div className="flex flex-col gap-3 text-sm">
              <div className="truncate px-3 text-ink-muted" title={user.email || ''}>
                {user.email}
              </div>

              <button
                onClick={() => {
                  logOut();
                  closeMenu();
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-ink transition-colors hover:bg-neutral-100"
              >
                <LogOut className="h-4 w-4" />
                <span>Cerrar sesion</span>
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
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
              >
                <LogIn className="h-4 w-4" />
                <span>{isAuthLoading && authMode === 'google' ? 'Ingresando...' : 'Ingresar con Google'}</span>
              </button>

              <button
                onClick={() => {
                  setAuthError(null);
                  setAuthMode('email');
                }}
                className={`flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                  authMode === 'email'
                    ? 'border-primary/30 bg-accent text-primary'
                    : 'border-border bg-transparent text-ink hover:bg-neutral-100'
                }`}
              >
                <Mail className="h-4 w-4" />
                <span>Ingresar con email</span>
              </button>

              {authMode === 'email' && (
                <div className="space-y-2 pt-1">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink"
                    autoComplete="email"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contrasena"
                    className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink"
                    autoComplete="current-password"
                  />
                  <button
                    onClick={() => {
                      void handleEmailSignIn();
                    }}
                    disabled={isAuthLoading}
                    className="w-full rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {isAuthLoading ? 'Verificando...' : 'Entrar con email'}
                  </button>
                </div>
              )}

              {authError && <p className="px-1 text-xs leading-snug text-red-600">{authError}</p>}
            </div>
          )}
        </div>
      </aside>

      <main className="relative flex h-full flex-1 flex-col overflow-x-hidden overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur-sm md:hidden">
        <div className={`grid gap-1 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] ${mobileNavGridClass}`}>
          {mobileNavItems.map(({ to, label, icon: Icon, badge }) => {
            const active = isCurrentPath(to);

            return (
              <Link
                key={to}
                to={to}
                onClick={closeMenu}
                className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold transition-colors ${
                  active ? 'bg-accent text-primary' : 'text-ink-muted'
                }`}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {badge && badge > 0 && (
                    <span className="absolute -right-2 -top-2 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 py-0.5 text-[9px] font-bold text-white">
                      {badge}
                    </span>
                  )}
                </span>
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
