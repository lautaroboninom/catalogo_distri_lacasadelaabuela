import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Minus, Plus, Trash2, ArrowRight, Mail, LogIn, UserRound, ChevronDown } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuthState } from '../hooks/useAuthState';
import {
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signInWithEmailPassword,
  getAuthErrorMessage,
} from '../firebase';

function buildGuestOrderCode() {
  return `WEB-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

export default function CartPage() {
  const { items, updateQuantity, removeItem, totalItems, totalPrice, clearCart } = useCart();
  const { user } = useAuthState();
  const navigate = useNavigate();
  const [customerName, setCustomerName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'google' | 'email'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showOptionalLogin, setShowOptionalLogin] = useState(false);

  useEffect(() => {
    if (!user || customerName.trim()) return;

    const fallbackName = user.email?.split('@')[0]?.replace(/[._-]+/g, ' ') || '';
    setCustomerName(
      fallbackName.replace(/\b\w/g, (letter) => letter.toUpperCase())
    );
  }, [user, customerName]);

  useEffect(() => {
    if (user) {
      setAuthError(null);
      setPassword('');
      setIsAuthLoading(false);
      setShowOptionalLogin(false);
    }
  }, [user]);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthMode('google');
    setIsAuthLoading(true);
    try {
      await signInWithGoogle();
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
    setAuthMode('email');
    setIsAuthLoading(true);
    try {
      await signInWithEmailPassword(email, password);
      setPassword('');
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleCheckout = async () => {
    if (items.length === 0) return;

    const trimmedName = customerName.trim();
    if (!trimmedName) {
      alert('Ingresa tu nombre para generar el pedido.');
      return;
    }

    setIsSubmitting(true);

    try {
      const tax = totalPrice * 0.12;
      const grandTotal = totalPrice + tax;

      let orderCode = buildGuestOrderCode();
      if (user) {
        const orderData = {
          userId: user.uid,
          customerName: trimmedName,
          contactEmail: user.email || null,
          status: 'pending',
          total: grandTotal,
          subtotal: totalPrice,
          createdAt: serverTimestamp(),
          items: items.map((item) => ({
            productId: item.product.id,
            name: item.product.name,
            sku: item.product.sku,
            priceAtPurchase: item.product.offerPrice || item.product.price,
            quantity: item.quantity,
          })),
        };

        const orderRef = await addDoc(collection(db, 'orders'), orderData);
        orderCode = orderRef.id.slice(0, 8).toUpperCase();
      }

      const whatsappNumber = '5491132983952';
      const contactLine = user?.email ? `\n*Contacto:* ${user.email}` : '';
      const message =
        `*Nuevo Pedido Mayorista*` +
        `\n\n*Pedido:* #${orderCode}` +
        `\n*Cliente:* ${trimmedName}` +
        contactLine +
        `\n*Items:* ${totalItems}` +
        `\n\n*Detalle:*` +
        `\n${items
          .map((item) => {
            const unitPrice = item.product.offerPrice || item.product.price;
            const lineTotal = unitPrice * item.quantity;
            return `- ${item.quantity}x ${item.product.name} (SKU ${item.product.sku}) - $${lineTotal.toFixed(2)}`;
          })
          .join('\n')}` +
        `\n\n*Subtotal:* $${totalPrice.toFixed(2)}` +
        `\n*Impuestos (12%):* $${tax.toFixed(2)}` +
        `\n*Total:* $${grandTotal.toFixed(2)}`;

      const waUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
      const waWindow = window.open(waUrl, '_blank', 'noopener,noreferrer');
      if (!waWindow) {
        window.location.href = waUrl;
      }

      clearCart();
      if (!user) {
        setCustomerName('');
      }
      navigate('/');
    } catch (err) {
      if (user) {
        handleFirestoreError(err, OperationType.CREATE, 'orders');
      }
      alert('Hubo un error al generar la orden.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center p-4 text-center md:p-8">
        <h2 className="mb-4 text-2xl font-bold text-ink">Tu pedido esta vacio</h2>
        <p className="mb-8 px-4 text-sm text-ink-muted md:text-base">
          Agrega productos del catalogo para generar una orden de compra mayorista.
        </p>
        <button
          onClick={() => navigate('/')}
          className="rounded-lg bg-primary px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700"
        >
          Volver al Catalogo
        </button>
      </div>
    );
  }

  const tax = totalPrice * 0.12;
  const grandTotal = totalPrice + tax;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden p-4 md:p-8">
      <h1 className="mb-6 shrink-0 text-2xl font-bold text-ink md:mb-8 md:text-3xl">Resumen de Pedido</h1>

      <div className="mb-4 flex-1 space-y-4 overflow-y-auto md:pr-4">
        {items.map((item) => {
          const price = item.product.offerPrice || item.product.price;
          return (
            <div
              key={item.product.id}
              className="flex flex-col items-start gap-4 rounded-xl border border-border bg-surface p-4 shadow-sm sm:flex-row sm:items-center sm:gap-6"
            >
              <div className="flex w-full flex-1 gap-4 sm:w-auto">
                <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-bg">
                  <img
                    src={item.product.imageUrl || `https://picsum.photos/seed/${item.product.id}/100/100`}
                    className="h-full w-full object-cover mix-blend-multiply"
                    alt={item.product.name}
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="min-w-0 flex-1">
                  <h4 className="mb-1 truncate text-[15px] font-semibold" title={item.product.name}>
                    {item.product.name}
                  </h4>
                  <p className="mb-2 text-[11px] text-ink-muted">SKU: {item.product.sku}</p>
                  <div className="flex w-fit items-center gap-3 rounded-lg border border-border bg-bg px-3 py-1.5">
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                      className="text-ink-muted hover:text-ink"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                      className="text-ink-muted hover:text-ink"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-2 flex w-full items-center justify-between border-t border-border pt-3 text-left sm:mt-0 sm:block sm:w-auto sm:border-transparent sm:pt-0 sm:text-right">
                <p className="text-[18px] font-bold text-primary sm:mb-2">${price.toFixed(2)}</p>
                <button
                  onClick={() => removeItem(item.product.id)}
                  className="flex items-center gap-1 text-sm font-medium text-red-500 transition-colors hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4 sm:hidden" />
                  Eliminar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex shrink-0 flex-col items-start justify-between rounded-xl bg-ink p-5 text-white shadow-lg md:px-8 md:py-6 lg:flex-row lg:items-center">
        <div className="mb-6 grid w-full gap-4 lg:mb-0 lg:w-auto lg:min-w-[320px]">
          <div className="rounded-xl bg-white/6 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <UserRound className="h-4 w-4" />
              Datos para confirmar
            </div>
            <label className="mb-2 block text-[11px] uppercase tracking-wide text-white/60">
              Nombre
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente"
              className="w-full rounded-lg border border-white/15 bg-white px-3 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              autoComplete="name"
            />
            <p className="mt-2 text-xs text-white/70">
              No hace falta registrarse. Con el nombre ya podes enviar el pedido.
            </p>
            {user && (
              <p className="mt-2 text-xs text-accent">
                Sesion iniciada como {user.email}
              </p>
            )}
          </div>

          {!user && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <button
                onClick={() => setShowOptionalLogin((current) => !current)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-white">Ingresar con cuenta es opcional</p>
                  <p className="text-xs text-white/65">
                    Si queres, podes iniciar sesion para dejar asociado tu mail al pedido.
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform ${showOptionalLogin ? 'rotate-180' : ''}`}
                />
              </button>

              {showOptionalLogin && (
                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => {
                      void handleGoogleSignIn();
                    }}
                    disabled={isAuthLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                  >
                    <LogIn className="h-4 w-4" />
                    <span>{isAuthLoading && authMode === 'google' ? 'Ingresando...' : 'Ingresar con Google'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setAuthError(null);
                      setAuthMode('email');
                    }}
                    className={`flex w-full items-center justify-center gap-2 rounded-lg border px-6 py-3 text-[14px] font-semibold transition-colors ${
                      authMode === 'email'
                        ? 'border-primary/30 bg-accent text-primary'
                        : 'border-white/25 text-white/90 hover:bg-white/10'
                    }`}
                  >
                    <Mail className="h-4 w-4" />
                    <span>Ingresar con email</span>
                  </button>

                  {authMode === 'email' && (
                    <div className="space-y-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        className="w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm text-ink"
                        autoComplete="email"
                      />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Contrasena"
                        className="w-full rounded-lg border border-white/20 bg-white px-3 py-2 text-sm text-ink"
                        autoComplete="current-password"
                      />
                      <button
                        onClick={() => {
                          void handleEmailSignIn();
                        }}
                        disabled={isAuthLoading}
                        className="w-full rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-white/90 disabled:opacity-60"
                      >
                        {isAuthLoading ? 'Verificando...' : 'Entrar con email'}
                      </button>
                    </div>
                  )}

                  {authError && <p className="mt-3 text-xs text-red-200">{authError}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-full lg:w-auto lg:min-w-[320px]">
          <div className="mb-6 grid grid-cols-2 gap-x-4 gap-y-4 lg:gap-8">
            <div>
              <span className="mb-1 block text-[11px] opacity-60 md:text-[12px]">Items</span>
              <p className="text-[15px] font-semibold md:text-[18px]">{totalItems}</p>
            </div>
            <div>
              <span className="mb-1 block text-[11px] opacity-60 md:text-[12px]">Subtotal</span>
              <p className="text-[15px] font-semibold md:text-[18px]">${totalPrice.toFixed(2)}</p>
            </div>
            <div>
              <span className="mb-1 block text-[11px] opacity-60 md:text-[12px]">Impuestos (12%)</span>
              <p className="text-[15px] font-semibold md:text-[18px]">${tax.toFixed(2)}</p>
            </div>
            <div>
              <span className="mb-1 block text-[11px] opacity-60 md:text-[12px]">Total Orden</span>
              <p className="text-[15px] font-semibold text-accent md:text-[18px]">${grandTotal.toFixed(2)}</p>
            </div>
          </div>

          <button
            onClick={handleCheckout}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3.5 text-[14px] font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            Enviar Pedido
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
