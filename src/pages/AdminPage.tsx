import { useEffect, useState } from 'react';
import { useAuthState } from '../hooks/useAuthState';
import { db, storage, Product, Promotion, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, updateDoc, doc, addDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Settings, Save, Plus, TrendingUp, Tag, Package, Trash2, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PRODUCT_CATEGORIES } from '../data/productCategories';

export default function AdminPage() {
  const { user, isAdmin, loading } = useAuthState();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'inventory' | 'promotions' | 'inflation'>('inventory');

  const [products, setProducts] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [productSearch, setProductSearch] = useState('');
  const [selectedImages, setSelectedImages] = useState<Record<string, File | null>>({});
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null);

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [inflationPercentage, setInflationPercentage] = useState<number>(0);
  const categoryOptions = Array.from(
    new Set([
      ...PRODUCT_CATEGORIES.filter((category) => category !== 'Todas'),
      ...products.map((product) => product.category).filter(Boolean),
      editForm.category || '',
    ])
  ).filter(Boolean);
  const fieldClass =
    'w-full rounded-lg border border-border px-3 py-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary';
  const formatCurrency = (value?: number) => `$${Number(value ?? 0).toFixed(2)}`;
  const normalizedProductSearch = productSearch.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    if (!normalizedProductSearch) return true;

    return (
      product.name.toLowerCase().includes(normalizedProductSearch) ||
      product.sku.toLowerCase().includes(normalizedProductSearch) ||
      product.category.toLowerCase().includes(normalizedProductSearch)
    );
  });

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      navigate('/');
    }
  }, [user, isAdmin, loading, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      const prods: Product[] = [];
      snapshot.forEach((d) => {
        prods.push({ id: d.id, ...d.data() } as Product);
      });
      setProducts(prods);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'products'));

    const unsubPromos = onSnapshot(collection(db, 'promotions'), (snapshot) => {
      const promos: Promotion[] = [];
      snapshot.forEach((d) => {
        promos.push({ id: d.id, ...d.data() } as Promotion);
      });
      setPromotions(promos);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'promotions'));

    return () => {
      unsubProducts();
      unsubPromos();
    };
  }, [isAdmin]);

  const makeSafePathSegment = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item';

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setEditForm(product);
  };

  const handleSave = async (id: string) => {
    try {
      await updateDoc(doc(db, 'products', id), editForm);
      setEditingId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${id}`);
    }
  };

  const handleUploadImage = async (product: Product) => {
    const selectedImage = selectedImages[product.id] || null;
    if (!selectedImage) return;
    if (!selectedImage.type.startsWith('image/')) {
      alert('El archivo seleccionado no es una imagen.');
      return;
    }

    try {
      setUploadingImageFor(product.id);
      const extFromType = selectedImage.type.split('/')[1] || 'jpg';
      const skuSafe = makeSafePathSegment(product.sku || product.id);
      const storagePath = `products/${skuSafe}-${Date.now()}.${extFromType}`;

      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, selectedImage, { contentType: selectedImage.type });
      const imageUrl = await getDownloadURL(fileRef);

      await updateDoc(doc(db, 'products', product.id), {
        imageUrl,
        imageSourceType: 'admin_upload',
        imageSourceUrl: 'admin:upload',
        imageUpdatedAt: new Date().toISOString(),
      });

      setEditForm((prev) => ({ ...prev, imageUrl }));
      setSelectedImages((prev) => ({ ...prev, [product.id]: null }));
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${product.id}`);
    } finally {
      setUploadingImageFor(null);
    }
  };

  const handleApplyInflation = async () => {
    if (inflationPercentage === 0) return;
    const confirmInflation = confirm(`¿Estás seguro de ajustar TODOS los precios en un ${inflationPercentage}%?`);
    if (!confirmInflation) return;

    try {
      const chunkSize = 20;
      for (let i = 0; i < products.length; i += chunkSize) {
        const chunk = products.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map((prod) => {
            const newPrice = prod.price * (1 + inflationPercentage / 100);
            return updateDoc(doc(db, 'products', prod.id), { price: Math.round(newPrice * 100) / 100 });
          })
        );
      }
      alert('Ajuste de inflación aplicado correctamente.');
      setInflationPercentage(0);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'products');
    }
  };

  const handleCreateDemoPromotion = async () => {
    try {
      const p: Omit<Promotion, 'id'> = {
        name: 'Promo 3x2 en Bebidas',
        type: 'volume',
        targetType: 'category',
        targetId: 'Bebidas',
        buyQuantity: 3,
        payQuantity: 2,
      };
      await addDoc(collection(db, 'promotions'), p);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'promotions');
    }
  };

  const handleDeletePromotion = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'promotions', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `promotions/${id}`);
    }
  };

  const handleAddDemoProduct = async () => {
    try {
      const response = await fetch('/products.json');
      if (!response.ok) {
        throw new Error(`No se pudo cargar products.json (${response.status})`);
      }
      const allProducts = await response.json();

      const confirmSeed = confirm(
        `¿Estás seguro de que deseas agregar ${allProducts.length} productos a la base de datos?\nEste proceso puede tomar unos segundos.`
      );
      if (!confirmSeed) return;

      const chunkSize = 20;
      for (let i = 0; i < allProducts.length; i += chunkSize) {
        const chunk = allProducts.slice(i, i + chunkSize);
        await Promise.all(chunk.map((prod: any) => addDoc(collection(db, 'products'), prod)));
      }

      alert(`¡Se agregaron ${allProducts.length} productos con éxito!`);
    } catch {
      alert('No se pudo importar el catálogo. Revisá permisos de admin y que exista /products.json.');
    }
  };

  if (loading) return <div className="p-8 text-center text-ink-muted">Cargando perfil...</div>;
  if (!isAdmin) return null;

  return (
    <div className="flex-1 w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-ink flex items-center gap-3">
          <Settings className="w-8 h-8 text-ink-muted" />
          Administración
        </h1>
        <div className="w-full sm:w-auto">
          <div className="grid grid-cols-3 gap-1 rounded-xl border border-border bg-surface p-1">
            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-[12px] font-medium transition-colors sm:justify-start sm:gap-2 sm:px-4 sm:py-2 sm:text-sm ${
                activeTab === 'inventory' ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Package className="hidden h-4 w-4 sm:block" /> Inventario
            </button>
            <button
              onClick={() => setActiveTab('promotions')}
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-[12px] font-medium transition-colors sm:justify-start sm:gap-2 sm:px-4 sm:py-2 sm:text-sm ${
                activeTab === 'promotions' ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Tag className="hidden h-4 w-4 sm:block" /> Promociones
            </button>
            <button
              onClick={() => setActiveTab('inflation')}
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2.5 text-[12px] font-medium transition-colors sm:justify-start sm:gap-2 sm:px-4 sm:py-2 sm:text-sm ${
                activeTab === 'inflation' ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <TrendingUp className="hidden h-4 w-4 sm:block" /> Inflación
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'inventory' && (
        <div className="w-full min-w-0 bg-surface rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
          <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-md">
              <h2 className="text-lg font-bold text-ink">Precios y stock</h2>
              <p className="mb-3 text-sm text-ink-muted">
                {filteredProducts.length} de {products.length} productos
              </p>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar por nombre, SKU o categoria..."
                  className="w-full rounded-lg border border-border bg-white py-2.5 pl-10 pr-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </label>
            </div>
            <button
              onClick={handleAddDemoProduct}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors whitespace-nowrap hover:bg-blue-700 sm:w-auto"
            >
              <Plus className="w-4 h-4" /> Importar Catálogo Completo
            </button>
          </div>
          <div className="divide-y divide-border md:hidden">
            {filteredProducts.map((product) => {
              const isEditing = editingId === product.id;
              const selectedImageName = selectedImages[product.id]?.name;

              return (
                <article key={product.id} className="space-y-4 p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl border border-border bg-bg">
                      <img
                        src={product.imageUrl || `https://picsum.photos/seed/${product.id}/120/120`}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold leading-tight text-ink">{product.name}</div>
                      <div className="mt-1 text-[11px] text-ink-muted">SKU: {product.sku}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-bg px-2.5 py-1 text-[11px] font-medium text-ink-muted">
                          {product.category}
                        </span>
                        <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary">
                          Venta {formatCurrency(product.price)}
                        </span>
                        <span className="rounded-full bg-bg px-2.5 py-1 text-[11px] font-medium text-ink-muted">
                          Stock {product.stock}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-bg/70 p-3">
                    <div className="flex items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-neutral-100">
                        Elegir imagen
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) =>
                            setSelectedImages((prev) => ({
                              ...prev,
                              [product.id]: e.target.files?.[0] || null,
                            }))
                          }
                        />
                      </label>
                      <button
                        disabled={!selectedImages[product.id] || uploadingImageFor === product.id}
                        onClick={() => handleUploadImage(product)}
                        className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {uploadingImageFor === product.id ? 'Subiendo...' : 'Subir'}
                      </button>
                    </div>
                    <div className="mt-2 truncate text-[11px] text-ink-muted">
                      {selectedImageName ? `Seleccionada: ${selectedImageName}` : 'Sin imagen nueva seleccionada'}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          Categoría
                        </label>
                        <select
                          value={editForm.category || ''}
                          onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                          className={fieldClass}
                        >
                          {categoryOptions.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                            Costo
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={editForm.cost || 0}
                            onChange={(e) => setEditForm({ ...editForm, cost: Number(e.target.value) })}
                            className={fieldClass}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                            Precio venta
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={editForm.price || 0}
                            onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                            className={fieldClass}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
                          Stock
                        </label>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={editForm.stock || 0}
                          onChange={(e) => setEditForm({ ...editForm, stock: Number(e.target.value) })}
                          className={fieldClass}
                        />
                      </div>

                      <button
                        onClick={() => handleSave(product.id)}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                      >
                        <Save className="h-4 w-4" />
                        Guardar cambios
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-border bg-bg px-3 py-2.5">
                          <div className="text-[11px] uppercase tracking-wide text-ink-muted">Costo</div>
                          <div className="mt-1 text-sm font-semibold text-ink">{formatCurrency(product.cost)}</div>
                        </div>
                        <div className="rounded-xl border border-border bg-bg px-3 py-2.5">
                          <div className="text-[11px] uppercase tracking-wide text-ink-muted">Precio venta</div>
                          <div className="mt-1 text-sm font-semibold text-primary">{formatCurrency(product.price)}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleEdit(product)}
                        className="inline-flex w-full items-center justify-center rounded-lg border border-border px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-bg"
                      >
                        Editar producto
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="px-6 py-8 text-center text-ink-muted">
                {products.length === 0
                  ? 'No hay productos. Usá "Importar Catálogo" para crear la base de datos de productos.'
                  : 'No hay productos que coincidan con la búsqueda.'}
              </div>
            )}
          </div>

          <div className="hidden w-full overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-left text-sm table-auto">
              <thead className="bg-bg text-ink-muted border-b border-border font-semibold">
                <tr>
                  <th className="px-6 py-4 min-w-[260px]">Producto</th>
                  <th className="px-6 py-4 min-w-[180px]">Imagen</th>
                  <th className="px-6 py-4 whitespace-nowrap">Categoría</th>
                  <th className="px-6 py-4 whitespace-nowrap">Costo</th>
                  <th className="px-6 py-4 whitespace-nowrap">Precio venta</th>
                  <th className="px-6 py-4 whitespace-nowrap">Stock</th>
                  <th className="px-6 py-4 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.map((product) => {
                  const isEditing = editingId === product.id;
                  const selectedImageName = selectedImages[product.id]?.name;

                  return (
                    <tr key={product.id} className="hover:bg-bg transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-ink break-words">{product.name}</div>
                        <div className="text-[11px] text-ink-muted">SKU: {product.sku}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-12 rounded-md overflow-hidden border border-border bg-bg flex-shrink-0">
                            <img
                              src={product.imageUrl || `https://picsum.photos/seed/${product.id}/120/120`}
                              alt={product.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex min-w-0 flex-col gap-1">
                            <label className="text-xs text-ink-muted cursor-pointer border border-border rounded px-2 py-1 hover:bg-neutral-100 w-fit">
                              Elegir
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) =>
                                  setSelectedImages((prev) => ({
                                    ...prev,
                                    [product.id]: e.target.files?.[0] || null,
                                  }))
                                }
                              />
                            </label>
                            <button
                              disabled={!selectedImages[product.id] || uploadingImageFor === product.id}
                              onClick={() => handleUploadImage(product)}
                              className="text-primary hover:text-blue-700 border border-border px-2 py-1 rounded-lg text-xs text-left whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {uploadingImageFor === product.id ? 'Subiendo...' : 'Subir'}
                            </button>
                            <span className="max-w-[180px] truncate text-[11px] text-ink-muted">
                              {selectedImageName || 'Sin selección'}
                            </span>
                          </div>
                        </div>
                      </td>
                      {isEditing ? (
                        <>
                          <td className="px-6 py-4">
                            <select
                              value={editForm.category || ''}
                              onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                              className="min-w-[180px] rounded border border-border px-2 py-1 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            >
                              {categoryOptions.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="number"
                              inputMode="decimal"
                              value={editForm.cost || 0}
                              onChange={(e) => setEditForm({ ...editForm, cost: Number(e.target.value) })}
                              className="w-24 px-2 py-1 border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="number"
                              inputMode="decimal"
                              value={editForm.price || 0}
                              onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                              className="w-24 px-2 py-1 border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            />
                          </td>
                          <td className="px-6 py-4">
                            <input
                              type="number"
                              inputMode="numeric"
                              value={editForm.stock || 0}
                              onChange={(e) => setEditForm({ ...editForm, stock: Number(e.target.value) })}
                              className="w-20 px-2 py-1 border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                            />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleSave(product.id)}
                              className="text-primary hover:text-blue-700 bg-accent p-2 rounded-lg inline-flex items-center transition-colors"
                              title="Guardar cambios"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 text-ink">{product.category}</td>
                          <td className="px-6 py-4 text-ink-muted">{formatCurrency(product.cost)}</td>
                          <td className="px-6 py-4 text-ink font-medium">{formatCurrency(product.price)}</td>
                          <td className="px-6 py-4 text-ink-muted">{product.stock}</td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => handleEdit(product)} className="text-primary hover:underline font-medium">
                              Editar
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-ink-muted">
                      {products.length === 0
                        ? 'No hay productos. Usá "Importar Catálogo" para crear la base de datos de productos.'
                        : 'No hay productos que coincidan con la búsqueda.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'promotions' && (
        <div className="bg-surface rounded-xl border border-border shadow-sm p-4 sm:p-6">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-bold text-ink">Reglas de promoción</h2>
            <button
              onClick={handleCreateDemoPromotion}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:w-auto"
            >
              <Plus className="w-4 h-4" /> Promo default
            </button>
          </div>
          <div className="grid gap-4">
            {promotions.map((promo) => (
              <div key={promo.id} className="flex flex-col gap-4 rounded-lg border border-border bg-bg p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink">{promo.name}</h3>
                  <p className="text-sm text-ink-muted">
                    Tipo: {promo.type} - Aplica a: {promo.targetType} {promo.targetId ? `(${promo.targetId})` : ''}
                  </p>
                  <p className="text-sm font-medium text-emerald-600">
                    {promo.type === 'volume' ? `Llevá ${promo.buyQuantity} pagá ${promo.payQuantity}` : `${promo.value}% OFF`}
                  </p>
                </div>
                <button
                  onClick={() => handleDeletePromotion(promo.id)}
                  className="text-red-500 hover:text-red-700 p-2 border border-red-100 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
            {promotions.length === 0 && (
              <p className="text-ink-muted flex items-center justify-center p-8 border border-dashed border-border rounded-lg">
                No hay promociones configuradas
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'inflation' && (
        <div className="max-w-md rounded-xl border border-border bg-surface p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-bold text-ink mb-2">Ajuste por inflación</h2>
          <p className="text-sm text-ink-muted mb-6">
            Ajusta el precio de venta de TODOS los productos en un porcentaje específico. Ejemplo: 5 para aumentar 5%.
          </p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-ink mb-1">Porcentaje</label>
              <div className="relative">
                <input
                  type="number"
                  inputMode="decimal"
                  value={inflationPercentage}
                  onChange={(e) => setInflationPercentage(Number(e.target.value))}
                  className="w-full pl-4 pr-8 py-2 border border-border rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium text-ink"
                  placeholder="0.00"
                  step="0.1"
                />
                <span className="absolute right-3 top-2.5 text-ink-muted">%</span>
              </div>
            </div>

            <button
              onClick={handleApplyInflation}
              disabled={inflationPercentage === 0}
              className="mt-4 flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TrendingUp className="w-4 h-4" /> Aplicar ajuste global
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
