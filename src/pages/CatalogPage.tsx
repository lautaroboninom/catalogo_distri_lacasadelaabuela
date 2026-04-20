import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, Product, handleFirestoreError, OperationType } from '../firebase';
import { ShoppingCart, Plus } from 'lucide-react';
import { useCart } from '../context/CartContext';

const CATEGORIES = ["Todas", "Cervezas", "Gaseosas", "Almacén", "Aguas", "Aperitivos", "Vinos", "Petacas", "Fideos", "Arroz", "Pure", "Azúcar", "Alfajores", "Turrones", "Galletitas", "Yerbas", "Golosinas", "Snack", "Cigarrillos", "Analgésicos", "Panificados"];

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState("Todas");
  const [search, setSearch] = useState("");
  const { addItem, items, promotions } = useCart();

  useEffect(() => {
    // Only query active products
    const q = query(
      collection(db, 'products'),
      where('status', '==', 'active')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach(doc => {
        prods.push({ id: doc.id, ...doc.data() } as Product);
      });
      setLoadError(null);
      setProducts(prods);
      setLoading(false);
    }, (err) => {
      setLoadError('No se pudo cargar el catálogo. Revisar reglas/permisos de Firestore.');
      setProducts([]);
      setLoading(false);
      handleFirestoreError(err, OperationType.LIST, 'products');
    });

    return unsubscribe;
  }, []);

  const filteredProducts = products.filter(p => {
    const matchCat = selectedCategory === "Todas" || p.category === selectedCategory;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="flex-1 flex flex-col p-8">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <h1 className="text-3xl font-bold text-ink">Catálogo de Productos</h1>
        <input 
          type="text" 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full sm:w-[400px] px-4 py-2.5 bg-surface border border-border rounded-lg text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" 
          placeholder="Buscar por nombre o SKU..."
        />
      </header>

      {/* Categories */}
      <div className="mb-8 overflow-x-auto pb-2 hide-scrollbar">
        <div className="flex gap-2">
          {CATEGORIES.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap text-sm font-semibold transition-colors
                ${selectedCategory === category 
                  ? 'bg-accent text-primary' 
                  : 'bg-surface text-ink-muted hover:bg-neutral-100 border border-border'}`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-ink-muted">Cargando catálogo...</div>
      ) : loadError ? (
        <div className="text-center py-20 text-red-600">{loadError}</div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-20 text-ink-muted">No hay productos disponibles por ahora.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 flex-1">
          {filteredProducts.map(product => {
            const inCart = items.find(i => i.product.id === product.id)?.quantity || 0;
            
            // Find applicable promo (same logic as Cart)
            const matchingPromos = promotions.filter(p => 
              p.targetType === 'all' || 
              (p.targetType === 'category' && p.targetId === product.category) ||
              (p.targetType === 'product' && p.targetId === product.id)
            ).sort((a, b) => {
              const priority = { product: 3, category: 2, all: 1 };
              return priority[b.targetType] - priority[a.targetType];
            });
            const promo = matchingPromos[0];

            return (
              <div key={product.id} className="bg-surface border border-border rounded-xl p-4 flex flex-col relative transition-shadow hover:shadow-md">
                {promo && (
                  <div className="absolute top-4 left-4 z-10">
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-1 rounded-full uppercase shadow-sm">
                      {promo.type === 'volume' ? `${promo.buyQuantity}x${promo.payQuantity}` : `${promo.value}% OFF`}
                    </span>
                  </div>
                )}
                <div className="w-full h-[140px] bg-bg rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                  <img 
                    src={product.imageUrl || `https://picsum.photos/seed/${product.id}/400/400`} 
                    alt={product.name} 
                    className="object-cover w-full h-full mix-blend-multiply"
                    referrerPolicy="no-referrer"
                  />
                </div>
                
                <div className="text-[11px] text-ink-muted mb-1">
                  SKU: {product.sku}
                </div>
                
                <div className="font-semibold text-[15px] mb-2 text-ink">
                  {product.name}
                </div>
                
                <div className="text-[18px] font-bold text-primary mt-auto">
                  ${(product.offerPrice || product.price).toFixed(2)}
                </div>

                <button
                  onClick={() => addItem(product, 1)}
                  className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-blue-700 transition-colors"
                  title="Agregar al pedido"
                >
                  <Plus className="w-5 h-5" />
                </button>
                {inCart > 0 && (
                  <span className="absolute top-4 right-4 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-full uppercase">
                    {inCart} en pedido
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


