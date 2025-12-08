import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload, FileText, Package, DollarSign,
  BarChart3, Filter, Download, AlertCircle,
  CheckCircle, XCircle, Loader2,
  Users, Tag, Percent, Eye, Image as ImageIcon,
  Hash, ShoppingBag, Database, Search, ChevronDown, ChevronUp,
  Save, Cloud, Trash2, RefreshCw, Clock, EyeOff,
  User, Settings, Palette, Box, Tag as TagIcon, Info
} from 'lucide-react';

// Firebase imports
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDoc // <--- ADDED: Necessary for fetching category/subcategory by ID
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';

const BulkUpload = () => {
  const [products, setProducts] = useState([]);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [selectedSKU, setSelectedSKU] = useState('');
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [expandedSections, setExpandedSections] = useState({
    summary: true,
    categories: true,
    analysis: true,
    products: true
  });
  const [saving, setSaving] = useState(false);
  const [savedUploads, setSavedUploads] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedUpload, setSelectedUpload] = useState(null);
  const [excelStats, setExcelStats] = useState(null);
  const fileInputRef = useRef(null);

  // Load saved uploads from Firebase
  useEffect(() => {
    loadSavedUploads();
  }, []);

  const loadSavedUploads = async () => {
    try {
      setLoadingHistory(true);
      const q = query(
        collection(db, 'productUploads'),
        orderBy('uploadedAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const uploads = [];
      querySnapshot.forEach((doc) => {
        uploads.push({ id: doc.id, ...doc.data() });
      });
      setSavedUploads(uploads);
    } catch (error) {
      console.error('Error loading upload history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  /**
   * Fetches category and subcategory names from Firestore using their IDs.
   * @param {Set<string>} categoryIds - Set of unique Category IDs.
   * @param {Set<string>} subCategoryIds - Set of unique Subcategory IDs.
   * @returns {Promise<Map<string, string>>} A map where key is the ID (or 'sub-'+ID) and value is the name.
   */
  const fetchCategoryNames = async (categoryIds, subCategoryIds) => {
    const nameMap = new Map();
    
    // Fetch Category Names
    const categoryPromises = Array.from(categoryIds).map(async (id) => {
      try {
        const docRef = doc(db, 'categories', id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().name) {
          nameMap.set(id, docSnap.data().name);
        } else {
          nameMap.set(id, id); // Fallback to ID if not found or name is missing
        }
      } catch (error) {
        console.error(`Error fetching category ${id}:`, error);
        nameMap.set(id, id);
      }
    });

    // Fetch Subcategory Names
    const subCategoryPromises = Array.from(subCategoryIds).map(async (id) => {
      try {
        const docRef = doc(db, 'subcategories', id);
        const docSnap = await getDoc(docRef);
        
        // Use a unique key like 'sub-' + id to avoid collision with category IDs
        if (docSnap.exists() && docSnap.data().name) {
          nameMap.set('sub-' + id, docSnap.data().name); 
        } else {
          nameMap.set('sub-' + id, id); // Fallback to ID
        }
      } catch (error) {
        console.error(`Error fetching subcategory ${id}:`, error);
        nameMap.set('sub-' + id, id);
      }
    });

    await Promise.all([...categoryPromises, ...subCategoryPromises]);
    return nameMap;
  };

  // Generate search keywords from product name
  const generateSearchKeywords = (productName, sku, hsnCode, brand) => {
    const keywords = new Set();
    const name = productName?.toLowerCase() || '';
    const skuStr = sku?.toLowerCase() || '';
    const hsnStr = hsnCode?.toLowerCase() || '';
    const brandStr = brand?.toLowerCase() || '';
    
    // Generate partials from product name
    for (let i = 1; i <= name.length; i++) {
      keywords.add(name.substring(0, i));
    }
    
    // Add words from product name
    const words = name.split(' ');
    words.forEach(word => {
      for (let i = 1; i <= word.length; i++) {
        keywords.add(word.substring(0, i));
      }
    });
    
    // Add SKU partials
    for (let i = 1; i <= skuStr.length; i++) {
      keywords.add(skuStr.substring(0, i));
    }
    
    // Add HSN Code partials
    for (let i = 1; i <= hsnStr.length; i++) {
      keywords.add(hsnStr.substring(0, i));
    }
    
    // Add brand partials
    for (let i = 1; i <= brandStr.length; i++) {
      keywords.add(brandStr.substring(0, i));
    }
    
    // Add full values
    if (name) keywords.add(name);
    if (skuStr) keywords.add(skuStr);
    if (hsnStr) keywords.add(hsnStr);
    if (brandStr) keywords.add(brandStr);
    
    return Array.from(keywords);
  };

  // Handle multiple file uploads
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    setLoading(true);
    const newUploadedFiles = [];
    const allProducts = [];
    
    // Sets to track unique IDs
    const categoryIdSet = new Set(); // <--- Tracks Category IDs
    const subCategoryIdSet = new Set(); // <--- Tracks Subcategory IDs
    const brandMap = new Map();

    const filePromises = files.map((file, index) => {
        return new Promise((resolve) => {
            try {
                // Upload file to Firebase Storage
                const storageRef = ref(storage, `product-uploads/${Date.now()}_${file.name}`);
                uploadBytes(storageRef, file).then(snapshot => {
                    getDownloadURL(storageRef).then(fileUrl => {
                        const reader = new FileReader();
                        
                        reader.onload = (e) => {
                            try {
                                const data = new Uint8Array(e.target.result);
                                const workbook = XLSX.read(data, { type: 'array' });
                                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                                const excelData = XLSX.utils.sheet_to_json(firstSheet);
                                
                                // Track categories, subcategories, and brands from Excel
                                excelData.forEach(row => {
                                    if (row.CategoryID && row.CategoryID !== 'N/A') {
                                        categoryIdSet.add(row.CategoryID);
                                    }
                                    if (row.SubCategoryID && row.SubCategoryID !== 'N/A') { // <--- Track Subcategory IDs
                                        subCategoryIdSet.add(row.SubCategoryID);
                                    }
                                    if (row.Brand && row.Brand !== 'N/A') {
                                        brandMap.set(row.Brand, row.Brand);
                                    }
                                });
                                
                                // Transform Excel data to match your Firestore schema
                                const transformedProducts = transformExcelData(excelData, file.name, fileUrl);
                                
                                allProducts.push(...transformedProducts);
                                newUploadedFiles.push({
                                    name: file.name,
                                    size: (file.size / 1024).toFixed(2) + ' KB',
                                    productsCount: transformedProducts.length,
                                    status: 'success',
                                    timestamp: new Date().toLocaleTimeString(),
                                    fileUrl: fileUrl
                                });

                                resolve(); // Resolve the promise for this file
                            } catch (error) {
                                console.error('Error reading file:', error);
                                handleUploadError(file, error);
                                resolve();
                            }
                        };
                        
                        reader.readAsArrayBuffer(file);
                    }).catch(err => {
                        console.error('Error getting download URL:', err);
                        handleUploadError(file, err);
                        resolve();
                    });
                }).catch(err => {
                    console.error('Error uploading file to storage:', err);
                    handleUploadError(file, err);
                    resolve();
                });
            } catch (error) {
                console.error('Error processing file:', error);
                handleUploadError(file, error);
                resolve();
            }
        });
    });

    await Promise.all(filePromises);
    
    // --- Post-Upload Processing ---
    
    // 1. Fetch category and subcategory names using the collected IDs
    const nameMap = await fetchCategoryNames(categoryIdSet, subCategoryIdSet); 

    // 2. Map the fetched names onto the transformed products
    const updatedAllProducts = allProducts.map(productGroup => {
        const catId = productGroup.baseInfo.category?.id;
        const subCatId = productGroup.baseInfo.subCategory?.id;

        // Retrieve the fetched name, falling back to the ID or existing name if needed
        const categoryName = catId ? nameMap.get(catId) : productGroup.baseInfo.category?.name;
        const subCategoryName = subCatId ? nameMap.get('sub-' + subCatId) : productGroup.baseInfo.subCategory?.name;
        
        return {
            ...productGroup,
            baseInfo: {
                ...productGroup.baseInfo,
                // Update with the fetched name
                category: catId ? { id: catId, name: categoryName } : null,
                subCategory: subCatId ? { id: subCatId, name: subCategoryName } : null,
            }
        };
    });

    setProducts(prev => [...prev, ...updatedAllProducts]);
    setUploadedFiles(prev => [...prev, ...newUploadedFiles]);
    performAnalysis([...products, ...updatedAllProducts]);
    
    // Set Excel stats
    setExcelStats({
      // Use the resolved names for the stats display
      categories: Array.from(categoryIdSet).map(id => ({ id, name: nameMap.get(id) || id })),
      brands: Array.from(brandMap.values()),
      totalRows: allProducts.length // This might be slightly off if multiple files failed entirely, but is a close proxy
    });
    
    setLoading(false);
  };
  
  // Transform Excel data to match your Firestore schema
  const transformExcelData = (excelData, fileName, fileUrl) => {
    // Group by SKU to handle variants
    const skuGroups = {};
    const timestamp = Date.now();
    
    excelData.forEach((row, index) => {
      const sku = row.SKU || `SKU-${timestamp}-${index}`;
      const rowTimestamp = timestamp + index;
      
      if (!skuGroups[sku]) {
        skuGroups[sku] = {
          baseInfo: {
            sku: sku,
            name: row.Name || '',
            description: row.Description || '',
            brand: row.Brand || '',
            hsnCode: row.HSNCode || '',
            productTag: row.ProductTag || 'General',
            sellerId: row.SellerId || '',
            status: 'Active',
            category: row.CategoryID ? {
              id: row.CategoryID,
              name: row.CategoryID // Temporary name (ID), will be updated by fetchCategoryNames later
            } : null,
            subCategory: row.SubCategoryID ? {
              id: row.SubCategoryID,
              name: row.SubCategoryID // Temporary name (ID), will be updated by fetchCategoryNames later
            } : null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            searchKeywords: generateSearchKeywords(row.Name, sku, row.HSNCode, row.Brand),
            mainImageUrl: row.MainImageURL || '',
            imageUrls: [],
            sourceFile: fileName,
            sourceFileUrl: fileUrl
          },
          variants: []
        };
      }
      
      // Add variant
      const variantId = `${rowTimestamp}`;
      skuGroups[sku].variants.push({
        variantId: variantId,
        color: row.Variant_Color || '',
        size: row.Variant_Size || '',
        price: Number(row.Variant_Price) || 0,
        offerPrice: row.Variant_OfferPrice ? Number(row.Variant_OfferPrice) : null,
        stock: Number(row.Variant_Stock) || 0
      });
      
      // Add image if exists
      if (row.MainImageURL) {
        const isMain = skuGroups[sku].baseInfo.imageUrls.length === 0;
        skuGroups[sku].baseInfo.imageUrls.push({
          color: row.Variant_Color || '',
          isMain: isMain,
          name: `${isMain ? 'Main' : 'Gallery'} Image for ${sku}`,
          path: `products/${variantId}_${isMain ? 'main' : 'gallery'}_${sku}`,
          type: 'url',
          url: row.MainImageURL
        });
        
        // Set first image as mainImageUrl
        if (isMain) {
          skuGroups[sku].baseInfo.mainImageUrl = row.MainImageURL;
        }
      }
      
      // Handle gallery images (pipe-separated)
      if (row.GalleryImages) {
        const galleryUrls = row.GalleryImages.split('|').filter(url => url.trim());
        galleryUrls.forEach((url, imgIndex) => {
          skuGroups[sku].baseInfo.imageUrls.push({
            color: row.Variant_Color || '',
            isMain: false,
            name: `Gallery Image ${imgIndex + 1} for ${sku}`,
            path: `products/${variantId}_gallery_${sku}_${imgIndex}`,
            type: 'url',
            url: url.trim()
          });
        });
      }
      
      // Handle VideoURL if exists
      if (row.VideoURL && !skuGroups[sku].baseInfo.videoUrl) {
        skuGroups[sku].baseInfo.videoUrl = row.VideoURL;
      }
    });
    
    // Convert grouped data to array and remove duplicate images
    return Object.values(skuGroups).map(group => {
      // Remove duplicate images by URL
      const uniqueImages = [];
      const seenUrls = new Set();
      
      group.baseInfo.imageUrls.forEach(image => {
        if (!seenUrls.has(image.url)) {
          seenUrls.add(image.url);
          uniqueImages.push(image);
        }
      });
      
      group.baseInfo.imageUrls = uniqueImages;
      return group;
    });
  };

  const handleUploadError = (file, error) => {
    setUploadedFiles(prev => [...prev, {
      name: file.name,
      size: (file.size / 1024).toFixed(2) + ' KB',
      productsCount: 0,
      status: 'error',
      error: error.message,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  // Save products to Firebase in your schema format
  const saveToFirebase = async () => {
    if (products.length === 0) return;

    try {
      setSaving(true);
      
      // Collect unique sellers from products
      const uniqueSellers = [...new Set(products.map(p => p.baseInfo.sellerId).filter(Boolean))];
      
      // Create upload record
      const uploadData = {
        totalProducts: products.length,
        totalSKUs: products.length,
        uploadedFiles: uploadedFiles.map(file => ({
          name: file.name,
          size: file.size,
          productsCount: file.productsCount,
          fileUrl: file.fileUrl
        })),
        sellers: uniqueSellers,
        // Save the categories and brands with their resolved names
        categories: excelStats?.categories || [], 
        brands: excelStats?.brands || [],
        uploadedAt: serverTimestamp(),
        processedAt: new Date().toISOString(),
        status: 'completed',
        schema: 'emart-excel-import'
      };

      // Save upload metadata
      const uploadRef = await addDoc(collection(db, 'productUploads'), uploadData);
      
      // Save each product to products collection
      const savePromises = products.map(async (productGroup) => {
        const productData = {
          ...productGroup.baseInfo,
          variants: productGroup.variants,
          uploadId: uploadRef.id
        };
        
        return addDoc(collection(db, 'products'), productData);
      });

      await Promise.all(savePromises);
      
      // Update local state
      setSavedUploads(prev => [{
        id: uploadRef.id,
        ...uploadData,
        uploadedAt: new Date()
      }, ...prev]);

      alert(`${products.length} products saved to Firebase successfully!`);
    } catch (error) {
      console.error('Error saving to Firebase:', error);
      alert('Error saving products to Firebase: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Load saved upload from Firebase
  const loadSavedUpload = async (uploadId) => {
    try {
      setLoading(true);
      
      // Get products from this upload
      const q = query(
        collection(db, 'products'),
        where('uploadId', '==', uploadId)
      );
      
      const querySnapshot = await getDocs(q);
      const loadedProducts = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        loadedProducts.push({
          id: doc.id,
          baseInfo: {
            sku: data.sku,
            name: data.name,
            description: data.description,
            brand: data.brand,
            hsnCode: data.hsnCode,
            productTag: data.productTag,
            sellerId: data.sellerId,
            status: data.status,
            category: data.category,
            subCategory: data.subCategory, // <--- Now includes resolved subCategory name
            mainImageUrl: data.mainImageUrl,
            imageUrls: data.imageUrls || [],
            sourceFile: data.sourceFile,
            sourceFileUrl: data.sourceFileUrl
          },
          variants: data.variants || []
        });
      });
      
      setProducts(loadedProducts);
      setSelectedUpload(uploadId);
      performAnalysis(loadedProducts);
      
      // Get upload info
      const uploadDoc = savedUploads.find(u => u.id === uploadId);
      if (uploadDoc) {
        setUploadedFiles(uploadDoc.uploadedFiles || []);
        setExcelStats({
          categories: uploadDoc.categories || [],
          brands: uploadDoc.brands || []
        });
      }
    } catch (error) {
      console.error('Error loading upload:', error);
      alert('Error loading saved upload');
    } finally {
      setLoading(false);
    }
  };

  // Delete saved upload
  const deleteUpload = async (uploadId) => {
    if (!window.confirm('Are you sure you want to delete this upload?')) return;

    try {
      setLoading(true);
      
      // Delete all products from this upload
      const q = query(
        collection(db, 'products'),
        where('uploadId', '==', uploadId)
      );
      
      const querySnapshot = await getDocs(q);
      const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      // Delete upload record
      await deleteDoc(doc(db, 'productUploads', uploadId));
      
      // Update local state
      setSavedUploads(prev => prev.filter(u => u.id !== uploadId));
      
      if (selectedUpload === uploadId) {
        clearData();
      }
      
      alert('Upload deleted successfully!');
    } catch (error) {
      console.error('Error deleting upload:', error);
      alert('Error deleting upload');
    } finally {
      setLoading(false);
    }
  };

  // Perform comprehensive analysis
  const performAnalysis = (data) => {
    if (!data || data.length === 0) {
      setAnalysis(null);
      return;
    }

    // Flatten variants for analysis
    const allVariants = data.flatMap(product => 
      product.variants.map(variant => ({
        ...variant,
        productName: product.baseInfo.name,
        productSKU: product.baseInfo.sku,
        productBrand: product.baseInfo.brand,
        productCategory: product.baseInfo.category?.name
      }))
    );

    const totalVariants = allVariants.length;
    const totalProducts = data.length;
    const uniqueSKUs = [...new Set(data.map(item => item.baseInfo.sku))];
    
    const prices = allVariants.map(p => p.price || 0).filter(p => p > 0);
    const offerPrices = allVariants.map(p => p.offerPrice || 0).filter(p => p > 0);
    const totalStock = allVariants.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
    
    // Categories from actual data
    const categories = data.reduce((acc, item) => {
      const category = item.baseInfo.category?.name || 'Uncategorized';
      if (category) {
        acc[category] = (acc[category] || 0) + 1;
      }
      return acc;
    }, {});
    
    // Brands from actual data
    const brands = data.reduce((acc, item) => {
      const brand = item.baseInfo.brand || 'Unknown';
      if (brand) {
        acc[brand] = (acc[brand] || 0) + 1;
      }
      return acc;
    }, {});
    
    // Sellers from actual data
    const sellers = data.reduce((acc, item) => {
      const seller = item.baseInfo.sellerId || 'Unknown';
      if (!acc[seller]) {
        acc[seller] = { count: 0, name: seller };
      }
      acc[seller].count++;
      return acc;
    }, {});
    
    const missingData = {
      images: data.filter(item => !item.baseInfo.mainImageUrl).length,
      gallery: data.filter(item => !item.baseInfo.imageUrls || item.baseInfo.imageUrls.length <= 1).length,
      description: data.filter(item => !item.baseInfo.description).length,
      hsnCode: data.filter(item => !item.baseInfo.hsnCode).length,
      offerPrice: allVariants.filter(v => !v.offerPrice).length,
      seller: data.filter(item => !item.baseInfo.sellerId).length
    };
    
    const lowStockVariants = allVariants
      .filter(p => (Number(p.stock) || 0) < 20)
      .map(p => ({
        sku: p.productSKU,
        name: p.productName,
        stock: p.stock,
        color: p.color,
        size: p.size,
        brand: p.productBrand
      }));
    
    setAnalysis({
      summary: {
        totalProducts,
        totalVariants,
        uniqueSKUs: uniqueSKUs.length,
        totalStock,
        averagePrice: prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
        averageOfferPrice: offerPrices.length > 0 ? Math.round(offerPrices.reduce((a, b) => a + b, 0) / offerPrices.length) : 0,
        minPrice: prices.length > 0 ? Math.min(...prices) : 0,
        maxPrice: prices.length > 0 ? Math.max(...prices) : 0
      },
      categories,
      brands,
      sellers,
      missingData,
      lowStockVariants,
      priceDistribution: {
        under500: prices.filter(p => p < 500).length,
        '500-1000': prices.filter(p => p >= 500 && p < 1000).length,
        '1000-5000': prices.filter(p => p >= 1000 && p < 5000).length,
        '5000+': prices.filter(p => p >= 5000).length
      }
    });
    
    setFilteredProducts(data);
  };

  // Filter products by SKU
  useEffect(() => {
    if (selectedSKU) {
      const filtered = products.filter(product => 
        product.baseInfo.sku.toLowerCase().includes(selectedSKU.toLowerCase()) ||
        product.baseInfo.name.toLowerCase().includes(selectedSKU.toLowerCase()) ||
        product.baseInfo.brand.toLowerCase().includes(selectedSKU.toLowerCase())
      );
      setFilteredProducts(filtered);
    } else {
      setFilteredProducts(products);
    }
  }, [selectedSKU, products]);

  // Export data to Excel
  const exportToExcel = () => {
    if (products.length === 0) return;
    
    // Flatten data for Excel export
    const exportData = products.flatMap(product => 
      product.variants.map(variant => ({
        SKU: product.baseInfo.sku,
        Name: product.baseInfo.name,
        Description: product.baseInfo.description,
        Brand: product.baseInfo.brand,
        CategoryID: product.baseInfo.category?.id,
        CategoryName: product.baseInfo.category?.name,
        SubCategoryID: product.baseInfo.subCategory?.id, // <--- Exporting SubCategoryID
        SubCategoryName: product.baseInfo.subCategory?.name, // <--- Exporting SubCategoryName
        SellerId: product.baseInfo.sellerId,
        HSNCode: product.baseInfo.hsnCode,
        Variant_Color: variant.color,
        Variant_Size: variant.size,
        Variant_Price: variant.price,
        Variant_Stock: variant.stock,
        Variant_OfferPrice: variant.offerPrice,
        MainImageURL: product.baseInfo.mainImageUrl,
        ProductTag: product.baseInfo.productTag,
        Status: product.baseInfo.status
      }))
    );
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.writeFile(wb, `emart-products-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Clear all data
  const clearData = () => {
    setProducts([]);
    setAnalysis(null);
    setUploadedFiles([]);
    setFilteredProducts([]);
    setSelectedSKU('');
    setSelectedUpload(null);
    setExcelStats(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Toggle section expansion
  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Handle drag and drop
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const event = {
        target: {
          files: e.dataTransfer.files
        }
      };
      handleFileUpload(event);
    }
  };

  // Format date
  const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Upload className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Bulk Product Upload</h1>
              <p className="text-gray-600 mt-1">Upload Excel files directly</p>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={saveToFirebase}
              disabled={products.length === 0 || saving}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {saving ? 'Saving...' : 'Save Products'}
            </button>
            <button
              onClick={exportToExcel}
              disabled={products.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Data
            </button>
            <button
              onClick={clearData}
              disabled={products.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <XCircle className="w-4 h-4" />
              Clear All
            </button>
          </div>
        </div>

        {/* Excel Stats */}
        {excelStats && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Info className="w-5 h-5" />
              Excel File Analysis
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-500">Total Rows Processed</p>
                    <p className="text-xl font-bold text-gray-900">{excelStats.totalRows}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-500">Unique Categories</p>
                    <p className="text-xl font-bold text-gray-900">{excelStats.categories.length}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-500">Unique Brands</p>
                    <p className="text-xl font-bold text-gray-900">{excelStats.brands.length}</p>
                </div>
            </div>
          </div>
        )}

        {/* Upload Stats (Moved into Excel Stats for simplicity in this file) */}
        {/* <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"></div> */}
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Column - Upload & History */}
        <div className="lg:col-span-1 space-y-6">
          {/* Upload Card */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Upload Excel Files
              </h2>
            </div>
            
            <div
              className={`p-8 ${loading ? 'opacity-75' : ''}`}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx,.xls,.csv"
                multiple
                className="hidden"
              />
              
              <div
                onClick={() => !loading && fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  loading 
                    ? 'border-gray-300 bg-gray-50 cursor-not-allowed' 
                    : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                }`}
              >
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                    <p className="text-gray-600">Processing files...</p>
                  </div>
                ) : (
                  <>
                    <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                      <FileText className="w-8 h-8 text-blue-600" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Upload Excel Files
                    </h3>
                    <p className="text-gray-500 mb-4">Drag & drop or click to browse</p>
                    <div className="text-xs text-gray-500 space-y-2">
                    
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Upload History */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Upload History
                {loadingHistory && (
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                )}
              </h3>
              <button
                onClick={loadSavedUploads}
                className="p-2 hover:bg-gray-100 rounded-lg"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            
            <div className="divide-y divide-gray-200 max-h-[400px] overflow-y-auto">
              {savedUploads.length > 0 ? (
                savedUploads.map((upload) => (
                  <div
                    key={upload.id}
                    className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                      selectedUpload === upload.id ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => loadSavedUpload(upload.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-gray-900">
                          {formatDate(upload.uploadedAt)}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          {upload.totalProducts} products
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteUpload(upload.id);
                        }}
                        className="p-1 hover:bg-red-100 rounded text-red-600"
                        title="Delete upload"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3 h-3" />
                        <span>{upload.categories?.length || 0} categories</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <User className="w-3 h-3" />
                        <span>{upload.sellers?.length || 0} sellers</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center">
                  <Cloud className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No saved uploads</p>
                </div>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          {analysis && (
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5" />
                  Quick Stats
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Avg Price</span>
                  <span className="font-semibold">₹{analysis.summary.averagePrice?.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Low Stock</span>
                  <span className="font-semibold text-red-600">{analysis.lowStockVariants.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">With Offers</span>
                  <span className="font-semibold">{analysis.summary.totalVariants - analysis.missingData.offerPrice}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Unique Brands</span>
                  <span className="font-semibold">{Object.keys(analysis.brands).length}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Analysis & Products */}
        <div className="lg:col-span-3 space-y-6">
          {/* Analysis Dashboard */}
          {analysis ? (
            <>
              {/* Search & Filter */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                      <Search className="w-5 h-5" />
                      Product Search
                    </h2>
                    {selectedUpload && (
                      <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                        Loaded from Firebase
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-gray-500">
                    {filteredProducts.length} products • {analysis.summary.totalVariants} variants
                  </span>
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={selectedSKU}
                    onChange={(e) => setSelectedSKU(e.target.value)}
                    placeholder="Search by SKU, Name, Brand, Category..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Detailed Analysis Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Category Distribution */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div 
                    className="p-4 border-b border-gray-200 flex items-center justify-between cursor-pointer"
                    onClick={() => toggleSection('categories')}
                  >
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <Tag className="w-4 h-4" />
                      Categories ({Object.keys(analysis.categories).length})
                    </h3>
                    {expandedSections.categories ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  {expandedSections.categories && (
                    <div className="p-4">
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {Object.entries(analysis.categories).map(([category, count]) => (
                          <div key={category} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 truncate">{category}</span>
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              {count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Brand Distribution */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div 
                    className="p-4 border-b border-gray-200 flex items-center justify-between cursor-pointer"
                    onClick={() => toggleSection('analysis')}
                  >
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <ShoppingBag className="w-4 h-4" />
                      Brands ({Object.keys(analysis.brands).length})
                    </h3>
                    {expandedSections.analysis ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                  {expandedSections.analysis && (
                    <div className="p-4">
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {Object.entries(analysis.brands).slice(0, 8).map(([brand, count]) => (
                          <div key={brand} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 truncate">{brand}</span>
                            <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                              {count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Data Quality */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-4 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4" />
                      Data Quality
                    </h3>
                  </div>
                  <div className="p-4">
                    <div className="space-y-2">
                      {[
                        { key: 'images', label: 'Missing Main Images', color: 'red' },
                        { key: 'seller', label: 'Missing Seller IDs', color: 'red' },
                        { key: 'description', label: 'Missing Descriptions', color: 'yellow' },
                        { key: 'hsnCode', label: 'Missing HSN Codes', color: 'yellow' },
                      ].map((item) => (
                        <div key={item.key} className="flex items-center justify-between text-sm">
                          <span className="text-gray-700">{item.label}</span>
                          <span className={`px-2 py-1 bg-${item.color}-100 text-${item.color}-700 rounded text-xs font-medium`}>
                            {analysis.missingData[item.key]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Products Table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div 
                  className="p-6 border-b border-gray-200 flex items-center justify-between cursor-pointer"
                  onClick={() => toggleSection('products')}
                >
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    Products List ({filteredProducts.length})
                    {selectedSKU && (
                      <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                        Filtered: {selectedSKU}
                      </span>
                    )}
                  </h3>
                  {expandedSections.products ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
                
                {expandedSections.products && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Brand</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Variants</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredProducts.slice(0, 10).map((product, index) => (
                          <tr key={product.baseInfo.sku || index} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                                {product.baseInfo.sku}
                              </code>
                            </td>
                            <td className="px-6 py-4">
                              <div>
                                <p className="font-medium text-gray-900">{product.baseInfo.name}</p>
                                <p className="text-xs text-gray-500">
                                  {product.baseInfo.sellerId?.substring(0, 10)}...
                                </p>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                {product.baseInfo.brand}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className='flex flex-col space-y-1'>
                                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                  {product.baseInfo.category?.name || 'N/A'}
                                </span>
                                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                                  {product.baseInfo.subCategory?.name || 'N/A'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="space-y-1">
                                {product.variants.slice(0, 2).map((variant, vIndex) => (
                                  <div key={vIndex} className="flex items-center gap-2 text-xs">
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded">
                                      {variant.color || '-'}/{variant.size || '-'}
                                    </span>
                                    <span className="font-medium">₹{variant.price}</span>
                                    {variant.offerPrice && (
                                      <span className="text-green-600">₹{variant.offerPrice}</span>
                                    )}
                                  </div>
                                ))}
                                {product.variants.length > 2 && (
                                  <span className="text-xs text-gray-500">
                                    +{product.variants.length - 2} more
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                product.variants.reduce((sum, v) => sum + (v.stock || 0), 0) < 20
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-green-100 text-green-700'
                              }`}>
                                {product.variants.reduce((sum, v) => sum + (v.stock || 0), 0)} units
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    
                    {filteredProducts.length > 10 && (
                      <div className="px-6 py-4 border-t border-gray-200 text-center">
                        <p className="text-sm text-gray-500">
                          Showing 10 of {filteredProducts.length} products
                        </p>
                      </div>
                    )}
                    
                    {filteredProducts.length === 0 && (
                      <div className="px-6 py-8 text-center">
                        <EyeOff className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No products found</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
                <FileText className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Products Uploaded</h3>
              <p className="text-gray-600 mb-6">
                Upload Excel files to import products directly to Firebase
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Upload Excel File
                </button>
                {savedUploads.length > 0 && (
                  <button
                    onClick={() => loadSavedUpload(savedUploads[0].id)}
                    className="px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Load Recent Upload
                  </button>
                )}
              </div>
              
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BulkUpload;