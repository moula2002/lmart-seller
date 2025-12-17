import React, { useState, useEffect } from 'react';
import {
  FiPackage,
  FiCamera,
  FiDollarSign,
  FiTag,
  FiLayers,
  FiDroplet,
  FiPlus,
  FiCheck,
  FiShoppingBag,
  FiX,
  FiRefreshCw,
  FiChevronDown,
  FiFileText,
  FiUpload,
  FiUser,
  FiZap,
  FiVideo,
} from 'react-icons/fi';

import { db, storage, auth } from "../config/firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL
} from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";

// *** REUSABLE KEYWORD GENERATION FUNCTION *** (UNMODIFIED)
const generateSearchKeywords = (product) => {
  const keywords = new Set();
  const lowerName = product.name.toLowerCase();

  // 1. Full/Partial Name
  for (let i = 1; i <= lowerName.length; i++) {
    keywords.add(lowerName.substring(0, i));
  }

  // 2. Split Name/Description by space (for word-level search)
  const nameWords = lowerName.split(/\s+/).filter(word => word.length > 1);
  nameWords.forEach(word => {
    for (let i = 1; i <= word.length; i++) {
      keywords.add(word.substring(0, i));
    }
  });

  const fields = [product.brand, product.sku, product.hsnCode];
  fields.forEach(field => {
    const lowerField = (field || '').toLowerCase().trim();
    if (lowerField) {
      keywords.add(lowerField);
      for (let i = 1; i <= Math.min(lowerField.length, 5); i++) {
        keywords.add(lowerField.substring(0, i));
      }
    }
  });

  if (product.category.name) keywords.add(product.category.name.toLowerCase());
  if (product.subCategory && product.subCategory.name) keywords.add(product.subCategory.name.toLowerCase());

  // 3. Add variant colors/sizes
  const uniqueColors = new Set(product.variants.map(v => v.color).filter(Boolean));
  const uniqueSizes = new Set(product.variants.map(v => v.size).filter(Boolean));

  uniqueColors.forEach(color => keywords.add(color.toLowerCase()));
  uniqueSizes.forEach(size => keywords.add(size.toLowerCase()));

  // 4. Add new productTag (your new field)
  if (product.productTag) keywords.add(product.productTag.toLowerCase());

  return Array.from(keywords).filter(k => k.length > 0 && k.length <= 50);
};

// List of available product tags/labels
const PRODUCT_TAG_OPTIONS = [
  { value: '', label: 'Select Product Label' },
  { value: 'E-Store', label: 'E-Store' },
  { value: 'Local Market', label: 'Local Market' },
  { value: 'Printing', label: 'Printing' },
  { value: 'Oldee', label: 'Oldee' },
];

const AddProduct = () => {
  // --- STATE FOR FETCHED DATA ---
  const [categoriesList, setCategoriesList] = useState([]);
  const [subcategoriesList, setSubcategoriesList] = useState([]);
  const [currentSeller, setCurrentSeller] = useState(null);

  // --- FORM DATA STATE ---
  const [productData, setProductData] = useState({
    name: '',
    description: '',
    sku: '',
    hsnCode: '',
    brand: '',
    category: '',
    subCategory: '',
    sellerId: '',
    productTag: '',
    variants: [],
  });

  // --- VARIANT MANAGEMENT STATE (UNMODIFIED) ---
  const [newVariant, setNewVariant] = useState({
    color: '',
    size: '',
    price: '',
    offerPrice: '',
    stock: '',
  });

  // --- IMAGE & VIDEO MANAGEMENT STATE ---
  const [mainImageFile, setMainImageFile] = useState(null);
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [videoFile, setVideoFile] = useState(null);

  // --- OTHER UTILITY STATES ---
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [message, setMessage] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [newlyAddedProductId, setNewlyAddedProductId] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // Get seller document from Firestore
          const sellerRef = doc(db, 'sellers', user.uid);
          const sellerSnap = await getDoc(sellerRef);

          if (sellerSnap.exists()) {
            const sellerData = { id: sellerSnap.id, ...sellerSnap.data() };
            setCurrentSeller(sellerData);
            setProductData(prev => ({
              ...prev,
              sellerId: sellerData.sellerId || sellerData.id || user.uid,
            }));
          } else {
            setCurrentSeller({ id: user.uid });
            setProductData(prev => ({
              ...prev,
              sellerId: user.uid,
            }));
          }
        } catch (error) {
          console.error("Error fetching seller data:", error);
          // Fallback to auth UID
          setCurrentSeller({ id: user.uid });
          setProductData(prev => ({
            ...prev,
            sellerId: user.uid,
          }));
        }
      } else {
        setCurrentSeller(null);
        setProductData(prev => ({
          ...prev,
          sellerId: ''
        }));
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoadingData(true);
      try {
        const [catSnapshot, subSnap] = await Promise.all([
          getDocs(collection(db, "categories")),
          getDocs(collection(db, "subcategories"))
        ]);

        const fetchedCats = catSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCategoriesList(fetchedCats);

        const fetchedSubCats = subSnap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().subcategory,
          ...doc.data()
        }));
        setSubcategoriesList(fetchedSubCats);
      } catch (err) {
        console.error("Error fetching initial data:", err);
        setMessage("❌ Failed to load categories and subcategories.");
      }
      setLoadingData(false);
    };

    fetchInitialData();
  }, []);

  const filteredCategories = categoriesList.filter(cat =>
    !productData.productTag || (cat.label && cat.label.toLowerCase() === productData.productTag.toLowerCase())
  );

  const filteredSubcategories = subcategoriesList
    .filter(sub =>
      !productData.productTag || (sub.label && sub.label.toLowerCase() === productData.productTag.toLowerCase())
    )
    .filter(sub => !productData.category || sub.categoryId === productData.category);

  // --- PRODUCT & CATEGORY CHANGE HANDLER (UNMODIFIED) ---
  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "productTag") {
      setProductData(prev => ({
        ...prev,
        [name]: value,
        category: '',
        subCategory: '',
      }));
      return;
    }

    if (name === "category") {
      const subsByCat = subcategoriesList.filter(sub => sub.categoryId === value);

      const subsByCatAndLabel = subsByCat.filter(sub =>
        !productData.productTag || (sub.label && productData.productTag && sub.label.toLowerCase() === productData.productTag.toLowerCase())
      );

      const newSubCatId = subsByCatAndLabel.length > 0 ? subsByCatAndLabel[0].id : '';

      setProductData(prev => ({
        ...prev,
        category: value,
        subCategory: newSubCatId,
      }));
    } else {
      setProductData(prev => ({ ...prev, [name]: value }));
    }
  };

  // --- VARIANT LOGIC (UNMODIFIED) ---
  const handleNewVariantChange = (e) => {
    const { name, value } = e.target;
    setNewVariant(prev => ({ ...prev, [name]: value }));
  };

  const handleAddVariant = () => {
    const { color, size, price, offerPrice, stock } = newVariant;
    const cleanColor = color.trim();
    const cleanSize = size.trim().toUpperCase();
    const cleanPrice = price ? parseFloat(price) : 0;
    const cleanOfferPrice = offerPrice ? parseFloat(offerPrice) : null;
    const cleanStock = stock ? parseInt(stock, 10) : 0;

    if (cleanOfferPrice !== null && cleanOfferPrice > 0 && cleanOfferPrice >= cleanPrice) {
      setMessage("❌ Variant Offer Price cannot be greater than or equal to the regular Price.");
      return;
    }

    const exists = productData.variants.some(
      v => v.color.toLowerCase() === cleanColor.toLowerCase() && v.size.toLowerCase() === cleanSize.toLowerCase()
    );

    if (exists && cleanColor && cleanSize) {
      setMessage("❌ A variant with this Color and Size already exists.");
      return;
    }

    if (!cleanColor && !cleanSize && cleanPrice === 0 && cleanStock === 0) {
      setMessage("❌ Please provide at least Color, Size, Price, or Stock to add a variant.");
      return;
    }

    const newVariantObject = {
      variantId: Date.now().toString(),
      color: cleanColor || 'N/A',
      size: cleanSize || 'N/A',
      price: cleanPrice,
      offerPrice: cleanOfferPrice,
      stock: cleanStock,
    };

    setProductData(prev => ({
      ...prev,
      variants: [...prev.variants, newVariantObject],
    }));

    setNewVariant({ color: '', size: '', price: '', offerPrice: '', stock: '' });
    setMessage("✅ New variant added successfully.");
  };

  const removeVariant = (variantId) => {
    setProductData(prev => ({
      ...prev,
      variants: prev.variants.filter(v => v.variantId !== variantId),
    }));
    setMessage("✅ Variant removed.");
  };

  const availableColors = Array.from(new Set(productData.variants.map(v => v.color))).filter(c => c.trim() !== '' && c.trim() !== 'N/A');

  // --- IMAGE MANAGEMENT LOGIC ---
  const handleMainImageChange = (e) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file) {
      // Revoke old URL if replacing
      if (mainImageFile && mainImageFile.url) URL.revokeObjectURL(mainImageFile.url);

      setMainImageFile({
        file: file,
        url: URL.createObjectURL(file),
        name: file.name,
        id: `main-${Date.now()}`
      });
      setMessage(`✅ Main Image uploaded: ${file.name}.`);
    } else {
      setMainImageFile(null);
    }
    e.target.value = null;
  };

  const handleGalleryImageChange = (e) => {
    const files = Array.from(e.target.files || []);

    const newImages = files.map(file => ({
      file: file,
      url: URL.createObjectURL(file),
      color: '',
      name: file.name,
      id: `gallery-${Date.now()}-${Math.random()}`
    }));

    const uniqueNewImages = newImages.filter(newImg =>
      !galleryFiles.some(existingImg => existingImg.name === newImg.name && existingImg.file.size === newImg.file.size)
    );

    setGalleryFiles(prev => [...prev, ...uniqueNewImages]);
    setMessage(`✅ Added ${uniqueNewImages.length} gallery image(s).`);
    e.target.value = null;
  };

  const handleColorChangeOnImage = (id, newColor) => {
    setGalleryFiles(prev =>
      prev.map(img =>
        img.id === id ? { ...img, color: newColor } : img
      )
    );
  };

  const removeMainImage = () => {
    if (mainImageFile && mainImageFile.url) URL.revokeObjectURL(mainImageFile.url);
    setMainImageFile(null);
    if (document.getElementById("mainImageFile")) document.getElementById("mainImageFile").value = "";
    setMessage("✅ Main Image removed.");
  };

  const removeGalleryImage = (idToRemove) => {
    const imageObject = galleryFiles.find(p => p.id === idToRemove);
    if (imageObject && imageObject.url) URL.revokeObjectURL(imageObject.url);
    setGalleryFiles(prevFiles => prevFiles.filter(p => p.id !== idToRemove));
    setMessage("✅ Gallery image removed.");
  };

  // --- Video Management Logic ---
  const handleVideoChange = (e) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file) {
      // Revoke old URL if replacing
      if (videoFile && videoFile.url) URL.revokeObjectURL(videoFile.url);

      setVideoFile({
        file: file,
        url: URL.createObjectURL(file),
        name: file.name,
        id: `video-${Date.now()}`
      });
      setMessage(`✅ Product Video uploaded: ${file.name}.`);
    } else {
      setVideoFile(null);
    }
    e.target.value = null;
  };

  const removeVideo = () => {
    if (videoFile && videoFile.url) URL.revokeObjectURL(videoFile.url);
    setVideoFile(null);
    if (document.getElementById("videoFile")) document.getElementById("videoFile").value = "";
    setMessage("✅ Product Video removed.");
  };

  // --- FORM RESET FUNCTION ---
  const resetForm = () => {
    setProductData({
      name: '',
      description: '',
      sku: '',
      hsnCode: '',
      brand: '',
      category: '',
      subCategory: '',
      sellerId: currentSeller?.sellerId || currentSeller?.id || '',
      productTag: '',
      variants: [],
    });
    setNewVariant({ color: '', size: '', price: '', offerPrice: '', stock: '' });

    // Revoke object URLs before clearing state
    if (mainImageFile && mainImageFile.url) URL.revokeObjectURL(mainImageFile.url);
    galleryFiles.forEach(img => URL.revokeObjectURL(img.url));
    if (videoFile && videoFile.url) URL.revokeObjectURL(videoFile.url);

    setMainImageFile(null);
    setGalleryFiles([]);
    setVideoFile(null);
    setMessage('');
    setNewlyAddedProductId('');
  }

  // --- MODAL HANDLERS ---
  const handleModalClose = (shouldReset) => {
    setShowSuccessModal(false);
    setMessage('');
    if (shouldReset) {
      resetForm();
    }
  }

  // --- SUBMIT HANDLER ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setLoading(true);

    try {
      let imageUrls = [];
      let mainDownloadURL = '';
      let videoDownloadURL = '';

      // A. Main Image Upload
      if (mainImageFile) {
        const mainFile = mainImageFile.file;
        const mainFileName = `products/${Date.now()}_main_${mainFile.name}`;
        const mainStorageRef = ref(storage, mainFileName);
        await uploadBytes(mainStorageRef, mainFile);
        mainDownloadURL = await getDownloadURL(mainStorageRef);

        imageUrls.push({
          url: mainDownloadURL,
          name: mainFile.name,
          path: mainFileName,
          type: 'file',
          isMain: true,
          color: '',
        });
      }

      // B. Gallery Images Upload
      for (const imageObject of galleryFiles) {
        const galleryFile = imageObject.file;
        const galleryFileName = `products/${Date.now()}_gallery_${galleryFile.name}`;
        const galleryStorageRef = ref(storage, galleryFileName);
        await uploadBytes(galleryStorageRef, galleryFile);
        const galleryDownloadURL = await getDownloadURL(galleryStorageRef);

        imageUrls.push({
          url: galleryDownloadURL,
          name: galleryFile.name,
          path: galleryFileName,
          type: 'file',
          isMain: false,
          color: imageObject.color,
        });
      }

      // C. Video Upload
      if (videoFile) {
        const file = videoFile.file;
        const fileName = `products/${Date.now()}_video_${file.name}`;
        const storageRef = ref(storage, fileName);
        await uploadBytes(storageRef, file);
        videoDownloadURL = await getDownloadURL(storageRef);
      }

      // --- 4. PREPARE DATA FOR FIRESTORE ---
      const selectedCategory = categoriesList.find(cat => cat.id === productData.category);
      const selectedSubCategory = subcategoriesList.find(sub => sub.id === productData.subCategory);

      const tempProductForKeywords = {
        ...productData,
        category: {
          id: productData.category || '',
          name: selectedCategory ? selectedCategory.name : 'Unknown',
        },
        subCategory: productData.subCategory ? {
          id: productData.subCategory,
          name: selectedSubCategory ? selectedSubCategory.name : 'N/A',
        } : null,
      };
      const sellerId = currentSeller?.sellerId || currentSeller?.id || productData.sellerId;

      const productToSave = {
        name: productData.name || '',
        description: productData.description || '',
        sku: productData.sku || '',
        hsnCode: productData.hsnCode || '',
        brand: productData.brand || '',
        category: tempProductForKeywords.category,
        subCategory: tempProductForKeywords.subCategory,

        // Save seller ID in multiple fields for compatibility
        sellerId: sellerId,
        sellerid: sellerId,
        sellerID: sellerId,
      
        productTag: productData.productTag || '',
        variants: productData.variants,

        imageUrls: imageUrls,
        mainImageUrl: mainDownloadURL,
        videoUrl: videoDownloadURL,

        searchKeywords: generateSearchKeywords(tempProductForKeywords),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'Active',
      };

      // --- 5. SAVE TO FIRESTORE ---
      const docRef = await addDoc(collection(db, "products"), productToSave);
      
      // Create the complete product object with ID
      const newProduct = {
        id: docRef.id,
        ...productToSave
      };

      // --- 6. DISPATCH EVENT TO UPDATE SELLERPRODUCTS ---
      const newProductEvent = new CustomEvent('newProductAdded', {
        detail: {
          type: 'NEW_PRODUCT_ADDED',
          product: newProduct
        }
      });
      window.dispatchEvent(newProductEvent);

      // --- 7. CLEANUP AND SUCCESS ---
      setNewlyAddedProductId(docRef.id);
      setShowSuccessModal(true);

    } catch (error) {
      console.error("Firebase submission error:", error);
      setMessage(`❌ Failed to add product: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isFormDisabled = loading || loadingData;
  const isSuccess = message.startsWith("✅");
  const messageClass = isSuccess
    ? "bg-gradient-to-r from-green-50 to-green-100 border-l-4 border-green-500 text-green-700"
    : "bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-500 text-red-700";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">

        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-gray-900 flex items-center justify-center space-x-3">
            <FiShoppingBag className="w-8 h-8 text-blue-600" />
            <span>Add New Product</span>
          </h1>
          <p className="text-gray-500 mt-2">Enter the details, variants, and media for the new product listing.</p>
          {productData.sellerId && (
            <div className="mt-2 inline-flex items-center bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
              <FiUser className="w-3 h-3 mr-1" />
              Seller ID: {productData.sellerId}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {loadingData && (
            <div className="p-4 flex items-center bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700">
              <FiRefreshCw className="w-5 h-5 animate-spin mr-3" />
              <span className="font-medium">Loading initial setup data...</span>
            </div>
          )}

          {message && (
            <div className={`p-4 flex items-center ${messageClass}`}>
              {isSuccess ? <FiCheck className="w-5 h-5 mr-3" /> : <FiX className="w-5 h-5 mr-3" />}
              <span className="font-medium">{message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-8 space-y-8">

            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                <FiPackage className="w-6 h-6 mr-3 text-blue-600" />
                Basic Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <input
                  type="text"
                  name="name"
                  value={productData.name}
                  onChange={handleChange}
                  placeholder="Product Name"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-lg"
                  disabled={isFormDisabled}
                  required
                />

                <div className="relative">
                  <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    name="sellerId"
                    value={productData.sellerId}
                    readOnly
                    placeholder="Seller ID"
                    className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50 text-gray-700 cursor-not-allowed"
                    disabled={true}
                  />
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-500 font-medium">
                    Auto-filled
                  </span>
                </div>

                <div className="hidden md:block"></div>
              </div>
            </div>

            {/* PRODUCT DESCRIPTION (UNMODIFIED) */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                <FiFileText className="w-6 h-6 mr-3 text-red-600" />
                Product Description
              </h3>
              <textarea
                name="description"
                value={productData.description}
                onChange={handleChange}
                placeholder="Detailed description of the product..."
                rows="4"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all duration-200"
                disabled={isFormDisabled}
              />
            </div>

            {/* MAIN MEDIA UPLOAD SECTION */}
            <div className="space-y-6 border p-6 rounded-xl bg-violet-50 border-violet-200">
              <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                <FiCamera className="w-6 h-6 mr-3 text-violet-600" />
                Product Image
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* 1. Main Image Control or Preview */}
                <div className="h-30">
                  {!mainImageFile ? (
                    <div className="h-full border-2 border-dashed border-pink-300 rounded-xl p-4 text-center hover:border-pink-500 transition-colors duration-200 bg-white flex flex-col justify-center">
                      <FiUpload className="w-6 h-6 text-pink-400 mx-auto mb-2" />
                      <label htmlFor="mainImageFile" className="cursor-pointer">
                        <span className="text-md font-medium text-gray-700 block mb-1">Upload Main Product Image</span>
                        <p className="text-gray-500 text-xs">(Recommended)</p>
                        <input
                          type="file"
                          id="mainImageFile"
                          accept="image/*"
                          onChange={handleMainImageChange}
                          className="hidden"
                          disabled={isFormDisabled}
                        />
                      </label>
                    </div>
                  ) : (
                    <div
                      key={mainImageFile.id}
                      className="relative rounded-xl overflow-hidden shadow-lg border-4 border-yellow-500 h-full w-full bg-gray-50 flex items-center justify-center"
                    >
                      <img
                        src={mainImageFile.url}
                        alt={mainImageFile.name}
                        className="w-full h-full object-contain"
                      />

                      <button
                        type="button"
                        onClick={removeMainImage}
                        className="absolute top-2 right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-20"
                        title="Remove Main Image"
                        disabled={isFormDisabled}
                      >
                        <FiX className="w-3 h-3" />
                      </button>

                      <label
                        htmlFor="mainImageFile"
                        className="absolute bottom-2 left-2 bg-blue-600 text-white p-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors z-20 cursor-pointer flex items-center space-x-1"
                        title="Replace Image"
                      >
                        <FiUpload className="w-4 h-4" />
                        <span className="text-xs font-medium hidden sm:inline">Replace</span>
                        <input
                          type="file"
                          id="mainImageFile"
                          accept="image/*"
                          onChange={handleMainImageChange}
                          className="hidden"
                          disabled={isFormDisabled}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* 2. Video Upload Control or Preview */}
                <div className="h-30">
                  {!videoFile ? (
                    <div className="h-full border-2 border-dashed border-violet-300 rounded-xl p-4 text-center hover:border-violet-500 transition-colors duration-200 bg-white flex flex-col justify-center">
                      <FiVideo className="w-6 h-6 text-violet-400 mx-auto mb-2" />
                      <label htmlFor="videoFile" className="cursor-pointer">
                        <span className="text-md font-medium text-gray-700 block mb-1">Upload Product Video</span>
                        <p className="text-gray-500 text-xs">(Max 1 file)</p>
                        <input
                          type="file"
                          id="videoFile"
                          accept="video/*"
                          onChange={handleVideoChange}
                          className="hidden"
                          disabled={isFormDisabled}
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="p-3 border-4 border-violet-500 rounded-xl bg-white flex flex-col h-full shadow-lg justify-center relative">
                      <FiVideo className="w-6 h-6 text-violet-600 flex-shrink-0 mx-auto mb-1" />
                      <p className="font-semibold text-gray-800 truncate text-center text-sm" title={videoFile.name}>{videoFile.name}</p>
                      <p className="text-xs text-gray-500 text-center">Video Ready</p>

                      <button
                        type="button"
                        onClick={removeVideo}
                        className="absolute top-2 right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-20"
                        disabled={isFormDisabled}
                        title="Remove Video"
                      >
                        <FiX className="w-3 h-3" />
                      </button>

                      <label
                        htmlFor="videoFile"
                        className="absolute bottom-2 left-2 bg-blue-600 text-white p-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors z-20 cursor-pointer flex items-center space-x-1"
                        title="Replace Video"
                      >
                        <FiUpload className="w-4 h-4" />
                        <span className="text-xs font-medium hidden sm:inline">Replace</span>
                        <input
                          type="file"
                          id="videoFile"
                          accept="video/*"
                          onChange={handleVideoChange}
                          className="hidden"
                          disabled={isFormDisabled}
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* GALLERY IMAGE UPLOAD & PREVIEWS */}
            <div className="space-y-6 border p-6 rounded-xl bg-pink-50 border-pink-200">
              <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                <FiCamera className="w-6 h-6 mr-3 text-pink-600" />
                Gallery Images
              </h3>

              {availableColors.length === 0 && (
                <div className="p-3 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700">
                  <p className="font-semibold">ℹ️ Note:</p>
                  <p className="text-sm">Adding a Color to a Product Variant will enable the color assignment dropdown for images.</p>
                </div>
              )}

              {/* Gallery Images Control */}
              {galleryFiles.length === 0 ? (
                <div className="border-2 border-dashed border-blue-400 rounded-xl p-6 text-center hover:border-blue-600 transition-colors duration-200 bg-white" style={{ borderColor: '#81b2f7', borderStyle: 'dashed' }}>
                  <FiCamera className="w-8 h-8 text-blue-500 mx-auto mb-3" />
                  <label htmlFor="galleryImages" className="cursor-pointer">
                    <span className="text-lg font-semibold text-gray-700 block mb-1">Upload Gallery Images (N number)</span>
                    <p className="text-gray-500 text-md">(Optional Color Assignment)</p>
                    <input
                      type="file"
                      id="galleryImages"
                      multiple
                      accept="image/*"
                      onChange={handleGalleryImageChange}
                      className="hidden"
                      disabled={isFormDisabled}
                    />
                  </label>
                </div>
              ) : (
                <div className="mt-0 p-4 border border-gray-300 rounded-lg bg-white">
                  <p className="text-sm font-bold text-gray-700 mb-3 flex justify-between items-center">
                    <span>Gallery Image Previews ({galleryFiles.length}):</span>
                    <label htmlFor="galleryImages" className="cursor-pointer text-blue-600 hover:text-blue-800 text-sm font-semibold flex items-center space-x-1">
                      <FiPlus className="w-4 h-4" /> 
                      <span>Add More</span>
                      <input
                        type="file"
                        id="galleryImages"
                        multiple
                        accept="image/*"
                        onChange={handleGalleryImageChange}
                        className="hidden"
                        disabled={isFormDisabled}
                      />
                    </label>
                  </p>
                  <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                    {galleryFiles.map((image) => (
                      <div
                        key={image.id}
                        className={`relative rounded-lg overflow-hidden shadow-md group border-2 ${image.color ? 'border-green-500' : 'border-gray-300'}`}
                      >
                        <img
                          src={image.url}
                          alt={image.name}
                          className="w-full h-20 object-cover"
                        />

                        <span className="absolute top-0 left-0 text-white text-xs font-bold px-2 py-1 rounded-br-lg z-10 bg-pink-600">
                          GALLERY
                        </span>

                        <button
                          type="button"
                          onClick={() => removeGalleryImage(image.id)}
                          className="absolute top-1 right-1 bg-red-500 text-white w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50 z-20"
                          title="Remove Image"
                          disabled={isFormDisabled}
                        >
                          <FiX className="w-3 h-3" />
                        </button>

                        {/* Color Assignment Dropdown */}
                        <div className="p-1 bg-gray-50 border-t border-gray-200">
                          <div className="relative">
                            <FiChevronDown className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3 pointer-events-none" />
                            <select
                              value={image.color || ''}
                              onChange={(e) => handleColorChangeOnImage(image.id, e.target.value)}
                              className={`appearance-none w-full text-xs py-1 pl-1 pr-4 border rounded ${image.color ? 'border-green-400 text-green-700' : 'border-gray-400 text-gray-700'}`}
                              disabled={isFormDisabled || availableColors.length === 0}
                              title={image.color ? `Color: ${image.color}` : 'Assign Color'}
                            >
                              <option value="">-- Assign Color (Optional) --</option>
                              {availableColors.map(color => (
                                <option key={color} value={color}>
                                  {color}
                                </option>
                              ))}
                            </select>
                          </div>
                          <p className="text-xs text-gray-600 truncate pt-1 font-medium" title={image.name}>
                            {image.name}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* PRODUCT DETAILS (IDENTIFIERS) */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                <FiTag className="w-6 h-6 mr-3 text-purple-600" />
                Product Identifiers
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <input
                  type="text"
                  name="sku"
                  value={productData.sku}
                  onChange={handleChange}
                  placeholder="SKU Code"
                  className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
                  disabled={isFormDisabled}
                />
                <input
                  type="text"
                  name="brand"
                  value={productData.brand}
                  onChange={handleChange}
                  placeholder="Brand Name"
                  className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
                  disabled={isFormDisabled}
                />
                <input
                  type="text"
                  name="hsnCode"
                  value={productData.hsnCode}
                  onChange={handleChange}
                  placeholder="HSN Code"
                  className="px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200"
                  disabled={isFormDisabled}
                />
              </div>
            </div>

            {/* CATEGORY SELECTION */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                <FiLayers className="w-6 h-6 mr-3 text-green-600" />
                Category Selection
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                {/* 1. Product Label Select */}
                <div className="relative">
                  <FiTag className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <FiChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                  <select
                    name="productTag"
                    value={productData.productTag}
                    onChange={handleChange}
                    className="appearance-none w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all duration-200"
                    disabled={isFormDisabled}
                  >
                    <option value="" disabled={false}>Select Product Label</option>
                    {PRODUCT_TAG_OPTIONS.map(option => (
                      <option key={option.value} value={option.value} disabled={false}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Category Select */}
                <div className="relative">
                  <FiChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                  <select
                    name="category"
                    value={productData.category}
                    onChange={handleChange}
                    className="appearance-none w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200"
                    disabled={isFormDisabled || filteredCategories.length === 0}
                  >
                    <option value="">Select Category</option>
                    {filteredCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                {/* 3. SubCategory Select */}
                <div className="relative">
                  <FiChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                  <select
                    name="subCategory"
                    value={productData.subCategory}
                    onChange={handleChange}
                    className="appearance-none w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200"
                    disabled={isFormDisabled || filteredSubcategories.length === 0}
                  >
                    <option value="">Select Subcategory</option>
                    {filteredSubcategories.map(subCat => (
                      <option key={subCat.id} value={subCat.id}>{subCat.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* PRODUCT VARIANT MANAGEMENT */}
            <div className="space-y-6 border p-6 rounded-xl bg-orange-50 border-orange-200">
              <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                <FiDroplet className="w-6 h-6 mr-3 text-orange-600" />
                Product Variants (Color, Size, Price, Stock)
              </h3>

              {/* Variant Input Form */}
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end border-b pb-4 mb-4">
                <input
                  type="text"
                  name="color"
                  value={newVariant.color}
                  onChange={handleNewVariantChange}
                  placeholder="Color"
                  className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                  disabled={isFormDisabled}
                />
                <input
                  type="text"
                  name="size"
                  value={newVariant.size}
                  onChange={handleNewVariantChange}
                  placeholder="Size"
                  className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                  disabled={isFormDisabled}
                />
                <div className="relative col-span-2 md:col-span-1">
                  <FiDollarSign className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="number"
                    name="price"
                    value={newVariant.price}
                    onChange={handleNewVariantChange}
                    placeholder="Price (₹)"
                    min="0"
                    step="0.01"
                    className="w-full pl-8 pr-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                    disabled={isFormDisabled}
                  />
                </div>
                <div className="relative col-span-2 md:col-span-1">
                  <FiZap className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="number"
                    name="offerPrice"
                    value={newVariant.offerPrice}
                    onChange={handleNewVariantChange}
                    placeholder="Offer (₹)"
                    min="0"
                    step="0.01"
                    className="w-full pl-8 pr-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                    disabled={isFormDisabled}
                  />
                </div>
                <input
                  type="number"
                  name="stock"
                  value={newVariant.stock}
                  onChange={handleNewVariantChange}
                  placeholder="Stock"
                  min="0"
                  className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500"
                  disabled={isFormDisabled}
                />
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center justify-center space-x-1"
                  disabled={isFormDisabled}
                >
                  <FiPlus className="w-4 h-4" />
                  <span className="hidden md:inline">Add</span>
                </button>
              </div>

              {/* Variant List */}
              {productData.variants.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-sm font-semibold text-gray-700">Current Variants ({productData.variants.length})</h4>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-5 md:grid-cols-6 text-xs font-bold text-gray-600 bg-gray-100 p-2">
                      <span className="col-span-1">Color</span>
                      <span className="col-span-1">Size</span>
                      <span className="col-span-1">Price</span>
                      <span className="col-span-1">Offer Price</span>
                      <span className="col-span-1">Stock</span>
                      <span className="col-span-1 text-right">Action</span>
                    </div>
                    {productData.variants.map((v) => (
                      <div key={v.variantId} className="grid grid-cols-5 md:grid-cols-6 text-sm p-2 border-t border-gray-200 hover:bg-white transition-colors items-center">
                        <span className="col-span-1 font-medium">{v.color}</span>
                        <span className="col-span-1 font-medium">{v.size}</span>
                        <span className="col-span-1">₹{v.price.toFixed(2)}</span>
                        <span className="col-span-1 text-red-600">{v.offerPrice ? `₹${v.offerPrice.toFixed(2)}` : '-'}</span>
                        <span className="col-span-1">{v.stock}</span>
                        <span className="col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => removeVariant(v.variantId)}
                            className="text-red-500 hover:text-red-700 p-1 rounded disabled:opacity-50"
                            disabled={isFormDisabled}
                          >
                            <FiX className="w-4 h-4" />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SUBMIT BUTTON */}
            <button
              type="submit"
              disabled={isFormDisabled}
              className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl shadow-lg font-semibold text-lg transition-all duration-200 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-3"
            >
              {loading ? (
                <>
                  <FiRefreshCw className="w-5 h-5 animate-spin" />
                  <span>Processing & Uploading...</span>
                </>
              ) : (
                <>
                  <FiPlus className="w-6 h-6" />
                  <span>Add Product to Database</span>
                </>
              )}
            </button>

          </form>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-8 space-y-6 transform transition-all duration-300 scale-100">
            <div className="text-center">
              <FiCheck className="w-12 h-12 text-green-500 mx-auto mb-4 bg-green-100 p-2 rounded-full" />
              <h3 className="text-2xl font-bold text-gray-900">Product Added Successfully!</h3>
              <p className="mt-2 text-gray-600">
                Your product, {productData.name || 'Untitled Product'}, has been successfully uploaded and saved to the database.
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Product ID: <span className="font-mono bg-gray-100 p-1 rounded text-xs">{newlyAddedProductId}</span>
              </p>
              <p className="mt-2 text-sm text-blue-600">
                Seller ID: <span className="font-mono bg-blue-100 p-1 rounded">{productData.sellerId}</span>
              </p>
              <p className="mt-3 text-sm text-green-600 font-medium">
                The product will now appear in your inventory list.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
              <button
                type="button"
                onClick={() => handleModalClose(true)}
                className="flex-1 py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
              >
                <FiPlus className="inline w-5 h-5 mr-1" /> Add Another Product
              </button>
              <button
                type="button"
                onClick={() => handleModalClose(false)}
                className="flex-1 py-3 px-4 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AddProduct;