import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FiPackage, FiCamera, FiDollarSign, FiTag, FiLayers, FiDroplet,
  FiPlus, FiCheck, FiShoppingBag, FiX, FiRefreshCw, FiChevronDown,
  FiFileText, FiUpload, FiUser, FiZap, FiVideo, FiEdit, FiTrash2,
  FiSave, FiArrowLeft, FiImage, FiCloud, FiAlertCircle, FiGrid
} from 'react-icons/fi';

import { db, storage } from "../config/firebase";
import {
  collection, doc, getDoc, updateDoc, serverTimestamp, getDocs,
} from "firebase/firestore";
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "firebase/storage";

// Reusable functions
const normalizeImages = (imageUrls, mainImageUrl) => {
  if (Array.isArray(imageUrls) && imageUrls.length > 0 && typeof imageUrls[0] === 'object') {
    return imageUrls;
  }
  
  if (Array.isArray(imageUrls) && imageUrls.length > 0 && typeof imageUrls[0] === 'string') {
    return imageUrls.map((url, index) => ({
      url: url,
      isMain: index === 0 && !mainImageUrl,
      color: "",
      name: `image-${index + 1}`,
      path: "",
      type: "file",
      isExisting: true
    }));
  }

  if (mainImageUrl) {
    return [{
      url: mainImageUrl,
      isMain: true,
      color: "",
      name: "main-image",
      path: "",
      type: "file",
      isExisting: true,
    }];
  }

  return [];
};

const generateSearchKeywords = (product) => {
  const keywords = new Set();
  const lowerName = product.name.toLowerCase();
  
  for (let i = 1; i <= lowerName.length; i++) {
    keywords.add(lowerName.substring(0, i));
  }
  
  const nameWords = lowerName.split(/\s+/).filter(word => word.length > 1);
  nameWords.forEach(word => {
    for (let i = 1; i <= word.length; i++) {
      keywords.add(word.substring(0, i));
    }
  });

  const fields = [product.brand, product.sku, product.hsnCode];
  fields.forEach(field => {
    const lowerField = String(field || '').toLowerCase().trim();
    if (lowerField) {
      keywords.add(lowerField);
      for (let i = 1; i <= Math.min(lowerField.length, 5); i++) {
        keywords.add(lowerField.substring(0, i));
      }
    }
  });

  if (product.category?.name) keywords.add(product.category.name.toLowerCase());
  if (product.subCategory?.name) keywords.add(product.subCategory.name.toLowerCase());

  const uniqueColors = new Set(product.variants?.map(v => v.color).filter(Boolean) || []);
  const uniqueSizes = new Set(product.variants?.map(v => v.size).filter(Boolean) || []);
  
  uniqueColors.forEach(color => keywords.add(color.toLowerCase()));
  uniqueSizes.forEach(size => keywords.add(size.toLowerCase()));
  
  if (product.productTag) keywords.add(product.productTag.toLowerCase());

  return Array.from(keywords).filter(k => k.length > 0 && k.length <= 50);
};

const PRODUCT_TAG_OPTIONS = [
 
  { value: 'E-Store', label: 'E-Store' },
  { value: 'Local Market', label: 'Local Market' },
  { value: 'Printing', label: 'Printing' },
];

const EditProduct = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  
  // State
  const [categoriesList, setCategoriesList] = useState([]);
  const [subcategoriesList, setSubcategoriesList] = useState([]);
  const [existingProduct, setExistingProduct] = useState(null);

  // Form Data State
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
    existingImages: [],
    existingVideo: null,
    existingMainImage: null
  });

  // Variant Management
  const [newVariant, setNewVariant] = useState({
    color: '',
    size: '',
    price: '',
    offerPrice: '',
    stock: '',
  });

  // Inline Edit State
  const [editingVariant, setEditingVariant] = useState({
    id: null,
    field: null,
    value: ''
  });

  // Media Management
  const [mainImageFile, setMainImageFile] = useState(null);
  const [galleryFiles, setGalleryFiles] = useState([]);
  const [videoFile, setVideoFile] = useState(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // Media to Delete
  const [imagesToDelete, setImagesToDelete] = useState([]);
  const [videoToDelete, setVideoToDelete] = useState(null);

  // Loading States
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [message, setMessage] = useState('');
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Fetch Product Data and Categories
  useEffect(() => {
    const fetchProductData = async () => {
      setLoading(true);
      try {
        const productDoc = await getDoc(doc(db, "products", productId));
        
        if (!productDoc.exists()) {
          setMessage("❌ Product not found");
          navigate('/products');
          return;
        }

        const productData = productDoc.data();
        setExistingProduct({ id: productDoc.id, ...productData });

        // Fetch categories and subcategories
        const [catSnapshot, subSnap] = await Promise.all([
          getDocs(collection(db, "categories")),
          getDocs(collection(db, "subcategories"))
        ]);
        
        const fetchedCats = catSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setCategoriesList(fetchedCats);

        const fetchedSubCats = subSnap.docs.map(doc => ({
          id: doc.id,
          name: doc.data().subcategory,
          categoryId: doc.data().categoryId,
          label: doc.data().label || '',
          ...doc.data()
        }));
        setSubcategoriesList(fetchedSubCats);

        // Normalize images
        let normalizedImages = [];
        if (productData.imageUrls && Array.isArray(productData.imageUrls)) {
          if (typeof productData.imageUrls[0] === 'string') {
            normalizedImages = productData.imageUrls.map((url, index) => ({
              url: url,
              isMain: index === 0 && !productData.mainImageUrl,
              color: '',
              name: `image-${index + 1}`,
              path: '',
              type: 'file',
              isExisting: true,
              id: `existing-${Date.now()}-${index}`
            }));
          } else {
            normalizedImages = productData.imageUrls.map((img, index) => ({
              ...img,
              id: img.id || `existing-${Date.now()}-${index}`,
              isExisting: true
            }));
          }
        }

        const mainImage = normalizedImages.find(img => img.isMain) || 
          (productData.mainImageUrl ? {
            url: productData.mainImageUrl,
            path: '',
            name: 'Main Image',
            id: 'existing-main',
            isMain: true,
            isExisting: true
          } : null);

        // Set product data - AUTO POPULATE CATEGORY
        setProductData({
          name: productData.name || '',
          description: productData.description || '',
          sku: productData.sku || '',
          hsnCode: productData.hsnCode || '',
          brand: productData.brand || '',
          category: productData.category?.id || '',
          subCategory: productData.subCategory?.id || '',
          sellerId: productData.sellerId || '',
          productTag: productData.productTag || '',
          variants: productData.variants || [],
          existingImages: normalizedImages,
          existingVideo: productData.videoUrl ? {
            url: productData.videoUrl,
            path: productData.videoPath || '',
            name: 'Existing Video',
            id: 'existing-video',
            isExisting: true
          } : null,
          existingMainImage: mainImage
        });

        // Set gallery images
        const galleryImages = normalizedImages
          .filter(img => !img.isMain)
          .map((img, index) => ({
            ...img,
            id: img.id || `existing-gallery-${Date.now()}-${index}`,
            isExisting: true,
            color: img.color || ''
          }));
        
        setGalleryFiles(galleryImages);

      } catch (err) {
        console.error("Error fetching product data:", err);
        setMessage("❌ Failed to load product data");
      } finally {
        setLoading(false);
      }
    };

    fetchProductData();
  }, [productId, navigate]);

  // AUTO-SELECT CATEGORY WHEN CATEGORIES ARE LOADED
  useEffect(() => {
    if (existingProduct && categoriesList.length > 0) {
      // If product has a category but it's not set in productData, set it
      if (existingProduct.category?.id && !productData.category) {
        setProductData(prev => ({
          ...prev,
          category: existingProduct.category.id,
          subCategory: existingProduct.subCategory?.id || ''
        }));
      }
    }
  }, [existingProduct, categoriesList, productData.category]);

  // Filter categories
 const filteredCategories = categoriesList.filter(cat => {
  if (!productData.productTag) return true;
  if (!cat.label) return true; // IMPORTANT
  return cat.label.toLowerCase().includes(productData.productTag.toLowerCase());
});

const filteredSubcategories = subcategoriesList.filter(sub => {
  if (productData.category && sub.categoryId !== productData.category) return false;
  if (!productData.productTag) return true;
  if (!sub.label) return true;
  return sub.label.toLowerCase().includes(productData.productTag.toLowerCase());
});

useEffect(() => {
  if (!existingProduct) return;
  if (!categoriesList.length || !subcategoriesList.length) return;

  setProductData(prev => ({
    ...prev,
    category: existingProduct.category?.id || '',
    subCategory: existingProduct.subCategory?.id || ''
  }));
}, [existingProduct, categoriesList, subcategoriesList]);

  // Helper function to safely trim values
  const safeTrim = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return String(value);
    return String(value).trim();
  };

  // Handlers
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

  // Variant Functions
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

  // Inline Edit Functions
  const startInlineEdit = (variantId, field, currentValue) => {
    setEditingVariant({
      id: variantId,
      field: field,
      value: field === 'price' || field === 'offerPrice' 
        ? currentValue.toString() 
        : currentValue
    });
  };

  const saveInlineEdit = () => {
    if (!editingVariant.id || !editingVariant.field) return;

    let newValue = editingVariant.value;
    
    // Convert to appropriate type
    if (editingVariant.field === 'price' || editingVariant.field === 'offerPrice') {
      newValue = parseFloat(newValue) || 0;
    } else if (editingVariant.field === 'stock') {
      newValue = parseInt(newValue) || 0;
    }

    setProductData(prev => ({
      ...prev,
      variants: prev.variants.map(variant => 
        variant.variantId === editingVariant.id 
          ? { ...variant, [editingVariant.field]: newValue }
          : variant
      )
    }));

    setEditingVariant({ id: null, field: null, value: '' });
    setMessage(`✅ ${editingVariant.field} updated successfully.`);
  };

  const cancelInlineEdit = () => {
    setEditingVariant({ id: null, field: null, value: '' });
  };

  const handleInlineEditChange = (e) => {
    setEditingVariant(prev => ({ ...prev, value: e.target.value }));
  };

  const handleInlineEditKeyPress = (e) => {
    if (e.key === 'Enter') {
      saveInlineEdit();
    } else if (e.key === 'Escape') {
      cancelInlineEdit();
    }
  };

  const availableColors = Array.from(new Set(productData.variants.map(v => v.color))).filter(c => c.trim() !== '' && c.trim() !== 'N/A');

  // Image Management Functions
  const handleMainImageChange = (e) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file) {
      if (productData.existingMainImage?.path) {
        setImagesToDelete(prev => [...prev, productData.existingMainImage.path]);
      }
      
      if (mainImageFile && mainImageFile.url) URL.revokeObjectURL(mainImageFile.url);

      setMainImageFile({
        file: file,
        url: URL.createObjectURL(file),
        name: file.name,
        id: `main-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      });
      setMessage(`✅ Main Image uploaded: ${file.name}.`);
    } else {
      setMainImageFile(null);
    }
    e.target.value = null;
  };

  const handleGalleryImageChange = async (e) => {
    const files = Array.from(e.target.files || []);
    
    if (files.length === 0) return;

    setUploadingImages(true);
    setUploadProgress(0);

    const newImages = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      
      const uniqueId = `gallery-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 9)}`;
      const previewUrl = URL.createObjectURL(file);
      
      newImages.push({
        file: file,
        url: previewUrl,
        color: '',
        name: file.name,
        id: uniqueId,
        size: file.size,
        type: file.type,
        isExisting: false,
        isUploaded: false
      });
    }

    const uniqueNewImages = newImages.filter(newImg => {
      const isDuplicate = galleryFiles.some(existingImg => {
        const sameName = existingImg.name === newImg.name;
        const sameSize = existingImg.size === newImg.size;
        return sameName && sameSize;
      });
      return !isDuplicate;
    });

    if (uniqueNewImages.length === 0) {
      setMessage("⚠️ All selected images are already in the gallery.");
    } else {
      setGalleryFiles(prev => [...prev, ...uniqueNewImages]);
      setMessage(`✅ Added ${uniqueNewImages.length} new gallery image(s).`);
    }
    
    e.target.value = null;
    setUploadingImages(false);
    setUploadProgress(0);
  };

  const handleColorChangeOnImage = (id, newColor) => {
    setGalleryFiles(prev => 
      prev.map(img => 
        img.id === id ? { ...img, color: newColor } : img
      )
    );
  };

  const removeMainImage = () => {
    if (mainImageFile) {
      URL.revokeObjectURL(mainImageFile.url);
      setMainImageFile(null);
    } else if (productData.existingMainImage) {
      if (productData.existingMainImage.path) {
        setImagesToDelete(prev => [...prev, productData.existingMainImage.path]);
      }
      setProductData(prev => ({
        ...prev,
        existingMainImage: null
      }));
    }
    if (document.getElementById("mainImageFile")) document.getElementById("mainImageFile").value = "";
    setMessage("✅ Main Image removed.");
  };

  const removeGalleryImage = (idToRemove) => {
    const imageObject = galleryFiles.find(p => p.id === idToRemove);
    
    if (imageObject) {
      if (imageObject.isExisting && imageObject.path) {
        setImagesToDelete(prev => [...prev, imageObject.path]);
      } else if (imageObject.url) {
        URL.revokeObjectURL(imageObject.url);
      }
      
      setGalleryFiles(prev => prev.filter(p => p.id !== idToRemove));
      setMessage("✅ Gallery image removed.");
    }
  };

  // Video Management
  const handleVideoChange = (e) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file) {
      if (productData.existingVideo?.path) {
        setVideoToDelete(productData.existingVideo.path);
      }
      
      if (videoFile && videoFile.url) URL.revokeObjectURL(videoFile.url);

      setVideoFile({
        file: file,
        url: URL.createObjectURL(file),
        name: file.name,
        id: `video-${Date.now()}`,
        isExisting: false
      });
      setMessage(`✅ Product Video uploaded: ${file.name}.`);
    } else {
      setVideoFile(null);
    }
    e.target.value = null;
  };

  const removeVideo = () => {
    if (videoFile) {
      URL.revokeObjectURL(videoFile.url);
      setVideoFile(null);
    } else if (productData.existingVideo) {
      if (productData.existingVideo.path) {
        setVideoToDelete(productData.existingVideo.path);
      }
      setProductData(prev => ({
        ...prev,
        existingVideo: null
      }));
    }
    if (document.getElementById("videoFile")) document.getElementById("videoFile").value = "";
    setMessage("✅ Product Video removed.");
  };

  // Delete Files from Storage
  const deleteFilesFromStorage = async () => {
    try {
      const deleteImagePromises = imagesToDelete.map(async (path) => {
        if (path && path.trim() !== '') {
          const imageRef = ref(storage, path);
          await deleteObject(imageRef).catch(err => console.warn("Error deleting image:", err));
        }
      });

      if (videoToDelete && videoToDelete.trim() !== '') {
        const videoRef = ref(storage, videoToDelete);
        await deleteObject(videoRef).catch(err => console.warn("Error deleting video:", err));
      }

      await Promise.all([...deleteImagePromises]);
    } catch (error) {
      console.error("Error deleting old files:", error);
    }
  };

 const uploadFileToFirebase = async (file, folder, customName) => {
  try {
    const extension = file.name.split('.').pop();
    const fileName = `${folder}/${customName}.${extension}`;
    const storageRef = ref(storage, fileName);

    await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(storageRef);

    return {
      url: downloadURL,
      path: fileName,
      name: `${customName}.${extension}`,
      type: file.type,
      size: file.size
    };
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
};

  // Main Submit Handler - FIXED with safeTrim
  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setUpdating(true);
    setUploadingImages(true);

    try {
      let imageUrls = [];
      let mainDownloadURL = null;
      let videoDownloadURL = null;

      // 1. Delete old files
      if (imagesToDelete.length > 0 || videoToDelete) {
        await deleteFilesFromStorage();
      }

      // 2. Handle Main Image
      if (mainImageFile) {
        const mainResult = await uploadFileToFirebase(mainImageFile.file, 'products', 'main');
        mainDownloadURL = mainResult.url;
        
        imageUrls.push({
          url: mainResult.url,
          name: mainResult.name,
          path: mainResult.path,
          type: 'file',
          isMain: true,
          color: '',
        });
      } else if (productData.existingMainImage && 
                !imagesToDelete.includes(productData.existingMainImage.path)) {
        imageUrls.push({
          ...productData.existingMainImage,
          isMain: true
        });
        mainDownloadURL = productData.existingMainImage.url;
      }

      // 3. Handle Gallery Images
      setMessage("📤 Uploading gallery images...");
      
      const existingGalleryImages = galleryFiles.filter(img => img.isExisting && 
        !imagesToDelete.includes(img.path));
      
      const newGalleryImages = galleryFiles.filter(img => !img.isExisting && img.file);

    // Count existing gallery images
const existingGalleryCount = imageUrls.filter(img => !img.isMain).length;

const galleryUploadPromises = newGalleryImages.map(async (imageObj, index) => {
  const galleryIndex = existingGalleryCount + index + 1; // 1-based index
  const customName = `galleryimage${galleryIndex}`;

  const result = await uploadFileToFirebase(
    imageObj.file,
    'products',
    customName
  );

  return {
    url: result.url,
    name: result.name,
    path: result.path,
    type: 'file',
    isMain: false,
    color: imageObj.color || '',
  };
});


      const uploadedGalleryImages = await Promise.all(galleryUploadPromises);
      
      existingGalleryImages.forEach(img => {
        imageUrls.push({
          url: img.url,
          name: img.name,
          path: img.path || '',
          type: 'file',
          isMain: false,
          color: img.color || '',
        });
      });

      imageUrls.push(...uploadedGalleryImages);

      // 4. Handle Video
      if (videoFile) {
        const videoResult = await uploadFileToFirebase(videoFile.file, 'product-videos', 'video');
        videoDownloadURL = videoResult.url;
      } else if (productData.existingVideo && 
                !videoToDelete && 
                productData.existingVideo.url) {
        videoDownloadURL = productData.existingVideo.url;
      }

      // Ensure we have a main image
      if (!mainDownloadURL && imageUrls.length > 0) {
        imageUrls[0].isMain = true;
        mainDownloadURL = imageUrls[0].url;
      }

      // 5. Prepare data for Firestore
      const selectedCategory = categoriesList.find(cat => cat.id === productData.category);
      const selectedSubCategory = subcategoriesList.find(sub => sub.id === productData.subCategory);

      const productToUpdate = {
        name: safeTrim(productData.name),
        description: safeTrim(productData.description),
        sku: safeTrim(productData.sku),
        hsnCode: safeTrim(productData.hsnCode),
        brand: safeTrim(productData.brand),

        category: selectedCategory ? {
          id: selectedCategory.id,
          name: selectedCategory.name
        } : null,

        subCategory: selectedSubCategory ? {
          id: selectedSubCategory.id,
          name: selectedSubCategory.name
        } : null,

        sellerId: safeTrim(productData.sellerId) || "Admin",
        productTag: productData.productTag,

        imageUrls: imageUrls.map(img => ({
          url: img.url,
          name: img.name,
          path: img.path,
          type: img.type || 'file',
          isMain: img.isMain || false,
          color: img.color || ''
        })),

        mainImageUrl: mainDownloadURL || null,

        videoUrl: videoDownloadURL || null,
        videoPath: videoFile ? `product-videos/video_${Date.now()}_${videoFile.name}` : 
                  (productData.existingVideo && !videoToDelete ? productData.existingVideo.path : null),

        variants: productData.variants || [],

        imageStatus: "completed",
        status: "Active",

        updatedAt: serverTimestamp(),
        
        searchKeywords: generateSearchKeywords({
          ...productData,
          category: selectedCategory || {},
          subCategory: selectedSubCategory || {}
        })
      };

      // 6. Update in Firestore
      const productRef = doc(db, "products", productId);
      await updateDoc(productRef, productToUpdate);

      // 7. Success
      setShowSuccessModal(true);
      setMessage("✅ Product updated successfully! All images stored properly in Firebase.");

    } catch (error) {
      console.error("Firebase update error:", error);
      setMessage(`❌ Failed to update product: ${error.message}`);
    } finally {
      setUpdating(false);
      setUploadingImages(false);
    }
  };

  // Reset Form
  const resetForm = () => {
    if (existingProduct) {
      let normalizedImages = [];
      if (existingProduct.imageUrls && Array.isArray(existingProduct.imageUrls)) {
        if (typeof existingProduct.imageUrls[0] === 'string') {
          normalizedImages = existingProduct.imageUrls.map((url, index) => ({
            url: url,
            isMain: index === 0 && !existingProduct.mainImageUrl,
            color: '',
            name: `image-${index + 1}`,
            path: '',
            type: 'file',
            isExisting: true
          }));
        } else {
          normalizedImages = existingProduct.imageUrls;
        }
      }

      const mainImage = normalizedImages.find(img => img.isMain) || 
        (existingProduct.mainImageUrl ? {
          url: existingProduct.mainImageUrl,
          path: '',
          name: 'Main Image',
          isMain: true,
          isExisting: true
        } : null);

      setProductData({
        name: existingProduct.name || '',
        description: existingProduct.description || '',
        sku: existingProduct.sku || '',
        hsnCode: existingProduct.hsnCode || '',
        brand: existingProduct.brand || '',
        category: existingProduct.category?.id || '',
        subCategory: existingProduct.subCategory?.id || '',
        sellerId: existingProduct.sellerId || '',
        productTag: existingProduct.productTag || '',
        variants: existingProduct.variants || [],
        existingImages: normalizedImages,
        existingVideo: existingProduct.videoUrl ? {
          url: existingProduct.videoUrl,
          path: existingProduct.videoPath || '',
          name: 'Existing Video',
          isExisting: true
        } : null,
        existingMainImage: mainImage
      });

      const galleryImages = normalizedImages
        .filter(img => !img.isMain)
        .map((img, index) => ({
          ...img,
          id: `existing-${Date.now()}-${index}`,
          isExisting: true,
          color: img.color || ''
        }));
      
      setGalleryFiles(galleryImages);
      setMainImageFile(null);
      setVideoFile(null);
      setImagesToDelete([]);
      setVideoToDelete(null);
      setMessage('');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-blue-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-700">Loading Product Data...</h2>
          <p className="text-gray-500 mt-2">Please wait while we fetch your product details</p>
        </div>
      </div>
    );
  }

  const isFormDisabled = updating || loadingData;
  const isSuccess = message.startsWith("✅");
  const messageClass = isSuccess
    ? "bg-gradient-to-r from-green-50 to-green-100 border-l-4 border-green-500 text-green-700"
    : message.startsWith("⚠️")
    ? "bg-gradient-to-r from-yellow-50 to-yellow-100 border-l-4 border-yellow-500 text-yellow-700"
    : "bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-500 text-red-700";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center text-blue-600 hover:text-blue-800 font-medium mb-4"
          >
            <FiArrowLeft className="w-5 h-5 mr-2" />
            Back to Products
          </button>
          
          <div className="bg-white rounded-xl p-6 shadow-lg border border-blue-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-3 rounded-xl">
                  <FiEdit className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">Edit Product</h1>
                  <p className="text-gray-600">Update product details, images, and variants</p>
                  <div className="flex items-center mt-1 space-x-4 text-sm text-gray-500">
                    <span className="flex items-center">
                      <FiPackage className="w-4 h-4 mr-1" />
                      ID: {productId}
                    </span>
                    <span className="flex items-center">
                      <FiShoppingBag className="w-4 h-4 mr-1" />
                      {productData.name}
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500">Last Updated</div>
                <div className="font-semibold text-gray-700">
                  {existingProduct?.updatedAt ? 
                    new Date(existingProduct.updatedAt.seconds * 1000).toLocaleDateString() : 
                    'Recently'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Status Messages */}
          {message && (
            <div className={`p-4 flex items-center ${messageClass}`}>
              {isSuccess ? <FiCheck className="w-5 h-5 mr-3" /> : 
               message.startsWith("⚠️") ? <FiAlertCircle className="w-5 h-5 mr-3" /> : 
               <FiX className="w-5 h-5 mr-3" />}
              <span className="font-medium">{message}</span>
            </div>
          )}

          {/* Upload Progress */}
          {uploadingImages && (
            <div className="p-4 bg-blue-50 border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <FiCloud className="w-5 h-5 text-blue-500 mr-2 animate-pulse" />
                  <span className="font-medium text-blue-700">Uploading Images...</span>
                </div>
                <span className="font-bold text-blue-700">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="p-8 space-y-8">
            {/* Basic Information */}
            <div className="space-y-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-gradient-to-r from-blue-100 to-blue-50 p-2 rounded-lg">
                  <FiPackage className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Basic Information</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Name 
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={productData.name}
                    onChange={handleChange}
                    placeholder="Enter product name"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200 text-lg bg-gray-50"
                    
                    
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Seller ID
                  </label>
                  <div className="relative">
                    <FiUser className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      name="sellerId"
                      value={productData.sellerId}
                      onChange={handleChange}
                      placeholder="Enter seller ID"
                      className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-gray-50"
                      disabled={isFormDisabled}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Product Description */}
            <div className="space-y-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-gradient-to-r from-red-100 to-red-50 p-2 rounded-lg">
                  <FiFileText className="w-6 h-6 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Product Description</h3>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description 
                </label>
                <textarea
                  name="description"
                  value={productData.description}
                  onChange={handleChange}
                  placeholder="Describe your product in detail..."
                  rows="4"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all duration-200 bg-gray-50"
               
                />
                <p className="text-xs text-gray-500 mt-2">Provide detailed information about the product features and benefits.</p>
              </div>
            </div>

            {/* Media Upload Section */}
            <div className="space-y-6 border-2 border-dashed border-gray-300 rounded-2xl p-6 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center space-x-3 mb-6">
                <div className="bg-gradient-to-r from-purple-100 to-pink-50 p-2 rounded-lg">
                  <FiCamera className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Product Media</h3>
                  <p className="text-gray-600 text-sm">Upload main image, gallery images, and product video</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Main Image */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-gray-700">
                      Main Product Image 
                    </label>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">Required</span>
                  </div>
                  
                  <div className="h-64">
                    {!mainImageFile && !productData.existingMainImage ? (
                      <label 
                        htmlFor="mainImageFile"
                        className="h-full border-3 border-dashed border-blue-300 rounded-2xl p-6 text-center hover:border-blue-500 transition-all duration-300 bg-gradient-to-br from-blue-50 to-white flex flex-col justify-center items-center cursor-pointer group"
                      >
                        <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <FiUpload className="w-8 h-8 text-white" />
                        </div>
                        <span className="text-lg font-semibold text-gray-700 mb-2">Upload Main Image</span>
                        <p className="text-gray-500 text-sm max-w-xs">High-quality image that represents your product</p>
                        <input 
                          type="file"
                          id="mainImageFile"
                          accept="image/*"
                          onChange={handleMainImageChange}
                          className="hidden"
                          disabled={isFormDisabled}
                        />
                      </label>
                    ) : (
                      <div className="relative h-full rounded-2xl overflow-hidden shadow-xl group">
                        <img
                          src={mainImageFile?.url || productData.existingMainImage?.url}
                          alt="Main product"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                        
                        <button
                          type="button"
                          onClick={removeMainImage}
                          className="absolute top-4 right-4 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors transform hover:scale-110"
                          title="Remove Main Image"
                          disabled={isFormDisabled}
                        >
                          <FiX className="w-4 h-4" />
                        </button>
                        
                        <div className="absolute bottom-4 left-4 right-4 flex space-x-2">
                          <label 
                            htmlFor="mainImageFile" 
                            className="flex-1 bg-white/90 backdrop-blur-sm text-gray-800 p-3 rounded-xl hover:bg-white transition-colors cursor-pointer flex items-center justify-center space-x-2 shadow-lg"
                          >
                            <FiUpload className="w-4 h-4" />
                            <span className="font-medium">Replace</span>
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
                        
                        <div className="absolute top-4 left-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-lg">
                          MAIN
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Video */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-gray-700">
                      Product Video
                    </label>
                    <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">Optional</span>
                  </div>
                  
                  <div className="h-64">
                    {!videoFile && !productData.existingVideo ? (
                      <label 
                        htmlFor="videoFile"
                        className="h-full border-3 border-dashed border-purple-300 rounded-2xl p-6 text-center hover:border-purple-500 transition-all duration-300 bg-gradient-to-br from-purple-50 to-white flex flex-col justify-center items-center cursor-pointer group"
                      >
                        <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <FiVideo className="w-8 h-8 text-white" />
                        </div>
                        <span className="text-lg font-semibold text-gray-700 mb-2">Upload Video</span>
                        <p className="text-gray-500 text-sm max-w-xs">Show your product in action (MP4, MOV)</p>
                        <input 
                          type="file"
                          id="videoFile"
                          accept="video/*"
                          onChange={handleVideoChange}
                          className="hidden"
                          disabled={isFormDisabled}
                        />
                      </label>
                    ) : (
                      <div className="relative h-full bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl overflow-hidden shadow-xl group">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="text-center">
                            <FiVideo className="w-12 h-12 text-white/80 mx-auto mb-4" />
                            <p className="text-white font-semibold">
                              {videoFile?.name || 'Existing Video'}
                            </p>
                            <p className="text-white/60 text-sm mt-1">Video Ready</p>
                          </div>
                        </div>
                        
                        <button
                          type="button"
                          onClick={removeVideo}
                          className="absolute top-4 right-4 bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors transform hover:scale-110"
                          disabled={isFormDisabled}
                          title="Remove Video"
                        >
                          <FiX className="w-4 h-4" />
                        </button>
                        
                        <div className="absolute bottom-4 left-4 right-4">
                          <label 
                            htmlFor="videoFile" 
                            className="block bg-white/90 backdrop-blur-sm text-gray-800 p-3 rounded-xl hover:bg-white transition-colors cursor-pointer text-center font-medium shadow-lg"
                          >
                            Replace Video
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
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Gallery Images - Bulk Upload */}
              <div className="space-y-4 mt-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-bold text-gray-900">Gallery Images</h4>
                    <p className="text-gray-600 text-sm">Upload multiple images for product gallery</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-700">
                      {galleryFiles.length} images
                    </span>
                    <span className="px-3 py-1 bg-gradient-to-r from-green-100 to-emerald-100 text-green-800 rounded-full text-xs font-bold">
                      Bulk Upload
                    </span>
                  </div>
                </div>
                
                {/* Gallery Upload Area */}
                <div className="relative">
                  <label 
                    htmlFor="galleryImages" 
                    className="block border-3 border-dashed border-emerald-300 rounded-2xl p-8 text-center hover:border-emerald-500 transition-all duration-300 bg-gradient-to-br from-emerald-50 to-white cursor-pointer group"
                  >
                    <div className="max-w-md mx-auto">
                      <div className="w-20 h-20 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center mb-6 mx-auto group-hover:scale-110 transition-transform">
                        <FiGrid className="w-10 h-10 text-white" />
                      </div>
                      <h5 className="text-xl font-bold text-gray-900 mb-2">Bulk Upload Gallery Images</h5>
                      <p className="text-gray-600 mb-4">
                        Select multiple images at once (JPG, PNG, WebP)
                      </p>
                      <div className="flex items-center justify-center space-x-4 text-sm text-gray-500">
                        <span className="flex items-center">
                          <FiCheck className="w-4 h-4 mr-1 text-emerald-500" />
                          Multiple selection
                        </span>
                        <span className="flex items-center">
                          <FiCheck className="w-4 h-4 mr-1 text-emerald-500" />
                          Drag & drop
                        </span>
                        <span className="flex items-center">
                          <FiCheck className="w-4 h-4 mr-1 text-emerald-500" />
                          Auto-upload
                        </span>
                      </div>
                    </div>
                    <input 
                      type="file"
                      id="galleryImages"
                      multiple
                      accept="image/*"
                      onChange={handleGalleryImageChange}
                      className="hidden"
                      disabled={isFormDisabled || uploadingImages}
                    />
                  </label>
                  
                  {uploadingImages && (
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-2xl flex items-center justify-center">
                      <div className="text-center">
                        <FiRefreshCw className="w-12 h-12 text-emerald-600 animate-spin mx-auto mb-4" />
                        <p className="font-semibold text-gray-700">Uploading {galleryFiles.length} images...</p>
                        <p className="text-sm text-gray-600 mt-1">Please don't close the page</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Gallery Previews */}
                {galleryFiles.length > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-4">
                      <h6 className="font-semibold text-gray-700">
                        Image Previews ({galleryFiles.length})
                      </h6>
                      <label 
                        htmlFor="galleryImages" 
                        className="text-emerald-600 hover:text-emerald-800 font-medium text-sm flex items-center space-x-1 cursor-pointer"
                      >
                        <FiPlus className="w-4 h-4" />
                        <span>Add More Images</span>
                        <input 
                          type="file"
                          id="galleryImages"
                          multiple
                          accept="image/*"
                          onChange={handleGalleryImageChange}
                          className="hidden"
                          disabled={isFormDisabled || uploadingImages}
                        />
                      </label>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {galleryFiles.map((image) => (
                        <div 
                          key={image.id} 
                          className={`relative rounded-xl overflow-hidden shadow-lg group border-2 ${
                            image.color ? 'border-emerald-500' : 'border-gray-300'
                          } ${image.isExisting ? 'border-dashed' : ''}`}
                        >
                          <div className="aspect-square bg-gray-100">
                            <img
                              src={image.url}
                              alt={image.name}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                              onError={(e) => {
                                e.target.src = `https://via.placeholder.com/300/FF0000/FFFFFF?text=Image+Error`;
                              }}
                            />
                          </div>
                          
                          {image.isExisting && (
                            <span className="absolute top-2 left-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-bold px-2 py-1 rounded-lg z-10 shadow-md">
                              EXISTING
                            </span>
                          )}
                          
                          <button
                            type="button"
                            onClick={() => removeGalleryImage(image.id)}
                            className="absolute top-2 right-2 bg-red-500 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100 transform hover:scale-110"
                            title="Remove Image"
                            disabled={isFormDisabled}
                          >
                            <FiX className="w-3 h-3" />
                          </button>
                          
                          <div className="p-2 bg-gradient-to-r from-gray-50 to-white">
                            <p className="text-xs font-medium text-gray-800 truncate mb-1" title={image.name}>
                              {image.name}
                            </p>
                            
                            <div className="flex items-center justify-between">
                              <div className="relative flex-1 mr-2">
                                <FiChevronDown className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3 pointer-events-none" />
                                <select
                                  value={image.color || ''}
                                  onChange={(e) => handleColorChangeOnImage(image.id, e.target.value)}
                                  className={`appearance-none w-full text-xs py-1 pl-2 pr-5 border rounded-lg ${
                                    image.color ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-300 bg-white text-gray-700'
                                  }`}
                                  disabled={isFormDisabled || availableColors.length === 0}
                                  title={image.color ? `Color: ${image.color}` : 'Assign Color'}
                                >
                                  <option value="">Assign Color</option>
                                  {availableColors.map(color => (
                                    <option key={color} value={color}>
                                      {color}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              
                              {image.color && (
                                <div 
                                  className="w-4 h-4 rounded-full border-2 border-white shadow"
                                  style={{ backgroundColor: image.color.toLowerCase() }}
                                  title={`Color: ${image.color}`}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 text-center">
                      <p className="text-sm text-gray-600">
                        {galleryFiles.filter(img => img.isExisting).length} existing + {' '}
                        {galleryFiles.filter(img => !img.isExisting).length} new = {' '}
                        <span className="font-bold text-gray-800">{galleryFiles.length} total images</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Product Identifiers */}
            <div className="space-y-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-gradient-to-r from-purple-100 to-pink-50 p-2 rounded-lg">
                  <FiTag className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Product Identifiers</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    SKU Code 
                  </label>
                  <input
                    type="text"
                    name="sku"
                    value={productData.sku}
                    onChange={handleChange}
                    placeholder="Enter SKU"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-gray-50"
                   
                  
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Brand Name 
                  </label>
                  <input
                    type="text"
                    name="brand"
                    value={productData.brand}
                    onChange={handleChange}
                    placeholder="Enter brand name"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-gray-50"
                    
                 
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    HSN Code
                  </label>
                  <input
                    type="text"
                    name="hsnCode"
                    value={productData.hsnCode}
                    onChange={handleChange}
                    placeholder="Enter HSN code"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 bg-gray-50"
                    disabled={isFormDisabled}
                  />
                </div>
              </div>
            </div>

            {/* Category Selection - AUTO POPULATED */}
            <div className="space-y-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="bg-gradient-to-r from-green-100 to-emerald-50 p-2 rounded-lg">
                  <FiLayers className="w-6 h-6 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900">Category Selection</h3>
                {productData.category && (
                  <span className="text-sm text-green-600 font-medium bg-green-100 px-3 py-1 rounded-full">
                    ✓ Auto-populated
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Label 
                  </label>
                  <div className="relative">
                    <FiTag className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <select
                      name="productTag"
                      value={productData.productTag}
                      onChange={handleChange}
                      className="appearance-none w-full pl-10 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all duration-200 bg-gray-50"
                      
                 
                    >
                      <option value="">Select Product Label</option>
                      {PRODUCT_TAG_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category 
                  </label>
                  <div className="relative">
                    <select
                      name="category"
                      value={productData.category}
                      onChange={handleChange}
                      className="appearance-none w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-gray-50"
                      
                      
                    >
                      <option value="">Select Category</option>
                      {filteredCategories.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                          {cat.id === productData.category ? ' ✓' : ''}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                  </div>
                  {productData.category && (
                    <p className="text-xs text-green-600 mt-1">
                      {categoriesList.find(cat => cat.id === productData.category)?.name || 'Category loaded'}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subcategory
                  </label>
                  <div className="relative">
                    <select
                      name="subCategory"
                      value={productData.subCategory}
                      onChange={handleChange}
                      className="appearance-none w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-gray-50"
                     
                    >
                      <option value="">Select Subcategory</option>
                      {filteredSubcategories.map(subCat => (
                        <option key={subCat.id} value={subCat.id}>
                          {subCat.name}
                          {subCat.id === productData.subCategory ? ' ✓' : ''}
                        </option>
                      ))}
                    </select>
                    <FiChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                  </div>
                  {productData.subCategory && (
                    <p className="text-xs text-green-600 mt-1">
                      {subcategoriesList.find(sub => sub.id === productData.subCategory)?.name || 'Subcategory loaded'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Product Variants - WITH INLINE EDITING */}
            <div className="space-y-6 border-2 border-orange-200 rounded-2xl p-6 bg-gradient-to-r from-orange-50 to-amber-50">
              <div className="flex items-center space-x-3 mb-6">
                <div className="bg-gradient-to-r from-orange-100 to-red-50 p-2 rounded-lg">
                  <FiDroplet className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Product Variants</h3>
                  <p className="text-gray-600 text-sm">Click on any value to edit directly</p>
                </div>
                <div className="ml-auto">
                  <span className="px-3 py-1 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full text-sm font-bold">
                    {productData.variants.length} Variants
                  </span>
                </div>
              </div>
              
              {/* Add Variant Form */}
              <div className="bg-white rounded-xl p-6 shadow-md mb-6">
                <h4 className="font-semibold text-gray-800 mb-4">Add New Variant</h4>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <input
                    type="text"
                    name="color"
                    value={newVariant.color}
                    onChange={handleNewVariantChange}
                    placeholder="Color"
                    className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-gray-50"
                    disabled={isFormDisabled}
                  />
                  <input
                    type="text"
                    name="size"
                    value={newVariant.size}
                    onChange={handleNewVariantChange}
                    placeholder="Size"
                    className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-gray-50"
                    disabled={isFormDisabled}
                  />
                  <div className="relative">
                    <FiDollarSign className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="number"
                      name="price"
                      value={newVariant.price}
                      onChange={handleNewVariantChange}
                      placeholder="Price"
                      min="0"
                      step="0.01"
                      className="w-full pl-8 pr-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-gray-50"
                      disabled={isFormDisabled}
                    />
                  </div>
                  <div className="relative">
                    <FiZap className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="number"
                      name="offerPrice"
                      value={newVariant.offerPrice}
                      onChange={handleNewVariantChange}
                      placeholder="Offer"
                      min="0"
                      step="0.01"
                      className="w-full pl-8 pr-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-gray-50"
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
                    className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-gray-50"
                    disabled={isFormDisabled}
                  />
                  <button
                    type="button"
                    onClick={handleAddVariant}
                    className="px-3 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg hover:from-orange-600 hover:to-red-600 transition-all flex items-center justify-center space-x-1 shadow-md hover:shadow-lg"
                    disabled={isFormDisabled}
                  >
                    <FiPlus className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {/* Variants List with Inline Editing */}
              {productData.variants.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-800 mb-4">Current Variants</h4>
                  <div className="bg-white rounded-xl overflow-hidden shadow-md">
                    <div className="grid grid-cols-12 text-sm font-bold text-gray-700 bg-gradient-to-r from-gray-100 to-gray-200 p-4">
                      <div className="col-span-2">Color</div>
                      <div className="col-span-2">Size</div>
                      <div className="col-span-2">Price</div>
                      <div className="col-span-2">Offer Price</div>
                      <div className="col-span-2">Stock</div>
                      <div className="col-span-2 text-right">Action</div>
                    </div>
                    
                    {productData.variants.map((v, index) => (
                      <div 
                        key={v.variantId} 
                        className={`grid grid-cols-12 text-sm p-4 border-t border-gray-200 hover:bg-orange-50 transition-colors ${
                          index % 2 === 0 ? 'bg-gray-50' : 'bg-white'
                        }`}
                      >
                        {/* Color Field */}
                        <div className="col-span-2 flex items-center">
                          <div 
                            className="w-4 h-4 rounded-full mr-2 border border-gray-300"
                            style={{ 
                              backgroundColor: v.color.toLowerCase() === 'n/a' || v.color.toLowerCase() === 'black' 
                                ? '#000' 
                                : v.color 
                            }}
                            title={v.color}
                          />
                          {editingVariant.id === v.variantId && editingVariant.field === 'color' ? (
                            <div className="flex items-center space-x-1">
                              <input
                                type="text"
                                value={editingVariant.value}
                                onChange={handleInlineEditChange}
                                onKeyPress={handleInlineEditKeyPress}
                                className="px-2 py-1 border rounded w-24 text-sm"
                                autoFocus
                              />
                              <button
                                onClick={saveInlineEdit}
                                className="text-green-600 hover:text-green-800 p-1"
                                title="Save"
                              >
                                <FiCheck className="w-3 h-3" />
                              </button>
                              <button
                                onClick={cancelInlineEdit}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Cancel"
                              >
                                <FiX className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span 
                              className="cursor-pointer hover:bg-orange-100 px-2 py-1 rounded transition-colors"
                              onClick={() => startInlineEdit(v.variantId, 'color', v.color)}
                            >
                              {v.color}
                            </span>
                          )}
                        </div>
                        
                        {/* Size Field */}
                        <div className="col-span-2 font-medium">
                          {editingVariant.id === v.variantId && editingVariant.field === 'size' ? (
                            <div className="flex items-center space-x-1">
                              <input
                                type="text"
                                value={editingVariant.value}
                                onChange={handleInlineEditChange}
                                onKeyPress={handleInlineEditKeyPress}
                                className="px-2 py-1 border rounded w-20 text-sm"
                                autoFocus
                              />
                              <button
                                onClick={saveInlineEdit}
                                className="text-green-600 hover:text-green-800 p-1"
                                title="Save"
                              >
                                <FiCheck className="w-3 h-3" />
                              </button>
                              <button
                                onClick={cancelInlineEdit}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Cancel"
                              >
                                <FiX className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span 
                              className="cursor-pointer hover:bg-orange-100 px-2 py-1 rounded transition-colors"
                              onClick={() => startInlineEdit(v.variantId, 'size', v.size)}
                            >
                              {v.size}
                            </span>
                          )}
                        </div>
                        
                        {/* Price Field */}
                        <div className="col-span-2">
                          {editingVariant.id === v.variantId && editingVariant.field === 'price' ? (
                            <div className="flex items-center space-x-1">
                              <div className="relative">
                                <FiDollarSign className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                                <input
                                  type="number"
                                  value={editingVariant.value}
                                  onChange={handleInlineEditChange}
                                  onKeyPress={handleInlineEditKeyPress}
                                  className="pl-6 pr-2 py-1 border rounded w-24 text-sm"
                                  autoFocus
                                  step="0.01"
                                  min="0"
                                />
                              </div>
                              <button
                                onClick={saveInlineEdit}
                                className="text-green-600 hover:text-green-800 p-1"
                                title="Save"
                              >
                                <FiCheck className="w-3 h-3" />
                              </button>
                              <button
                                onClick={cancelInlineEdit}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Cancel"
                              >
                                <FiX className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span 
                              className="cursor-pointer hover:bg-orange-100 px-2 py-1 rounded transition-colors font-bold text-gray-900"
                              onClick={() => startInlineEdit(v.variantId, 'price', v.price)}
                            >
                              ₹{v.price.toFixed(2)}
                            </span>
                          )}
                        </div>
                        
                        {/* Offer Price Field */}
                        <div className="col-span-2">
                          {editingVariant.id === v.variantId && editingVariant.field === 'offerPrice' ? (
                            <div className="flex items-center space-x-1">
                              <div className="relative">
                                <FiDollarSign className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                                <input
                                  type="number"
                                  value={editingVariant.value}
                                  onChange={handleInlineEditChange}
                                  onKeyPress={handleInlineEditKeyPress}
                                  className="pl-6 pr-2 py-1 border rounded w-24 text-sm"
                                  autoFocus
                                  step="0.01"
                                  min="0"
                                />
                              </div>
                              <button
                                onClick={saveInlineEdit}
                                className="text-green-600 hover:text-green-800 p-1"
                                title="Save"
                              >
                                <FiCheck className="w-3 h-3" />
                              </button>
                              <button
                                onClick={cancelInlineEdit}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Cancel"
                              >
                                <FiX className="w-3 h-3" />
                              </button>
                            </div>
                          ) : v.offerPrice ? (
                            <div 
                              className="cursor-pointer hover:bg-orange-100 p-1 rounded transition-colors"
                              onClick={() => startInlineEdit(v.variantId, 'offerPrice', v.offerPrice)}
                            >
                              <span className="text-red-600 font-bold block">
                                ₹{v.offerPrice.toFixed(2)}
                              </span>
                              <span className="text-xs text-gray-500 line-through">
                                ₹{v.price.toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <button
                              onClick={() => startInlineEdit(v.variantId, 'offerPrice', '')}
                              className="text-gray-400 hover:text-gray-600 hover:bg-orange-100 px-2 py-1 rounded transition-colors text-sm"
                            >
                              + Add Offer
                            </button>
                          )}
                        </div>
                        
                        {/* Stock Field */}
                        <div className="col-span-2">
                          {editingVariant.id === v.variantId && editingVariant.field === 'stock' ? (
                            <div className="flex items-center space-x-1">
                              <input
                                type="number"
                                value={editingVariant.value}
                                onChange={handleInlineEditChange}
                                onKeyPress={handleInlineEditKeyPress}
                                className="px-2 py-1 border rounded w-20 text-sm"
                                autoFocus
                                min="0"
                              />
                              <button
                                onClick={saveInlineEdit}
                                className="text-green-600 hover:text-green-800 p-1"
                                title="Save"
                              >
                                <FiCheck className="w-3 h-3" />
                              </button>
                              <button
                                onClick={cancelInlineEdit}
                                className="text-red-600 hover:text-red-800 p-1"
                                title="Cancel"
                              >
                                <FiX className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <span 
                              className={`cursor-pointer hover:opacity-90 px-2 py-1 rounded-full text-xs font-bold inline-block ${
                                v.stock > 10 ? 'bg-green-100 text-green-800' : 
                                v.stock > 0 ? 'bg-yellow-100 text-yellow-800' : 
                                'bg-red-100 text-red-800'
                              }`}
                              onClick={() => startInlineEdit(v.variantId, 'stock', v.stock)}
                            >
                              {v.stock} units
                            </span>
                          )}
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="col-span-2 text-right flex items-center justify-end space-x-2">
                          <button
                            type="button"
                            onClick={() => removeVariant(v.variantId)}
                            className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded-lg transition-colors"
                            disabled={isFormDisabled}
                            title="Delete Variant"
                          >
                            <FiTrash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-8">
              <button
                type="button"
                onClick={resetForm}
                className="px-8 py-4 bg-gradient-to-r from-gray-200 to-gray-300 text-gray-800 rounded-xl font-semibold hover:from-gray-300 hover:to-gray-400 transition-all duration-300 flex items-center justify-center space-x-2 shadow-md hover:shadow-lg disabled:opacity-50"
                disabled={isFormDisabled}
              >
                <FiRefreshCw className="w-5 h-5" />
                <span>Reset Changes</span>
              </button>
              
              <button
                type="submit"
                disabled={isFormDisabled}
                className="flex-1 py-4 px-8 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl font-bold text-lg transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center space-x-3 shadow-xl hover:shadow-2xl"
              >
                {updating ? (
                  <>
                    <FiRefreshCw className="w-6 h-6 animate-spin" />
                    <span>Updating Product...</span>
                  </>
                ) : (
                  <>
                    <FiSave className="w-6 h-6" />
                    <span>Update Product & Upload All Images</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-gray-900/90 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
          <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl shadow-2xl max-w-md w-full p-8 space-y-6 animate-slideUp">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <FiCheck className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">Successfully Updated!</h3>
              <p className="mt-2 text-gray-600">
                Product <strong>"{productData.name}"</strong> has been updated.
              </p>
              <div className="mt-4 p-3 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-lg border border-emerald-200">
                <p className="text-sm font-medium text-emerald-800">
                  ✓ All images uploaded to Firebase Storage
                </p>
                <p className="text-sm text-emerald-600 mt-1">
                  ✓ {galleryFiles.length} gallery images processed
                </p>
                <p className="text-sm text-emerald-600 mt-1">
                  ✓ {productData.variants.length} variants updated
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setShowSuccessModal(false)}
                className="flex-1 py-3 px-4 bg-gray-200 text-gray-800 font-semibold rounded-xl hover:bg-gray-300 transition-all"
              >
                Continue Editing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EditProduct;