import { useCart } from '../context/CartContext';
import { Minus, Plus, Trash2, ArrowRight, Mail, LogIn } from 'lucide-react';
import { db, handleFirestoreError, OperationType, signInWithGoogle, signInWithEmailPassword, getAuthErrorMessage } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuthState } from '../hooks/useAuthState';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function CartPage() {
  const { items, updateQuantity, removeItem, totalItems, totalPrice, clearCart } = useCart();
  const { user } = useAuthState();
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'google' | 'email'>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setAuthError(null);
      setPassword('');
      setIsAuthLoading(false);
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
    if (!user) return;

    if (items.length === 0) return;
    setIsSubmitting(true);

    try {
      const tax = totalPrice * 0.12;
      const grandTotal = totalPrice + tax;
      
      const orderData = {
        userId: user.uid,
        status: 'pending',
        total: grandTotal,
        subtotal: totalPrice,
        createdAt: serverTimestamp(),
        items: items.map(i => ({
          productId: i.product.id,
          name: i.product.name,
          sku: i.product.sku,
          priceAtPurchase: i.product.offerPrice || i.product.price,
          quantity: i.quantity
        }))
      };

      const orderRef = await addDoc(collection(db, 'orders'), orderData);
      
      // WhatsApp Integration
      const WHATSAPP_NUMBER = "5491132983952";
      const orderCode = orderRef.id.slice(0, 8).toUpperCase();
      const message = `*Nuevo Pedido Mayorista*` +
        `\n\n*Pedido:* #${orderCode}` +
        `\n*Cliente:* ${user.email || 'sin email'}` +
        `\n*Items:* ${totalItems}` +
        `\n\n*Detalle:*` +
        `\n${items.map(i => {
          const unitPrice = i.product.offerPrice || i.product.price;
          const lineTotal = unitPrice * i.quantity;
          return `- ${i.quantity}x ${i.product.name} (SKU ${i.product.sku}) - $${lineTotal.toFixed(2)}`;
        }).join('\n')}` +
        `\n\n*Subtotal:* $${totalPrice.toFixed(2)}` +
        `\n*Impuestos (12%):* $${tax.toFixed(2)}` +
        `\n*Total:* $${grandTotal.toFixed(2)}`;

      const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
      const waWindow = window.open(waUrl, '_blank', 'noopener,noreferrer');
      if (!waWindow) {
        window.location.href = waUrl;
      }

      clearCart();
      navigate('/');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'orders');
      alert('Hubo un error al generar la orden.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 md:p-8 text-center h-full">
        <h2 className="text-2xl font-bold text-ink mb-4">Tu pedido está vacío</h2>
        <p className="text-ink-muted mb-8 text-sm md:text-base px-4">Agrega productos del catálogo para generar una orden de compra mayorista.</p>
        <button onClick={() => navigate('/')} className="bg-primary text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
          Volver al Catálogo
        </button>
      </div>
    );
  }

  const tax = totalPrice * 0.12;
  const grandTotal = totalPrice + tax;

  return (
    <div className="flex-1 flex flex-col p-4 md:p-8 h-full overflow-hidden">
      <h1 className="text-2xl md:text-3xl font-bold text-ink mb-6 md:mb-8 shrink-0">Resumen de Pedido</h1>

      <div className="flex-1 overflow-y-auto md:pr-4 mb-4 space-y-4">
        {items.map(item => {
          const price = item.product.offerPrice || item.product.price;
          return (
            <div key={item.product.id} className="bg-surface p-4 rounded-xl flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-center border border-border shadow-sm">
              <div className="flex gap-4 w-full sm:w-auto flex-1">
                <div className="w-20 h-20 bg-bg rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
                  <img 
                    src={item.product.imageUrl || `https://picsum.photos/seed/${item.product.id}/100/100`} 
                    className="w-full h-full object-cover mix-blend-multiply"
                    alt={item.product.name}
                    referrerPolicy="no-referrer"
                  />
                </div>
                
                <div className="flex-1 min-w-0">
                  <h4 className="font-semibold text-[15px] mb-1 truncate" title={item.product.name}>{item.product.name}</h4>
                  <p className="text-[11px] text-ink-muted mb-2">SKU: {item.product.sku}</p>
                  <div className="flex items-center gap-3 bg-bg w-fit px-3 py-1.5 rounded-lg border border-border">
                    <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="text-ink-muted hover:text-ink">
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-semibold w-6 text-center text-sm">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="text-ink-muted hover:text-ink">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex sm:block justify-between items-center w-full sm:w-auto text-left sm:text-right mt-2 sm:mt-0 pt-3 sm:pt-0 border-t sm:border-transparent border-border">
                <p className="font-bold text-[18px] text-primary sm:mb-2">${price.toFixed(2)}</p>
                <button onClick={() => removeItem(item.product.id)} className="text-red-500 hover:text-red-700 transition-colors text-sm font-medium flex items-center gap-1">
                  <Trash2 className="w-4 h-4 sm:hidden" />
                  Eliminar
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-ink text-white rounded-xl p-5 md:px-8 md:py-6 flex flex-col lg:flex-row justify-between items-start lg:items-center shrink-0 mt-2 shadow-lg">
        <div className="grid grid-cols-2 lg:flex gap-x-4 gap-y-4 lg:gap-8 mb-6 lg:mb-0 w-full lg:w-auto">
            <div>
                <span className="block text-[11px] md:text-[12px] opacity-60 mb-1">Ítems</span>
                <p className="text-[15px] md:text-[18px] font-semibold">{totalItems}</p>
            </div>
            <div>
                <span className="block text-[11px] md:text-[12px] opacity-60 mb-1">Subtotal</span>
                <p className="text-[15px] md:text-[18px] font-semibold">${totalPrice.toFixed(2)}</p>
            </div>
            <div>
                <span className="block text-[11px] md:text-[12px] opacity-60 mb-1">Impuestos (12%)</span>
                <p className="text-[15px] md:text-[18px] font-semibold">${tax.toFixed(2)}</p>
            </div>
            <div>
                <span className="block text-[11px] md:text-[12px] opacity-60 mb-1">Total Orden</span>
                <p className="text-[15px] md:text-[18px] font-semibold text-accent">${grandTotal.toFixed(2)}</p>
            </div>
        </div>
        {user ? (
          <button
            onClick={handleCheckout}
            disabled={isSubmitting}
            className="bg-primary text-white px-6 md:px-8 py-3.5 rounded-lg font-semibold text-[14px] hover:bg-blue-700 transition-colors whitespace-nowrap disabled:opacity-50 w-full lg:w-auto flex justify-center items-center gap-2"
          >
            Generar Orden de Compra
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-full lg:w-auto min-w-[280px] space-y-2">
            <button
              onClick={() => {
                void handleGoogleSignIn();
              }}
              disabled={isAuthLoading}
              className="w-full bg-primary text-white px-6 py-3 rounded-lg font-semibold text-[14px] hover:bg-blue-700 transition-colors disabled:opacity-60 flex justify-center items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>{isAuthLoading && authMode === 'google' ? 'Ingresando...' : 'Ingresar con Google'}</span>
            </button>
            <button
              onClick={() => {
                setAuthError(null);
                setAuthMode('email');
              }}
              className={`w-full px-6 py-3 rounded-lg font-semibold text-[14px] transition-colors border flex justify-center items-center gap-2 ${
                authMode === 'email'
                  ? 'bg-accent text-primary border-primary/30'
                  : 'text-white/90 border-white/25 hover:bg-white/10'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span>Ingresar con email</span>
            </button>
            {authMode === 'email' && (
              <div className="space-y-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full rounded-lg px-3 py-2 text-sm bg-white text-ink border border-white/20"
                  autoComplete="email"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contrasena"
                  className="w-full rounded-lg px-3 py-2 text-sm bg-white text-ink border border-white/20"
                  autoComplete="current-password"
                />
                <button
                  onClick={() => {
                    void handleEmailSignIn();
                  }}
                  disabled={isAuthLoading}
                  className="w-full bg-white text-ink px-4 py-2 rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors disabled:opacity-60"
                >
                  {isAuthLoading ? 'Verificando...' : 'Entrar con email'}
                </button>
              </div>
            )}
          </div>
        )}
        {authError && (
          <p className="text-xs text-red-200 mt-3 w-full lg:text-right">{authError}</p>
        )}
      </div>
    </div>
  );
}

