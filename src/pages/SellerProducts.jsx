
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../config/firebase';
import './SellerProducts.css';
import {
  Search,
  Grid,
  Plus,
  AlertTriangle,
  RefreshCw,
  Edit,
  Eye,
  X,
  User,
  ShoppingBag,
  Package,
  DollarSign,
  ChevronRight,
  Filter,
  Layers,
  Hash,
  Calendar,
  CheckCircle,
  AlertCircle,
  Palette,
  ShoppingCart,
  Truck
} from 'lucide-react';

const SellerProducts = React.memo(() => {
  const [products, setProducts] = useState([]);
  const [sellerDoc, setSellerDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [sellerUid, setSellerUid] = useState(null);
  const [isUpdatingDetails, setIsUpdatingDetails] = useState(false);
  const [updateError, setUpdateError] = useState(null);
  const [sellerStats, setSellerStats] = useState({
    totalProducts: 0,
    totalStock: 0,
    totalValue: 0,
    averagePrice: 0,
    totalSold: 0,
    totalRevenue: 0
  });
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [message, setMessage] = useState('');
  const [recentSales, setRecentSales] = useState([]);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseData, setPurchaseData] = useState({
    productId: '',
    productName: '',
    quantity: 1,
    customerName: '',
    customerPhone: '',
    paymentMethod: 'cash',
    notes: ''
  });

  const navigate = useNavigate();

  const productIdFromPath = useMemo(() => {
    try {
      const match = window.location.pathname.match(/\/products\/([^/]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      setSellerUid(user ? user.uid : null);
    });
    return unsubscribe;
  }, []);

  const mergeUniqueById = (arr1 = [], arr2 = []) => {
    const map = new Map();
    arr1.concat(arr2).forEach(item => {
      if (!item) return;
      map.set(item.id, item);
    });
    return Array.from(map.values());
  };

  const buildOwnerIdSet = useCallback((sellerData, uid) => {
    const s = new Set();
    if (uid) s.add(uid);
    if (!sellerData) return s;
    if (sellerData.id) s.add(sellerData.id);
    if (sellerData.sellerid) s.add(sellerData.sellerid);
    if (sellerData.sellerID) s.add(sellerData.sellerID);
    if (sellerData.sellerId) s.add(sellerData.sellerId);
    return s;
  }, []);

  const calculateSellerStats = useCallback((productsList) => {
    if (productsList.length === 0) {
      setSellerStats(prev => ({
        ...prev,
        totalProducts: 0,
        totalStock: 0,
        totalValue: 0,
        averagePrice: 0
      }));
      return;
    }

    let totalStock = 0;
    let totalValue = 0;
    let priceSum = 0;
    let priceCount = 0;

    productsList.forEach(product => {
      const stock = product.stockQuantity || product.stock || 0;
      let price = Number(product.price) || 0;

      // Use variant price if main price is 0
      if (price === 0 && product.variants && product.variants.length > 0) {
        price = Number(product.variants[0].offerPrice || product.variants[0].price) || 0;
      }

      totalStock += stock;
      totalValue += stock * price;

      if (price > 0) {
        priceSum += price;
        priceCount++;
      }
    });

    setSellerStats(prev => ({
      ...prev,
      totalProducts: productsList.length,
      totalStock: totalStock,
      totalValue: Math.round(totalValue),
      averagePrice: priceCount > 0 ? Math.round(priceSum / priceCount) : 0
    }));
  }, []);

  // Fetch recent sales
  const fetchRecentSales = useCallback(async () => {
    if (!sellerUid) return;

    try {
      const salesQuery = query(
        collection(db, 'sales'),
        where('sellerId', '==', sellerUid)
      );
      const salesSnap = await getDocs(salesQuery);
      const salesData = salesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      setRecentSales(salesData.slice(0, 5)); // Get last 5 sales

      // Calculate total sold and revenue from ALL sales, not just recent ones
      const totalSold = salesData.reduce((sum, sale) => sum + (sale.quantity || 0), 0);
      const totalRevenue = salesData.reduce((sum, sale) => sum + (sale.totalAmount || 0), 0);

      setSellerStats(prev => ({
        ...prev,
        totalSold,
        totalRevenue
      }));
    } catch (err) {
      console.error('Error fetching sales:', err);
    }
  }, [sellerUid]);

  const fetchProducts = useCallback(async (isRefresh = false) => {
    if (isInitialLoad || isRefresh) {
      setLoading(true);
      if (isRefresh) {
        setError(null);
      }
      if (isInitialLoad || isRefresh) {
        setProducts([]);
      }
    }

    let sellerData = null;
    try {
      if (sellerUid) {
        const sellerRef = doc(db, 'sellers', sellerUid);
        const sSnap = await getDoc(sellerRef);
        if (sSnap.exists()) {
          sellerData = { id: sSnap.id, ...sSnap.data() };
          setSellerDoc(sellerData);
        } else {
          setSellerDoc(null);
        }
      } else {
        setSellerDoc(null);
      }
    } catch (err) {
      console.warn('Failed fetching seller doc:', err);
      setSellerDoc(null);
    }

    const ownerIdSet = buildOwnerIdSet(sellerData, sellerUid);

    if (productIdFromPath) {
      try {
        const pRef = doc(db, 'products', productIdFromPath);
        const pSnap = await getDoc(pRef);
        if (pSnap.exists()) {
          const p = { id: pSnap.id, ...pSnap.data() };
          const ownerMatches = (
            (p.sellerid && ownerIdSet.has(p.sellerid)) ||
            (p.sellerID && ownerIdSet.has(p.sellerID)) ||
            (p.sellerId && ownerIdSet.has(p.sellerId)) ||
            ownerIdSet.has(p.seller) ||
            ownerIdSet.has(p.owner)
          );
          if (ownerMatches || ownerIdSet.size === 0) {
            setProducts([p]);
            calculateSellerStats([p]);
            setError(null);
          } else {
            setProducts([]);
            setError('You are not authorized to view this product.');
          }
        } else {
          setProducts([]);
          setError('Product not found.');
        }
      } catch (err) {
        console.error('Error fetching single product:', err);
        setError('Failed to fetch product.');
      } finally {
        setLoading(false);
        setIsInitialLoad(false);
      }
      return;
    }

    try {
      if (!sellerUid && ownerIdSet.size === 0) {
        if (products.length === 0 && !isInitialLoad && !isRefresh) {
          setError('No seller signed in.');
        } else if (isInitialLoad || isRefresh) {
          setError(null);
        }
        setLoading(false);
        setIsInitialLoad(false);
        return;
      }

      let resultsA = [];
      try {
        const qA = query(
          collection(db, 'products'),
          where('sellerid', '==', sellerUid || '')
        );
        const snapA = await getDocs(qA);
        resultsA = snapA.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (err) {
        console.warn('Query sellerid failed:', err);
      }

      let resultsB = [];
      try {
        const qB = query(
          collection(db, 'products'),
          where('sellerID', '==', sellerUid || '')
        );
        const snapB = await getDocs(qB);
        resultsB = snapB.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch (err) {
        console.warn('Query sellerID failed:', err);
      }

      let resultsC = [];
      try {
        if (sellerData && sellerData.id && sellerData.id !== sellerUid) {
          const qC1 = query(
            collection(db, 'products'),
            where('sellerid', '==', sellerData.id)
          );
          const snapC1 = await getDocs(qC1);
          resultsC = resultsC.concat(snapC1.docs.map(d => ({ id: d.id, ...d.data() })));

          const qC2 = query(
            collection(db, 'products'),
            where('sellerID', '==', sellerData.id)
          );
          const snapC2 = await getDocs(qC2);
          resultsC = resultsC.concat(snapC2.docs.map(d => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.warn('Query using sellerData.id failed:', err);
      }

      const mergedServer = mergeUniqueById(resultsA, resultsB);
      const mergedAllServer = mergeUniqueById(mergedServer, resultsC);

      if (mergedAllServer.length > 0) {
        const filtered = mergedAllServer.filter(p => {
          const candidates = [p.sellerid, p.sellerID, p.sellerId, p.seller, p.owner];
          return candidates.some(c => c && ownerIdSet.has(c));
        });
        filtered.sort((a, b) => {
          const A = (a.brand || '').toString().toLowerCase();
          const B = (b.brand || '').toString().toLowerCase();
          return A < B ? -1 : A > B ? 1 : 0;
        });
        if (!isInitialLoad && !isRefresh && products.length > 0) {
          const mergedProducts = mergeUniqueById(products, filtered);
          setProducts(mergedProducts);
          calculateSellerStats(mergedProducts);
        } else {
          setProducts(filtered);
          calculateSellerStats(filtered);
        }

        setLoading(false);
        setIsInitialLoad(false);
        setError(null);
        return;
      }

      try {
        const allSnap = await getDocs(collection(db, 'products'));
        let data = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        data = data.filter(p => {
          const candidates = [p.sellerid, p.sellerID, p.sellerId, p.seller, p.owner];
          return candidates.some(c => c && ownerIdSet.has(c));
        });
        data.sort((a, b) => {
          const A = (a.brand || '').toString().toLowerCase();
          const B = (b.brand || '').toString().toLowerCase();
          return A < B ? -1 : A > B ? 1 : 0;
        });

        if (!isInitialLoad && !isRefresh && products.length > 0) {
          const mergedProducts = mergeUniqueById(products, data);
          setProducts(mergedProducts);
          calculateSellerStats(mergedProducts);
        } else {
          setProducts(data);
          calculateSellerStats(data);
        }

        setLoading(false);
        setIsInitialLoad(false);
        setError(null);
        return;
      } catch (fallbackErr) {
        console.error('Fallback fetch failed:', fallbackErr);
        setError('Failed fetching products (fallback).');
        setLoading(false);
        setIsInitialLoad(false);
        return;
      }
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('Failed to fetch products. Check console for details.');
      setLoading(false);
      setIsInitialLoad(false);
    }
  }, [sellerUid, productIdFromPath, buildOwnerIdSet, calculateSellerStats, products, isInitialLoad]);

  useEffect(() => {
    const handleNewProductAdded = (event) => {
      if (event.detail && event.detail.type === 'NEW_PRODUCT_ADDED') {
        if (event.detail.product) {
          const newProduct = event.detail.product;
          setProducts(prevProducts => {
            const productExists = prevProducts.some(p => p.id === newProduct.id);
            if (!productExists) {
              const updatedProducts = [newProduct, ...prevProducts];
              calculateSellerStats(updatedProducts);

              setMessage('✅ New product added successfully!');
              setTimeout(() => setMessage(''), 3000);

              return updatedProducts;
            }
            return prevProducts;
          });
        }
      }
    };

    window.addEventListener('newProductAdded', handleNewProductAdded);

    return () => {
      window.removeEventListener('newProductAdded', handleNewProductAdded);
    };
  }, [calculateSellerStats]);

  useEffect(() => {
    fetchProducts();
    fetchRecentSales();
  }, [sellerUid, productIdFromPath, fetchProducts, fetchRecentSales]);

  const addNewProductToList = useCallback((newProduct) => {
    if (newProduct) {
      setProducts(prevProducts => {
        const productExists = prevProducts.some(p => p.id === newProduct.id);
        if (!productExists) {
          const updatedProducts = [newProduct, ...prevProducts];
          calculateSellerStats(updatedProducts);
          return updatedProducts;
        }
        return prevProducts;
      });
    }
  }, [calculateSellerStats]);

  const handleUpdateProductDetails = useCallback(async (productId, updatedFields) => {
    setIsUpdatingDetails(true);
    setUpdateError(null);
    try {
      const productRef = doc(db, 'products', productId);

      const payload = {
        ...updatedFields,
        price: Number(updatedFields.price) || 0,
        offerPrice: Number(updatedFields.offerPrice) || 0,
        stock: Number(updatedFields.stockQuantity ?? updatedFields.stock) || 0,
        stockQuantity: Number(updatedFields.stockQuantity ?? updatedFields.stock) || 0,
        subCategory: updatedFields.subCategory ?? updatedFields.subcategory ?? updatedFields.subCategory,
        updatedAt: new Date().toISOString(),
      };

      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      await updateDoc(productRef, payload);

      setSelectedProduct(prev => ({ ...prev, ...payload }));
      setProducts(prevProducts => prevProducts.map(p =>
        p.id === productId ? { ...p, ...payload } : p
      ));

      calculateSellerStats(products.map(p =>
        p.id === productId ? { ...p, ...payload } : p
      ));

      alert('Product details updated successfully!');
    } catch (err) {
      console.error('Failed to update product details:', err);
      setUpdateError('Failed to update product details. Check console.');
      throw new Error('Update failed');
    } finally {
      setIsUpdatingDetails(false);
    }
  }, [products, calculateSellerStats]);

  // NEW: Handle complete purchase with customer details
  const handleCompletePurchase = useCallback(async () => {
    if (!purchaseData.productId || purchaseData.quantity <= 0) {
      setUpdateError('Please enter valid purchase details.');
      return;
    }

    if (!purchaseData.customerName.trim()) {
      setUpdateError('Please enter customer name.');
      return;
    }

    setIsUpdatingDetails(true);
    setUpdateError(null);

    try {
      // 1. Get current product details
      const productRef = doc(db, 'products', purchaseData.productId);
      const productSnap = await getDoc(productRef);

      if (!productSnap.exists()) {
        throw new Error('Product not found in database.');
      }

      const currentProduct = { id: productSnap.id, ...productSnap.data() };
      const variants = currentProduct.variants || [];
      let updatedVariants = [...variants];
      let updatedMainStock = Number(currentProduct.stockQuantity ?? currentProduct.stock) || 0;
      let remainingQuantity = purchaseData.quantity;

      // Calculate product price
      let productPrice = Number(currentProduct.price) || 0;
      let productOfferPrice = Number(currentProduct.offerPrice) || 0;
      const finalPrice = productOfferPrice > 0 && productOfferPrice < productPrice ? productOfferPrice : productPrice;

      // 2. Deduct stock (similar logic as before)
      if (variants.length > 0) {
        updatedVariants = variants.map(variant => {
          if (remainingQuantity <= 0) return variant;

          const variantStock = Number(variant.stock) || 0;
          if (variantStock > 0) {
            const deductFromVariant = Math.min(remainingQuantity, variantStock);
            variant.stock = variantStock - deductFromVariant;
            remainingQuantity -= deductFromVariant;
          }
          return variant;
        });

        if (remainingQuantity > 0) {
          if (updatedMainStock >= remainingQuantity) {
            updatedMainStock -= remainingQuantity;
            remainingQuantity = 0;
          } else {
            throw new Error(`Insufficient total stock. Only ${(variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0) + updatedMainStock)} units available.`);
          }
        }
      } else {
        if (updatedMainStock >= remainingQuantity) {
          updatedMainStock -= remainingQuantity;
        } else {
          throw new Error(`Insufficient stock. Only ${updatedMainStock} units available.`);
        }
      }

      // 3. Update product stock in Firestore
      const payload = {
        stock: updatedMainStock,
        stockQuantity: updatedMainStock,
        updatedAt: new Date().toISOString(),
      };

      if (variants.length > 0) {
        payload.variants = updatedVariants;
      }

      await updateDoc(productRef, payload);

      // 4. Create sale record in 'sales' collection
      const saleRecord = {
        productId: purchaseData.productId,
        productName: purchaseData.productName || currentProduct.name || currentProduct.brand,
        sellerId: sellerUid,
        sellerName: sellerDoc?.sellerName || sellerDoc?.name || 'Seller',
        quantity: purchaseData.quantity,
        unitPrice: finalPrice,
        totalAmount: finalPrice * purchaseData.quantity,
        customerName: purchaseData.customerName.trim(),
        customerPhone: purchaseData.customerPhone.trim() || 'N/A',
        paymentMethod: purchaseData.paymentMethod,
        notes: purchaseData.notes.trim() || '',
        status: 'completed',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await addDoc(collection(db, 'sales'), saleRecord);

      // 5. Update local state
      const updatedProduct = {
        ...currentProduct,
        ...payload,
        variants: updatedVariants.length > 0 ? updatedVariants : currentProduct.variants
      };

      if (selectedProduct && selectedProduct.id === purchaseData.productId) {
        setSelectedProduct(updatedProduct);
      }

      setProducts(prevProducts => {
        const updatedProductsList = prevProducts.map(p =>
          p.id === purchaseData.productId ? updatedProduct : p
        );
        calculateSellerStats(updatedProductsList);
        return updatedProductsList;
      });

      // 6. Fetch updated sales
      await fetchRecentSales();

      // 7. Show success message
      setMessage(`✅ Sale recorded successfully! ${purchaseData.quantity} unit(s) of ${purchaseData.productName} sold to ${purchaseData.customerName}. Total: ₹${(finalPrice * purchaseData.quantity).toLocaleString()}`);
      setTimeout(() => setMessage(''), 5000);

      // 8. Reset and close
      setPurchaseData({
        productId: '',
        productName: '',
        quantity: 1,
        customerName: '',
        customerPhone: '',
        paymentMethod: 'cash',
        notes: ''
      });
      setShowPurchaseModal(false);

    } catch (err) {
      console.error('Failed to complete purchase:', err);
      setUpdateError(err.message || 'Failed to complete purchase. Check console.');
    } finally {
      setIsUpdatingDetails(false);
    }
  }, [purchaseData, sellerUid, sellerDoc, selectedProduct, products, calculateSellerStats, fetchRecentSales]);

  const handleOpenPurchaseModal = useCallback((product) => {
    const productName = product.name || product.brand || 'Product';
    const productPrice = Number(product.price) || 0;
    const productOfferPrice = Number(product.offerPrice) || 0;
    const finalPrice = productOfferPrice > 0 && productOfferPrice < productPrice ? productOfferPrice : productPrice;

    setPurchaseData({
      productId: product.id,
      productName: productName,
      quantity: 1,
      customerName: '',
      customerPhone: '',
      paymentMethod: 'cash',
      notes: '',
      unitPrice: finalPrice
    });
    setShowPurchaseModal(true);
    setUpdateError(null);
  }, []);

  const filteredProducts = useMemo(() => {
    const searchLower = searchTerm.toLowerCase();
    return products.filter(product => {
      const brandMatch = product.brand ? product.brand.toLowerCase().includes(searchLower) : false;
      const descriptionMatch = product.description ? product.description.toLowerCase().includes(searchLower) : false;
      const skuMatch = product.basesku || product.sku ? (product.basesku || product.sku).toLowerCase().includes(searchLower) : false;
      const productNameMatch = product.name ? product.name.toLowerCase().includes(searchLower) : false;
      const searchKeywordsMatch = product.searchKeywords ? (product.searchKeywords.join(' ').toLowerCase()).includes(searchLower) : false;
      const sellerIdMatch = product.sellerId ? product.sellerId.toLowerCase().includes(searchLower) : false;

      const matchesSearch = brandMatch || descriptionMatch || skuMatch || productNameMatch || searchKeywordsMatch || sellerIdMatch;

      let categoryMatch = false;
      if (filterCategory === 'all') {
        categoryMatch = true;
      } else {
        const category = product.category ?
          (typeof product.category === 'object' ? product.category.name : product.category) :
          '';
        categoryMatch = category === filterCategory;
      }

      return matchesSearch && categoryMatch;
    });
  }, [products, searchTerm, filterCategory]);

  const categories = useMemo(() => {
    const categorySet = new Set();
    categorySet.add('all');

    products.forEach(product => {
      if (product.category) {
        if (typeof product.category === 'string') {
          categorySet.add(product.category);
        } else if (typeof product.category === 'object' && product.category.name) {
          categorySet.add(product.category.name);
        }
      }
    });

    return Array.from(categorySet);
  }, [products]);

  const handleViewDetails = useCallback((product) => {
    setSelectedProduct(product);
    setUpdateError(null);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setSelectedProduct(null);
    setUpdateError(null);
    setIsUpdatingDetails(false);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchProducts(true);
    fetchRecentSales();
  }, [fetchProducts, fetchRecentSales]);

  if (loading && isInitialLoad) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-6">
        <div className="max-w-7xl mx-auto">
          {/* Header Skeleton */}
          <div className="mb-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-xl animate-pulse"></div>
                <div>
                  <div className="w-48 h-6 bg-gray-200 rounded mb-2 animate-pulse"></div>
                  <div className="w-32 h-4 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
              <div className="flex gap-2">
                <div className="w-32 h-10 bg-gray-200 rounded-lg animate-pulse"></div>
                <div className="w-10 h-10 bg-gray-200 rounded-lg animate-pulse"></div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="w-8 h-8 bg-gray-200 rounded-lg animate-pulse"></div>
                    <div className="w-12 h-6 bg-gray-200 rounded animate-pulse"></div>
                  </div>
                  <div className="w-20 h-4 bg-gray-200 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>

          {/* Products Grid Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="w-full h-40 bg-gray-200 rounded-lg mb-3"></div>
                <div className="space-y-2">
                  <div className="w-3/4 h-4 bg-gray-200 rounded"></div>
                  <div className="w-1/2 h-3 bg-gray-200 rounded"></div>
                  <div className="w-full h-3 bg-gray-200 rounded"></div>
                  <div className="flex gap-2 mt-3">
                    <div className="w-16 h-8 bg-gray-200 rounded"></div>
                    <div className="w-16 h-8 bg-gray-200 rounded"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-3 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4 mb-4 md:mb-6">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="p-2 md:p-3 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl shadow-lg">
                <Package className="w-6 h-6 md:w-8 md:h-8 text-white" />
              </div>
              <div>
                <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900">Seller Dashboard</h1>
                {sellerDoc && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <User className="w-3 h-3 md:w-4 md:h-4 text-blue-600" />
                    <span className="text-xs md:text-sm text-gray-700 font-medium">
                      {sellerDoc.sellerName || sellerDoc.name || 'Seller'} • ID: {sellerUid?.substring(0, 8)}...
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => navigate('/add-products')}
                className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-300 shadow-lg hover:shadow-xl text-sm md:text-base"
              >
                <Plus className="w-4 h-4 md:w-5 md:h-5" />
                <span className="hidden sm:inline">Add Product</span>
              </button>
              <button
                onClick={handleRefresh}
                className="p-2 md:p-2.5 bg-white border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 transition-colors shadow-md"
                title="Refresh list"
              >
                <RefreshCw className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          </div>

          {/* Stats Cards - UPDATED with better formatting */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
            <div className="bg-gradient-to-br from-white to-blue-50 rounded-xl md:rounded-2xl border border-blue-100 p-3 md:p-4 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 md:p-2 bg-blue-100 rounded-lg">
                  <Package className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
                </div>
                <span className="text-lg md:text-2xl font-bold text-gray-900">{sellerStats.totalProducts}</span>
              </div>
              <h3 className="text-xs md:text-sm font-medium text-gray-700">Total Products</h3>
            </div>

            <div className="bg-gradient-to-br from-white to-green-50 rounded-xl md:rounded-2xl border border-green-100 p-3 md:p-4 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 md:p-2 bg-green-100 rounded-lg">
                  <ShoppingBag className="w-4 h-4 md:w-5 md:h-5 text-green-600" />
                </div>
                <span className="text-lg md:text-2xl font-bold text-gray-900">{sellerStats.totalStock.toLocaleString()}</span>
              </div>
              <h3 className="text-xs md:text-sm font-medium text-gray-700">Total Stock</h3>
            </div>

            <div className="bg-gradient-to-br from-white to-purple-50 rounded-xl md:rounded-2xl border border-purple-100 p-3 md:p-4 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 md:p-2 bg-purple-100 rounded-lg">
                  <ShoppingCart className="w-4 h-4 md:w-5 md-h-5 text-purple-600" />
                </div>
                <span className="text-lg md:text-2xl font-bold text-gray-900">{sellerStats.totalSold.toLocaleString()}</span>
              </div>
              <h3 className="text-xs md:text-sm font-medium text-gray-700">Total Sold</h3>
            </div>

            <div className="bg-gradient-to-br from-white to-orange-50 rounded-xl md:rounded-2xl border border-orange-100 p-3 md:p-4 shadow-lg">
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 md:p-2 bg-orange-100 rounded-lg">
                  <DollarSign className="w-4 h-4 md:w-5 md:h-5 text-orange-600" />
                </div>
                <span className="text-lg md:text-2xl font-bold text-gray-900">₹{sellerStats.totalRevenue.toLocaleString()}</span>
              </div>
              <h3 className="text-xs md:text-sm font-medium text-gray-700">Total Revenue</h3>
            </div>
          </div>

          {/* Recent Sales Section */}
          {recentSales.length > 0 && (
            <div className="bg-white rounded-xl md:rounded-2xl border border-gray-200 p-4 md:p-5 shadow-lg mb-4 md:mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 text-base md:text-lg flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-600" />
                  Recent Sales
                </h3>
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <div className="bg-white rounded-xl md:rounded-2xl border border-gray-200 p-4 md:p-5 shadow-lg">
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 md:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by brand, name, SKU, description, or seller ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 md:pl-12 pr-3 md:pr-4 py-2.5 md:py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm md:text-base bg-gray-50/50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-300 rounded-xl px-3 md:px-4 py-2.5 md:py-3">
                  <Filter className="w-4 h-4 md:w-5 md:h-5 text-gray-500" />
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="bg-transparent outline-none text-sm md:text-base text-gray-700"
                  >
                    {categories.map(c => (
                      <option key={c} value={c}>
                        {c === 'all' ? 'All Categories' :
                          typeof c === 'string' ? c.charAt(0).toUpperCase() + c.slice(1) :
                            typeof c === 'object' && c.name ? c.name.charAt(0).toUpperCase() + c.name.slice(1) :
                              String(c)}
                      </option>
                    ))}
                  </select>
                </div>

                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="px-3 md:px-4 py-2.5 md:py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors text-sm md:text-base"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {message && message.startsWith('✅') && (
          <div className="mb-6 bg-gradient-to-r from-green-50 to-green-100 border-l-4 border-green-500 p-4 rounded-r-xl animate-slide-down">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <span className="text-green-700 font-medium">{message}</span>
              <button
                onClick={() => setMessage('')}
                className="ml-auto text-green-600 hover:text-green-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {error && (products.length === 0 || error !== 'No seller signed in.') && (
          <div className="mb-6 bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-500 p-4 rounded-r-xl animate-slide-down">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <span className="text-red-700 font-medium">{error}</span>
              <button
                onClick={handleRefresh}
                className="ml-auto px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {updateError && (
          <div className="mb-6 bg-gradient-to-r from-orange-50 to-orange-100 border-l-4 border-orange-500 p-4 rounded-r-xl animate-slide-down">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0" />
              <span className="text-orange-700 font-medium">{updateError}</span>
              <button
                onClick={() => setUpdateError(null)}
                className="ml-auto text-orange-600 hover:text-orange-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Products Grid */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-xl md:rounded-2xl border-2 border-dashed border-gray-300 p-8 md:p-12 text-center shadow-sm">
            <Grid className="w-12 h-12 md:w-16 md:h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-2">
              {searchTerm ? 'No products found' : 'No products yet'}
            </h3>
            <p className="text-gray-600 mb-6 text-sm md:text-base">
              {searchTerm ? `No products match your search for "${searchTerm}"` : 'Start by adding your first product'}
            </p>
            <button
              onClick={() => searchTerm ? setSearchTerm('') : navigate('/add-products')}
              className="inline-flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-blue-700 transition-all duration-300 shadow-lg hover:shadow-xl"
            >
              {searchTerm ? (
                <>
                  <X className="w-4 h-4 md:w-5 md:h-5" />
                  Clear Search
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 md:w-5 md:h-5" />
                  Add New Product
                </>
              )}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm md:text-base text-gray-600">
                  Showing <span className="font-semibold text-gray-900">{filteredProducts.length}</span> of <span className="font-semibold text-gray-900">{products.length}</span> products
                </p>
                {loading && !isInitialLoad && (
                  <p className="text-xs text-blue-600 mt-1 animate-pulse">
                    Loading new products...
                  </p>
                )}
              </div>
              <p className="text-xs md:text-sm text-gray-500">
                {searchTerm && `Found ${filteredProducts.length} results for "${searchTerm}"`}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {filteredProducts.map((product, i) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  index={i}
                  onViewDetails={handleViewDetails}
                  onSellProduct={handleOpenPurchaseModal}
                />
              ))}
            </div>
          </>
        )}

        {selectedProduct && (
          <ProductDetailsModal
            product={selectedProduct}
            onClose={handleCloseDetails}
            onUpdateDetails={handleUpdateProductDetails}
            isUpdatingDetails={isUpdatingDetails}
            addNewProductToList={addNewProductToList}
            onSellProduct={handleOpenPurchaseModal} 
          />
        )}

        {/* Purchase Modal */}
        {showPurchaseModal && (
          <PurchaseModal
            purchaseData={purchaseData}
            setPurchaseData={setPurchaseData}
            onClose={() => setShowPurchaseModal(false)}
            onCompletePurchase={handleCompletePurchase}
            isUpdating={isUpdatingDetails}
            updateError={updateError}
          />
        )}
      </div>
    </div>
  );
});

const ProductCard = React.memo(({ product, index, onViewDetails, onSellProduct }) => {
  const productName = product.name || product.brand || 'Generic Product';
  const displaySku = product.basesku || product.sku || 'N/A';

  // Calculate total stock from variants if available, otherwise use main stock
  const calculateTotalStock = () => {
    if (product.variants && product.variants.length > 0) {
      return product.variants.reduce((total, variant) => {
        return total + (Number(variant.stock) || 0);
      }, 0);
    }
    return product.stockQuantity || product.stock || 0;
  };

  const stock = calculateTotalStock();
  const stockClass = stock > 10 ? 'bg-green-100 text-green-800 border border-green-200' :
    stock > 0 ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
      'bg-red-100 text-red-800 border border-red-200';

  const category = product.category ?
    (typeof product.category === 'object' ? product.category.name : product.category) :
    'Uncategorized';

  const subCategory = product.subCategory || product.subcategory || 'N/A';
  const displaySubCategory = subCategory && typeof subCategory === 'object' ?
    subCategory.name || subCategory.id || 'N/A' :
    subCategory;

  const imageUrl = product.mainImageUrl || product.image || product.images?.[0]?.url || null;
  const sellerId = product.sellerId || product.sellerID || product.sellerid || 'N/A';
  const productColor = product.color || 'N/A';

  // Get available colors from variants
  const availableColors = useMemo(() => {
    if (product.variants && product.variants.length > 0) {
      const colors = new Set();
      product.variants.forEach(variant => {
        if (variant.color) colors.add(variant.color);
      });
      return Array.from(colors);
    }
    return productColor !== 'N/A' ? [productColor] : [];
  }, [product.variants, productColor]);

  // --- MODIFIED PRICE LOGIC START ---
  let price = Number(product.price) || 0;
  let offerPrice = Number(product.offerPrice) || 0;
  const variants = product.variants || [];

  // If main price is 0, check the first variant for price
  if (price === 0 && variants.length > 0) {
    const firstVariant = variants[0];
    const firstVariantPrice = Number(firstVariant.price) || 0;
    const firstVariantOfferPrice = Number(firstVariant.offerPrice) || 0;

    // Use variant price/offerPrice if it's valid (> 0)
    if (firstVariantPrice > 0) {
      price = firstVariantPrice;
      offerPrice = firstVariantOfferPrice;
    }
  }

  const finalPrice = offerPrice > 0 && offerPrice < price ? offerPrice : price;
  const showDiscount = offerPrice > 0 && offerPrice < price;
  // --- MODIFIED PRICE LOGIC END ---

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 cursor-pointer group animate-fade-in"
      style={{ animationDelay: `${index * 0.05}s` }}
      onClick={() => onViewDetails(product)}
    >
      {/* Product Image */}
      <div className="relative h-40 md:h-48 overflow-hidden bg-gray-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={productName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => { e.currentTarget.src = '/fallback-image.png'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300">
            <Package className="w-12 h-12 text-gray-400" />
          </div>
        )}

        {/* Category Badge */}
        <div className="absolute top-2 left-2">
          <span className="px-2 py-1 bg-black/70 text-white text-xs font-medium rounded-lg backdrop-blur-sm">
            {category}
          </span>
        </div>

        {/* Stock Badge - More prominent */}
        <div className="absolute top-2 right-2">
          <div className={`px-3 py-1.5 text-sm font-medium rounded-lg ${stockClass} shadow-sm`}>
            <span className="font-bold">{stock.toLocaleString()}</span> in stock
          </div>
        </div>
      </div>

      {/* Product Info */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-base md:text-lg truncate" title={productName}>
              {productName}
            </h3>
            <p className="text-sm text-gray-500 mt-1 truncate">{displaySubCategory}</p>
          </div>
          <div className="ml-2">
            <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <Hash className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-600 font-mono" title={displaySku}>
              {displaySku.length > 12 ? `${displaySku.substring(0, 12)}...` : displaySku}
            </span>
          </div>
          {availableColors.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs text-gray-600">
                {availableColors.length} color{availableColors.length > 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Price and Offer Price Display */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 text-xl">
              ₹{finalPrice.toLocaleString()}
            </span>
            {showDiscount && (
              <span className="text-sm line-through text-gray-500">
                ₹{price.toLocaleString()}
              </span>
            )}
          </div>

          {showDiscount && (
            <span className="px-2.5 py-1 bg-gradient-to-r from-green-500 to-green-600 text-white text-sm font-semibold rounded-lg shadow-sm">
              -{Math.round((1 - offerPrice / price) * 100)}%
            </span>
          )}
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              className="px-3 py-2 bg-blue-100 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-200 transition-colors flex items-center gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails(product);
              }}
            >
              <Eye className="w-4 h-4" /> View
            </button>
          </div>
          <div className="flex items-center gap-2">
            {productColor !== 'N/A' && (
              <div className="flex items-center gap-1 text-xs text-gray-500">
                <div
                  className="w-3 h-3 rounded-full border border-gray-300"
                  style={{
                    backgroundColor: productColor.toLowerCase() === 'black' ? '#000' :
                      productColor.toLowerCase() === 'white' ? '#fff' :
                        productColor.toLowerCase() === 'red' ? '#ff0000' :
                          productColor.toLowerCase() === 'blue' ? '#0000ff' :
                            productColor.toLowerCase() === 'green' ? '#00ff00' :
                              productColor.toLowerCase() === 'yellow' ? '#ffff00' :
                                productColor.toLowerCase() === 'pink' ? '#ffc0cb' :
                                  productColor.toLowerCase() === 'purple' ? '#800080' :
                                    productColor.toLowerCase() === 'orange' ? '#ffa500' :
                                      productColor.toLowerCase() === 'brown' ? '#a52a2a' :
                                        productColor.toLowerCase() === 'gray' ? '#808080' : '#e5e7eb'
                  }}
                />
                <span className="text-xs">{productColor}</span>
              </div>
            )}
            <span className="text-xs text-gray-500">
              {product.productTag || 'General'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

const ProductDetailsModal = React.memo(({
  product,
  onClose,
  onUpdateDetails,
  isUpdatingDetails,
  onSellProduct // NEW: Add sell function prop
}) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [formData, setFormData] = useState(product);
  const [activeTab, setActiveTab] = useState('details');

  // Calculate total stock from variants if available
  const calculateTotalStock = useCallback((prod) => {
    if (prod.variants && prod.variants.length > 0) {
      return prod.variants.reduce((total, variant) => {
        return total + (Number(variant.stock) || 0);
      }, 0);
    }
    return prod.stockQuantity || prod.stock || 0;
  }, []);

  useEffect(() => {
    setFormData({
      ...product,
      price: Number(product.price) || 0,
      offerPrice: Number(product.offerPrice) || 0,
      stockQuantity: Number(product.stockQuantity ?? product.stock) || 0,
      subCategory: product.subCategory ?? product.subcategory ?? '',
    });
    setIsEditMode(false);
    setActiveTab('details');
  }, [product]);

  const handleInputChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      if (type === 'number') {
        return { ...prev, [name]: value === '' ? '' : Number(value) };
      }
      if (type === 'checkbox') {
        return { ...prev, [name]: checked ? 'Yes' : 'No' };
      }
      return { ...prev, [name]: value };
    });
  }, []);

  const handleSave = async () => {
    const updatedFields = {
      name: formData.name,
      brand: formData.brand,
      category: formData.category,
      subCategory: formData.subCategory ?? formData.subcategory,
      color: formData.color,
      price: formData.price,
      offerPrice: formData.offerPrice,
      stockQuantity: formData.stockQuantity,
      basesku: formData.basesku || formData.sku,
      hsnCode: formData.hsnCode,
      cashOnDelivery: formData.cashOnDelivery,
      description: formData.description,
      careinstructions: formData.careinstructions,
    };

    try {
      await onUpdateDetails(product.id, updatedFields);
      setIsEditMode(false);
    } catch (e) {
      console.error('Update failed:', e);
    }
  };

  const handleBackdropClick = useCallback((e) => {
    if (e.target === e.currentTarget && !isUpdatingDetails) onClose();
  }, [onClose, isUpdatingDetails]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && !isUpdatingDetails) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose, isUpdatingDetails]);

  const displayData = isEditMode ? formData : product;
  const totalStock = calculateTotalStock(displayData);
  const stockClass = totalStock > 10 ? 'bg-green-100 text-green-800 border border-green-200' :
    totalStock > 0 ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
      'bg-red-100 text-red-800 border border-red-200';

  // --- MODIFIED PRICE LOGIC START: Apply variant price logic to modal display ---
  let modalPrice = Number(displayData.price) || 0;
  let modalOfferPrice = Number(displayData.offerPrice) || 0;
  const variants = product.variants || [];

  // If main price is 0, check the first variant for price
  if (modalPrice === 0 && variants.length > 0) {
    const firstVariant = variants[0];
    const firstVariantPrice = Number(firstVariant.price) || 0;
    const firstVariantOfferPrice = Number(firstVariant.offerPrice) || 0;

    // Use variant price/offerPrice if it's valid (> 0)
    if (firstVariantPrice > 0) {
      modalPrice = firstVariantPrice;
      modalOfferPrice = firstVariantOfferPrice;
    }
  }
  const productPrice = isEditMode ? (formData.price || 0) : modalPrice;
  const productOfferPrice = isEditMode ? (formData.offerPrice || 0) : modalOfferPrice;
  const productName = displayData.name || displayData.brand || 'Generic Product';
  const displaySku = displayData.basesku || displayData.sku || 'N/A';
  const isDisabled = isUpdatingDetails;

  const category = displayData.category ?
    (typeof displayData.category === 'object' ? displayData.category.name : displayData.category) :
    'N/A';

  const subCategory = displayData.subCategory ?
    (typeof displayData.subCategory === 'object' ? displayData.subCategory.name || displayData.subCategory.id : displayData.subCategory) :
    (displayData.subcategory ?
      (typeof displayData.subcategory === 'object' ? displayData.subcategory.name || displayData.subcategory.id : displayData.subcategory) :
      'N/A');

  const imageUrl = displayData.mainImageUrl || displayData.image || displayData.images?.[0]?.url || null;
  const sellerId = displayData.sellerId || displayData.sellerID || displayData.sellerid || 'N/A';
  const productColor = displayData.color || 'N/A';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-2 md:p-4 overflow-y-auto" onClick={handleBackdropClick}>
      <div className="bg-white rounded-xl md:rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden animate-modal-in">
        {/* Modal Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 md:p-5 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-gray-900 text-base md:text-xl truncate">{productName}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <code className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded font-mono" title={displaySku}>
                    SKU: {displaySku.length > 20 ? `${displaySku.substring(0, 20)}...` : displaySku}
                  </code>
                  <div className={`px-2 py-0.5 text-xs font-medium rounded-lg ${stockClass}`}>
                    <span className="font-bold">{totalStock.toLocaleString()}</span> in stock
                  </div>
                  {isEditMode && (
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">Editing</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={isDisabled}
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-4 mt-4 overflow-x-auto">
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${activeTab === 'details' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}
              onClick={() => setActiveTab('details')}
            >
              <Package className="inline w-4 h-4 mr-1.5" />
              Details
            </button>
            {variants.length > 0 && (
              <button
                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${activeTab === 'variants' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}
                onClick={() => setActiveTab('variants')}
              >
                <Layers className="inline w-4 h-4 mr-1.5" />
                Variants ({variants.length})
              </button>
            )}
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${activeTab === 'seller' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:text-gray-900'}`}
              onClick={() => setActiveTab('seller')}
            >
              <User className="inline w-4 h-4 mr-1.5" />
              Seller Info
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-4 md:p-5 overflow-y-auto max-h-[calc(90vh-120px)]">
          {activeTab === 'details' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-5">
              {/* Left Column - Image */}
              <div className="lg:col-span-1">
                <div className="bg-gray-50 rounded-xl p-3 md:p-4">
                  <div className="aspect-square rounded-lg overflow-hidden bg-white border border-gray-200 mb-3">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={productName}
                        className="w-full h-full object-contain"
                        onError={(e) => e.currentTarget.src = '/fallback-image.png'}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-12 h-12 text-gray-400" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Total Stock:</span>
                      <div className={`px-3 py-1.5 text-sm font-medium rounded-lg ${stockClass}`}>
                        <span className="font-bold">{totalStock.toLocaleString()}</span> units
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Subcategory:</span>
                      <span className="text-sm font-semibold text-gray-900">{subCategory}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Category:</span>
                      <span className="text-sm font-semibold text-gray-900">{category}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Color:</span>
                      <div className="flex items-center gap-2">
                        {productColor !== 'N/A' && (
                          <div
                            className="w-4 h-4 rounded-full border border-gray-300"
                            style={{
                              backgroundColor: productColor.toLowerCase() === 'black' ? '#000' :
                                productColor.toLowerCase() === 'white' ? '#fff' :
                                  productColor.toLowerCase() === 'red' ? '#ff0000' :
                                    productColor.toLowerCase() === 'blue' ? '#0000ff' :
                                      productColor.toLowerCase() === 'green' ? '#00ff00' :
                                        productColor.toLowerCase() === 'yellow' ? '#ffff00' :
                                          productColor.toLowerCase() === 'pink' ? '#ffc0cb' :
                                            productColor.toLowerCase() === 'purple' ? '#800080' :
                                              productColor.toLowerCase() === 'orange' ? '#ffa500' :
                                                productColor.toLowerCase() === 'brown' ? '#a52a2a' :
                                                  productColor.toLowerCase() === 'gray' ? '#808080' : '#e5e7eb'
                            }}
                          />
                        )}
                        <span className="text-sm font-medium text-gray-900">{productColor}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">Product Tag:</span>
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded">
                        {product.productTag || 'General'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Details */}
              <div className="lg:col-span-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                  {/* Product Name */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Product Name</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        name="name"
                        value={formData.name || ''}
                        onChange={handleInputChange}
                        disabled={isDisabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    ) : (
                      <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900 font-medium text-base">{productName}</div>
                    )}
                  </div>

                  {/* Brand */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Brand</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        name="brand"
                        value={formData.brand || ''}
                        onChange={handleInputChange}
                        disabled={isDisabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    ) : (
                      <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900 text-sm font-medium">{product.brand || 'N/A'}</div>
                    )}
                  </div>

                  {/* Color */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Color</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        name="color"
                        value={formData.color || ''}
                        onChange={handleInputChange}
                        disabled={isDisabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
                        {productColor !== 'N/A' && (
                          <div
                            className="w-4 h-4 rounded-full border border-gray-300"
                            style={{
                              backgroundColor: productColor.toLowerCase() === 'black' ? '#000' :
                                productColor.toLowerCase() === 'white' ? '#fff' :
                                  productColor.toLowerCase() === 'red' ? '#ff0000' :
                                    productColor.toLowerCase() === 'blue' ? '#0000ff' :
                                      productColor.toLowerCase() === 'green' ? '#00ff00' :
                                        productColor.toLowerCase() === 'yellow' ? '#ffff00' :
                                          productColor.toLowerCase() === 'pink' ? '#ffc0cb' :
                                            productColor.toLowerCase() === 'purple' ? '#800080' :
                                              productColor.toLowerCase() === 'orange' ? '#ffa500' :
                                                productColor.toLowerCase() === 'brown' ? '#a52a2a' :
                                                  productColor.toLowerCase() === 'gray' ? '#808080' : '#e5e7eb'
                            }}
                          />
                        )}
                        <span className="text-gray-900 text-sm font-medium">{productColor}</span>
                      </div>
                    )}
                  </div>

                  {/* Price */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Price (₹)</label>
                    {isEditMode ? (
                      <input
                        type="number"
                        name="price"
                        value={formData.price || 0}
                        onChange={handleInputChange}
                        disabled={isDisabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    ) : (
                      <div className="px-3 py-2 bg-gray-50 rounded-lg">
                        <span className="text-gray-900 font-bold text-base">
                          {productPrice > 0 ? `₹${productPrice.toLocaleString()}` : '₹0 (Price Missing)'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Offer Price */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Offer Price (₹)</label>
                    {isEditMode ? (
                      <input
                        type="number"
                        name="offerPrice"
                        value={formData.offerPrice || 0}
                        onChange={handleInputChange}
                        disabled={isDisabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    ) : (
                      <div className="px-3 py-2 bg-gray-50 rounded-lg">
                        <span className={`text-sm ${productOfferPrice && productOfferPrice < productPrice && productOfferPrice > 0 ? 'text-green-600 font-bold' : 'text-gray-500'}`}>
                          {productOfferPrice && productOfferPrice < productPrice && productOfferPrice > 0 ? `₹${productOfferPrice.toLocaleString()}` : 'No offer'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Stock */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Main Stock Quantity</label>
                    {isEditMode ? (
                      <input
                        type="number"
                        name="stockQuantity"
                        value={formData.stockQuantity || 0}
                        onChange={handleInputChange}
                        disabled={isDisabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    ) : (
                      <div className="px-3 py-2 bg-gray-50 rounded-lg">
                        <span className={`text-sm font-medium ${stockClass.includes('green') ? 'text-green-700' : stockClass.includes('yellow') ? 'text-yellow-700' : 'text-red-700'}`}>
                          {(product.stockQuantity || product.stock || 0).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* HSN Code */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">HSN Code</label>
                    {isEditMode ? (
                      <input
                        type="text"
                        name="hsnCode"
                        value={formData.hsnCode || ''}
                        onChange={handleInputChange}
                        disabled={isDisabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    ) : (
                      <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900 text-sm font-medium">{product.hsnCode || 'N/A'}</div>
                    )}
                  </div>

                  {/* Cash on Delivery */}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Cash on Delivery</label>
                    {isEditMode ? (
                      <select
                        name="cashOnDelivery"
                        value={formData.cashOnDelivery || 'No'}
                        onChange={handleInputChange}
                        disabled={isDisabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                      >
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    ) : (
                      <div className="px-3 py-2 bg-gray-50 rounded-lg">
                        <span className={`text-sm font-medium ${product.cashOnDelivery === 'Yes' ? 'text-green-600 font-semibold' : 'text-gray-600'}`}>
                          {product.cashOnDelivery || 'No'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
                    {isEditMode ? (
                      <textarea
                        name="description"
                        rows="3"
                        value={formData.description || ''}
                        onChange={handleInputChange}
                        disabled={isDisabled}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                      />
                    ) : (
                      <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900 text-sm min-h-[80px]">
                        {product.description || 'No description available'}
                      </div>
                    )}
                  </div>

                  {/* Care Instructions */}
                  {product.careinstructions && (
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 mb-1">Care Instructions</label>
                      {isEditMode ? (
                        <textarea
                          name="careinstructions"
                          rows="2"
                          value={formData.careinstructions || ''}
                          onChange={handleInputChange}
                          disabled={isDisabled}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm resize-none"
                        />
                      ) : (
                        <div className="px-3 py-2 bg-gray-50 rounded-lg text-gray-900 text-sm">
                          {product.careinstructions}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Product ID */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Product ID</label>
                    <div className="px-3 py-2 bg-gray-50 rounded-lg">
                      <code className="text-xs text-gray-600 font-mono break-all">{product.id}</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'variants' && variants.length > 0 && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-900 text-base">Product Variants ({variants.length})</h3>
                  <div className={`px-3 py-1.5 text-sm font-medium rounded-lg ${stockClass}`}>
                    Total: <span className="font-bold">{totalStock.toLocaleString()}</span> units
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Color</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Size</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Price</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Offer Price</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {variants.map((variant, index) => {
                        const variantStock = Number(variant.stock) || 0;
                        const variantStockClass = variantStock > 10 ? 'bg-green-100 text-green-800' :
                          variantStock > 0 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800';

                        return (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {variant.color && (
                                  <div
                                    className="w-3 h-3 rounded-full border border-gray-300"
                                    style={{
                                      backgroundColor: variant.color.toLowerCase() === 'black' ? '#000' :
                                        variant.color.toLowerCase() === 'white' ? '#fff' :
                                          variant.color.toLowerCase() === 'red' ? '#ff0000' :
                                            variant.color.toLowerCase() === 'blue' ? '#0000ff' :
                                              variant.color.toLowerCase() === 'green' ? '#00ff00' :
                                                variant.color.toLowerCase() === 'yellow' ? '#ffff00' :
                                                  variant.color.toLowerCase() === 'pink' ? '#ffc0cb' :
                                                    variant.color.toLowerCase() === 'purple' ? '#800080' :
                                                      variant.color.toLowerCase() === 'orange' ? '#ffa500' :
                                                        variant.color.toLowerCase() === 'brown' ? '#a52a2a' :
                                                          variant.color.toLowerCase() === 'gray' ? '#808080' : '#e5e7eb'
                                    }}
                                  />
                                )}
                                <span>{variant.color || 'N/A'}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 font-medium">{variant.size || 'N/A'}</td>
                            <td className="px-3 py-2 font-bold">₹{variant.price ? variant.price.toLocaleString() : '0'}</td>
                            <td className="px-3 py-2">
                              {variant.offerPrice && variant.offerPrice < variant.price ? (
                                <span className="text-green-600 font-bold">₹{variant.offerPrice.toLocaleString()}</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${variantStockClass}`}>
                                {variantStock.toLocaleString()} units
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'seller' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-xl p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 text-base">Seller Information</h3>
                    <p className="text-xs text-gray-600">Product owner details</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Hash className="w-4 h-4 text-gray-400" />
                      <span className="text-xs font-medium text-gray-700">Seller ID</span>
                    </div>
                    <code className="text-sm text-gray-900 font-mono break-all">{sellerId}</code>
                  </div>

                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <span className="text-xs font-medium text-gray-700">Added On</span>
                    </div>
                    <span className="text-sm text-gray-900 font-medium">
                      {product.createdAt ? new Date(product.createdAt).toLocaleDateString() : 'N/A'}
                    </span>
                  </div>

                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle className="w-4 h-4 text-gray-400" />
                      <span className="text-xs font-medium text-gray-700">Status</span>
                    </div>
                    <span className="text-sm text-gray-900 font-medium">
                      {product.status || 'Active'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 md:p-5">
          {isEditMode ? (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                onClick={handleSave}
                disabled={isDisabled}
              >
                {isUpdatingDetails ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
              <button
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                onClick={() => { setIsEditMode(false); setFormData(product); }}
                disabled={isDisabled}
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                className="flex-1 px-4 py-2.5 bg-blue-100 text-blue-700 font-medium rounded-lg hover:bg-blue-200 transition-colors flex items-center justify-center gap-2"
                onClick={() => setIsEditMode(true)}
                disabled={isDisabled}
              >
                <Edit className="w-4 h-4" />
                Edit Product
              </button>
              <button
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                onClick={onClose}
                disabled={isDisabled}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default SellerProducts;