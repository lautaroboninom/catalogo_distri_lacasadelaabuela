import { useEffect, useState } from 'react';
import { useAuthState } from '../hooks/useAuthState';
import { db, storage, Product, Promotion, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, updateDoc, doc, addDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Settings, Save, Plus, TrendingUp, Tag, Package, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function AdminPage() {
  const { user, isAdmin, loading } = useAuthState();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'inventory' | 'promotions' | 'inflation'>('inventory');

  const [products, setProducts] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Product>>({});
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [uploadingImageFor, setUploadingImageFor] = useState<string | null>(null);

  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [inflationPercentage, setInflationPercentage] = useState<number>(0);

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
    setSelectedImage(null);
  };

  const handleSave = async (id: string) => {
    try {
      await updateDoc(doc(db, 'products', id), editForm);
      setEditingId(null);
      setSelectedImage(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `products/${id}`);
    }
  };

  const handleUploadImage = async (product: Product) => {
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
      setSelectedImage(null);
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
    <div className="flex-1 p-4 md:p-8 overflow-y-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl md:text-3xl font-bold text-ink flex items-center gap-3">
          <Settings className="w-8 h-8 text-ink-muted" />
          Administración
        </h1>
        <div className="flex bg-surface rounded-lg p-1 border border-border">
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'inventory' ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Package className="w-4 h-4" /> Inventario
          </button>
          <button
            onClick={() => setActiveTab('promotions')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'promotions' ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <Tag className="w-4 h-4" /> Promociones
          </button>
          <button
            onClick={() => setActiveTab('inflation')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'inflation' ? 'bg-primary text-white' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <TrendingUp className="w-4 h-4" /> Inflación
          </button>
        </div>
      </div>

      {activeTab === 'inventory' && (
        <div className="bg-surface rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border flex justify-end">
            <button
              onClick={handleAddDemoProduct}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Importar Catálogo Completo
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-bg text-ink-muted border-b border-border font-semibold">
                <tr>
                  <th className="px-6 py-4">Producto</th>
                  <th className="px-6 py-4">Categoría</th>
                  <th className="px-6 py-4">Costo</th>
                  <th className="px-6 py-4">Precio venta</th>
                  <th className="px-6 py-4">Stock</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-bg transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-ink">{product.name}</div>
                      <div className="text-[11px] text-ink-muted">SKU: {product.sku}</div>
                    </td>
                    <td className="px-6 py-4 text-ink">{product.category}</td>

                    {editingId === product.id ? (
                      <>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            value={editForm.cost || 0}
                            onChange={(e) => setEditForm({ ...editForm, cost: Number(e.target.value) })}
                            className="w-24 px-2 py-1 border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            value={editForm.price || 0}
                            onChange={(e) => setEditForm({ ...editForm, price: Number(e.target.value) })}
                            className="w-24 px-2 py-1 border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            value={editForm.stock || 0}
                            onChange={(e) => setEditForm({ ...editForm, stock: Number(e.target.value) })}
                            className="w-20 px-2 py-1 border border-border rounded outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                          />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <label className="text-xs text-ink-muted cursor-pointer border border-border rounded px-2 py-1 hover:bg-neutral-100">
                              Imagen
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => setSelectedImage(e.target.files?.[0] || null)}
                              />
                            </label>
                            <button
                              disabled={!selectedImage || uploadingImageFor === product.id}
                              onClick={() => handleUploadImage(product)}
                              className="text-primary hover:text-blue-700 border border-border px-2 py-1 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                              title="Subir imagen"
                            >
                              {uploadingImageFor === product.id ? 'Subiendo...' : 'Subir'}
                            </button>
                            <button
                              onClick={() => handleSave(product.id)}
                              className="text-primary hover:text-blue-700 bg-accent p-2 rounded-lg inline-flex items-center transition-colors"
                              title="Guardar cambios"
                            >
                              <Save className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 text-ink-muted">${product.cost?.toFixed(2)}</td>
                        <td className="px-6 py-4 text-ink font-medium">${product.price?.toFixed(2)}</td>
                        <td className="px-6 py-4 text-ink-muted">{product.stock}</td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => handleEdit(product)} className="text-primary hover:underline font-medium">
                            Editar
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-ink-muted">
                      No hay productos. Usá "Importar Catálogo" para crear la base de datos de productos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'promotions' && (
        <div className="bg-surface rounded-xl border border-border shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold text-ink">Reglas de promoción</h2>
            <button
              onClick={handleCreateDemoPromotion}
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" /> Promo default
            </button>
          </div>
          <div className="grid gap-4">
            {promotions.map((promo) => (
              <div key={promo.id} className="p-4 border border-border rounded-lg flex justify-between items-center bg-bg">
                <div>
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
        <div className="bg-surface rounded-xl border border-border shadow-sm p-6 max-w-md">
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
