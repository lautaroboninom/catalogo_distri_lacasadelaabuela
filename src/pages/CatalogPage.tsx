import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db, Product, handleFirestoreError, OperationType } from '../firebase';
import { Plus, Search } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { PRODUCT_CATEGORIES } from '../data/productCategories';

export default function CatalogPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [search, setSearch] = useState('');
  const { addItem, items, promotions } = useCart();

  useEffect(() => {
    const q = query(collection(db, 'products'), where('status', '==', 'active'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const prods: Product[] = [];
        snapshot.forEach((doc) => {
          prods.push({ id: doc.id, ...doc.data() } as Product);
        });
        setLoadError(null);
        setProducts(prods);
        setLoading(false);
      },
      (err) => {
        setLoadError('No se pudo cargar el catalogo. Revisar reglas/permisos de Firestore.');
        setProducts([]);
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'products');
      }
    );

    return unsubscribe;
  }, []);

  const filteredProducts = products.filter((product) => {
    const matchCategory = selectedCategory === 'Todas' || product.category === selectedCategory;
    const matchSearch =
      product.name.toLowerCase().includes(search.toLowerCase()) ||
      product.sku.toLowerCase().includes(search.toLowerCase());

    return matchCategory && matchSearch;
  });

  return (
    <div className="flex flex-1 flex-col px-3 pb-4 pt-3 sm:p-8">
      <div className="sticky top-0 z-20 -mx-3 mb-4 space-y-3 bg-bg/95 px-3 pb-3 backdrop-blur-sm sm:static sm:mx-0 sm:mb-8 sm:space-y-4 sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-ink sm:text-3xl">Catalogo de Productos</h1>
            <p className="mt-1 text-sm text-ink-muted">{filteredProducts.length} productos disponibles</p>
          </div>

          <label className="relative block w-full sm:w-[400px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-2xl border border-border bg-surface py-3 pl-10 pr-4 text-sm text-ink outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="Buscar por nombre o SKU..."
            />
          </label>
        </header>

        <div className="overflow-x-auto pb-1 hide-scrollbar">
          <div className="flex gap-2 pr-3 sm:pr-0">
            {PRODUCT_CATEGORIES.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`rounded-full border px-4 py-2.5 whitespace-nowrap text-sm font-semibold transition-colors ${
                  selectedCategory === category
                    ? 'border-primary bg-accent text-primary'
                    : 'border-border bg-surface text-ink-muted hover:bg-neutral-100'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-ink-muted">Cargando catalogo...</div>
      ) : loadError ? (
        <div className="py-20 text-center text-red-600">{loadError}</div>
      ) : filteredProducts.length === 0 ? (
        <div className="py-20 text-center text-ink-muted">No hay productos disponibles por ahora.</div>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5">
          {filteredProducts.map((product) => {
            const inCart = items.find((item) => item.product.id === product.id)?.quantity || 0;

            const matchingPromos = promotions
              .filter(
                (promotion) =>
                  promotion.targetType === 'all' ||
                  (promotion.targetType === 'category' && promotion.targetId === product.category) ||
                  (promotion.targetType === 'product' && promotion.targetId === product.id)
              )
              .sort((a, b) => {
                const priority = { product: 3, category: 2, all: 1 };
                return priority[b.targetType] - priority[a.targetType];
              });

            const promo = matchingPromos[0];

            return (
              <div
                key={product.id}
                className="relative flex flex-col rounded-2xl border border-border bg-surface p-2.5 shadow-sm transition-shadow hover:shadow-md sm:rounded-xl sm:p-4"
              >
                {promo && (
                  <div className="absolute left-2 top-2 z-10 sm:left-4 sm:top-4">
                    <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-800 shadow-sm">
                      {promo.type === 'volume' ? `${promo.buyQuantity}x${promo.payQuantity}` : `${promo.value}% OFF`}
                    </span>
                  </div>
                )}

                <div className="mb-3 aspect-[4/3] w-full overflow-hidden rounded-xl bg-bg sm:mb-4 sm:h-[140px] sm:aspect-auto sm:rounded-lg">
                  <img
                    src={product.imageUrl || `https://picsum.photos/seed/${product.id}/400/400`}
                    alt={product.name}
                    className="h-full w-full object-cover mix-blend-multiply"
                    referrerPolicy="no-referrer"
                  />
                </div>

                <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-muted sm:text-[11px]">
                  SKU: {product.sku}
                </div>

                <div className="mb-2 min-h-[2.6rem] text-[13px] font-semibold leading-tight text-ink sm:min-h-0 sm:text-[15px]">
                  {product.name}
                </div>

                <div className="mt-auto pr-11 text-[17px] font-bold text-primary sm:pr-12 sm:text-[18px]">
                  ${(product.offerPrice || product.price).toFixed(2)}
                </div>

                <button
                  onClick={() => addItem(product, 1)}
                  className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-blue-700 sm:bottom-4 sm:right-4 sm:h-8 sm:w-8"
                  title="Agregar al pedido"
                >
                  <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                </button>

                {inCart > 0 && (
                  <span className="absolute right-2 top-2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase text-white sm:right-4 sm:top-4 sm:px-2 sm:py-1 sm:text-[10px]">
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
