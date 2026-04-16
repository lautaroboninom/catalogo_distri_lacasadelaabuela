import { Link, Outlet, useLocation } from 'react-router-dom';
import { ShoppingCart, LogIn, Store, Settings, LogOut, Menu, X } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useEffect, useState } from 'react';
import { auth, signInWithGoogle, logOut } from '../../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

export default function Layout() {
  const { totalItems } = useCart();
  const [user, setUser] = useState<User | null>(null);
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const closeMenu = () => setIsMobileMenuOpen(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, setUser);
    return unsub;
  }, []);

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] overflow-hidden font-sans bg-bg text-ink w-full">
      {/* Mobile Header */}
      <header className="md:hidden flex items-center justify-between p-4 bg-surface border-b border-border z-20 flex-shrink-0">
        <Link to="/" className="text-lg font-extrabold tracking-tight text-primary flex items-center gap-2" onClick={closeMenu}>
          <Store className="w-5 h-5" /> DISTRI-CORP
        </Link>
        <button onClick={() => setIsMobileMenuOpen(true)}>
          <Menu className="w-6 h-6 text-ink" />
        </button>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-ink/20 z-40 md:hidden backdrop-blur-sm" onClick={closeMenu} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-border bg-surface p-6 flex flex-col flex-shrink-0 transition-transform duration-300 md:static md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between md:hidden mb-8">
          <Link to="/" className="text-xl font-extrabold tracking-tight text-primary flex items-center gap-2" onClick={closeMenu}>
            <Store className="w-6 h-6" /> DISTRI-CORP
          </Link>
          <button onClick={closeMenu}><X className="w-6 h-6 text-ink-muted"/></button>
        </div>

        <Link to="/" className="hidden md:flex text-xl font-extrabold tracking-tight text-primary mb-10 items-center gap-2" onClick={closeMenu}>
          <Store className="w-6 h-6" />
          DISTRI-CORP
        </Link>

        <div className="mb-8 overflow-y-auto">
          <div className="text-[11px] uppercase tracking-wider text-ink-muted mb-3 font-semibold">
            Navegación
          </div>
          <Link
            to="/"
            onClick={closeMenu}
            className={`block px-3 py-2 rounded-md text-sm mb-1 transition-colors ${
              location.pathname === '/' 
                ? 'bg-accent text-primary font-semibold' 
                : 'text-ink hover:bg-neutral-100'
            }`}
          >
            Catálogo
          </Link>
          <Link
            to="/cart"
            onClick={closeMenu}
            className={`flex items-center justify-between px-3 py-2 rounded-md text-sm mb-1 transition-colors ${
              location.pathname === '/cart' 
                ? 'bg-accent text-primary font-semibold' 
                : 'text-ink hover:bg-neutral-100'
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
          
          {user && (
            <Link
              to="/admin"
              onClick={closeMenu}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm mb-1 transition-colors ${
                location.pathname === '/admin' 
                  ? 'bg-accent text-primary font-semibold' 
                  : 'text-ink hover:bg-neutral-100'
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
                <div className="px-3 text-ink-muted truncate" title={user.email || ''}>{user.email}</div>
                <button
                  onClick={() => { logOut(); closeMenu(); }}
                  className="flex items-center gap-2 px-3 py-2 text-ink hover:bg-neutral-100 rounded-md transition-colors w-full text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Cerrar sesión</span>
                </button>
             </div>
          ) : (
            <button
              onClick={() => { signInWithGoogle(); closeMenu(); }}
              className="flex items-center justify-center gap-2 w-full bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Ingresar</span>
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-x-hidden overflow-y-auto relative h-full">
        <Outlet />
      </main>
    </div>
  );
}

