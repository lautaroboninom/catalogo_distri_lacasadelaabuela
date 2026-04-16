import { createContext, useContext, useState, ReactNode, useEffect, useMemo } from 'react';
import { Product, Promotion, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, quantity: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  promotions: Promotion[];
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('abuela_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [promotions, setPromotions] = useState<Promotion[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'promotions'), (snapshot) => {
      const promos: Promotion[] = [];
      snapshot.forEach(doc => {
        promos.push({ id: doc.id, ...doc.data() } as Promotion);
      });
      setPromotions(promos);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'promotions'));
    return unsub;
  }, []);

  useEffect(() => {
    localStorage.setItem('abuela_cart', JSON.stringify(items));
  }, [items]);

  const addItem = (product: Product, quantity: number) => {
    setItems((current) => {
      const existing = current.find(i => i.product.id === product.id);
      if (existing) {
        return current.map(i => 
          i.product.id === product.id 
            ? { ...i, quantity: i.quantity + quantity }
            : i
        );
      }
      return [...current, { product, quantity }];
    });
  };

  const removeItem = (productId: string) => {
    setItems(current => current.filter(i => i.product.id !== productId));
  };

  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }
    setItems(current => 
      current.map(i => i.product.id === productId ? { ...i, quantity } : i)
    );
  };

  const clearCart = () => setItems([]);

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  
  const totalPrice = useMemo(() => {
    let total = 0;

    items.forEach(item => {
      // Find highest priority matching promotion (product > category > all)
      const matchingPromos = promotions.filter(p => 
        p.targetType === 'all' || 
        (p.targetType === 'category' && p.targetId === item.product.category) ||
        (p.targetType === 'product' && p.targetId === item.product.id)
      );
      
      // Sort to give priority to 'product' specific, then 'category', then 'all'
      matchingPromos.sort((a, b) => {
        const priority = { product: 3, category: 2, all: 1 };
        return priority[b.targetType] - priority[a.targetType];
      });

      const promo = matchingPromos[0];
      const basePrice = item.product.offerPrice || item.product.price;
      let itemTotal = basePrice * item.quantity;

      if (promo) {
        if (promo.type === 'percentage' && promo.value) {
          itemTotal = itemTotal * (1 - promo.value / 100);
        } else if (promo.type === 'volume' && promo.buyQuantity && promo.payQuantity) {
          const buyQ = promo.buyQuantity;
          const payQ = promo.payQuantity;
          if (item.quantity >= buyQ) {
            const numPromos = Math.floor(item.quantity / buyQ);
            const remainder = item.quantity % buyQ;
            itemTotal = (numPromos * payQ * basePrice) + (remainder * basePrice);
          }
        }
      }
      total += itemTotal;
    });

    return total;
  }, [items, promotions]);

  return (
    <CartContext.Provider value={{
      items, addItem, removeItem, updateQuantity, clearCart, totalItems, totalPrice, promotions
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
