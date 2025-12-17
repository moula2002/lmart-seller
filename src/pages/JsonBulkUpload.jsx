import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import {
  collection,
  addDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../config/firebase";
import {
  Upload,
  FileSpreadsheet,
  Database,
  CheckCircle,
  AlertCircle,
  Loader2,
  X,
  ChevronRight,
  AlertTriangle,
  FileText,
  Package,
  CheckSquare,
  BarChart3
} from "lucide-react";

/* ===============================
   🔍 HELPERS (same as before)
================================ */
const isYouTubeUrl = (url) =>
  typeof url === "string" &&
  (url.includes("youtube.com") || url.includes("youtu.be"));

const extractVideoUrl = (row) => {
  if (!row || typeof row !== "object") return null;
  const videoKey = Object.keys(row).find((key) =>
    key
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .includes("video")
  );
  if (!videoKey) return null;
  const value = row[videoKey];
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned !== "" ? cleaned : null;
};

const generateKeywords = (name, sku, brand, hsn) => {
  const set = new Set();
  [name, sku, brand, hsn].forEach((v) => {
    if (!v) return;
    const val = String(v).toLowerCase();
    val.split(" ").forEach((word) => {
      for (let i = 1; i <= word.length; i++) {
        set.add(word.substring(0, i));
      }
    });
  });
  return [...set];
};

const transformExcelToJSON = (rows) => {
  const skuMap = {};
  rows.forEach((row, index) => {
    const sku = row.SKU || `SKU-${Date.now()}-${index}`;
    if (!skuMap[sku]) {
      const videoUrl = extractVideoUrl(row);
      const videoType = videoUrl
        ? isYouTubeUrl(videoUrl)
          ? "youtube"
          : "upload"
        : null;

      skuMap[sku] = {
        baseInfo: {
          sku,
          name: row.Name || "",
          description: row.Description || "",
          brand: row.Brand || "",
          hsnCode: row.HSNCode || "",
          sellerId: row.SellerId || "",
          status: "Active",
          productTag: row.ProductTag || "General",
          videoUrl,
          videoType,
          category: row.CategoryID
            ? { id: row.CategoryID, name: row.CategoryID }
            : null,
          subCategory: row.SubCategoryID
            ? { id: row.SubCategoryID, name: row.SubCategoryID }
            : null,
          searchKeywords: generateKeywords(
            row.Name,
            sku,
            row.Brand,
            row.HSNCode
          )
        },
        pendingImages: {
          main: row.MainImageURL || null,
          gallery: row.GalleryImages
            ? row.GalleryImages.split("|").map(v => v.trim()).filter(Boolean)
            : []
        },
        variants: []
      };
    }
    skuMap[sku].variants.push({
      variantId: `${Date.now()}-${index}`,
      color: row.Variant_Color || "",
      size: row.Variant_Size || "",
      price: Number(row.Variant_Price) || 0,
      offerPrice: row.Variant_OfferPrice
        ? Number(row.Variant_OfferPrice)
        : null,
      stock: Number(row.Variant_Stock) || 0
    });
  });
  return Object.values(skuMap);
};

const BulkUploadPage = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notification, setNotification] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadStage, setUploadStage] = useState("idle"); // idle, parsed, uploading, complete
  const fileRef = useRef();

  const handleExcelUpload = (e) => {
    const file = e.target.files?.[0] || e.dataTransfer?.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      showNotification("Please upload a valid Excel file (.xlsx or .xls)", "error");
      return;
    }

    setLoading(true);
    setUploadStage("parsing");

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: "array" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);

        const transformed = transformExcelToJSON(rows);
        setProducts(transformed);
        setUploadStage("parsed");
        showNotification(`Successfully loaded ${transformed.length} products from Excel`, "success");
      } catch (err) {
        console.error(err);
        showNotification("Failed to parse Excel file. Please check the format.", "error");
        setUploadStage("idle");
      } finally {
        setLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const saveToDatabase = async () => {
    if (!products.length) return;

    setLoading(true);
    setUploadStage("uploading");
    setUploadProgress(0);

    try {
      const uploadRef = await addDoc(collection(db, "productUploads"), {
        totalProducts: products.length,
        uploadedAt: serverTimestamp(),
        status: "processing"
      });

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        await addDoc(collection(db, "products"), {
          ...product.baseInfo,
          variants: product.variants,
          uploadId: uploadRef.id,
          sourceImages: product.pendingImages,
          mainImageUrl: null,
          imageUrls: [],
          imageStatus: "pending",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setUploadProgress(Math.round(((i + 1) / products.length) * 90));
      }

      clearInterval(progressInterval);
      setUploadProgress(100);
      setUploadStage("complete");
      showNotification(`Successfully imported ${products.length} products to database`, "success");
      
      // Reset after 2 seconds
      setTimeout(() => {
        setProducts([]);
        setUploadStage("idle");
        setUploadProgress(0);
      }, 2000);
    } catch (err) {
      console.error(err);
      showNotification("Failed to upload products. Please try again.", "error");
      setUploadStage("parsed");
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    handleExcelUpload(e);
  };

  const getTotalVariants = () => {
    return products.reduce((acc, product) => acc + product.variants.length, 0);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Bulk Product Upload</h1>
          <p className="text-gray-600 mt-2">
            Upload Excel files to import multiple products at once
          </p>
        </div>

        {/* Main Upload Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Upload Section */}
          <div className="lg:col-span-2 space-y-6">
            <div className={`bg-white rounded-2xl shadow-lg p-8 transition-all duration-300 ${
              dragActive ? 'ring-4 ring-blue-500 ring-opacity-30 border-blue-400' : ''
            }`}>
              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-all duration-300 ${
                  dragActive 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileRef.current.click()}
              >
                <div className="flex flex-col items-center justify-center space-y-4">
                  <div className="p-4 bg-blue-100 rounded-full">
                    {loading && uploadStage === "parsing" ? (
                      <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-12 h-12 text-blue-600" />
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <h3 className="text-xl font-semibold text-gray-800">
                      {uploadStage === "parsing" 
                        ? "Processing Excel File..." 
                        : "Drop your Excel file here"}
                    </h3>
                    <p className="text-gray-500">
                      Supports .xlsx and .xls formats
                    </p>
                    <p className="text-sm text-gray-400">
                      Click to browse or drag and drop
                    </p>
                  </div>

                  <button
                    className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                      loading 
                        ? 'bg-gray-300 cursor-not-allowed' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                    disabled={loading}
                    onClick={(e) => {
                      e.stopPropagation();
                      fileRef.current.click();
                    }}
                  >
                    <div className="flex items-center space-x-2">
                      <Upload className="w-5 h-5" />
                      <span>Browse Files</span>
                    </div>
                  </button>
                </div>

                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  hidden
                  onChange={handleExcelUpload}
                />
              </div>

              {/* Progress Bar */}
              {uploadStage === "uploading" && (
                <div className="mt-8">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>Uploading to Database...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all duration-300 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Product Preview */}
            {products.length > 0 && (
              <div className="bg-white rounded-2xl shadow-lg p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-gray-900">Products Ready for Import</h2>
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                    {products.length} products • {getTotalVariants()} variants
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {products.slice(0, 3).map((product, idx) => (
                    <div key={idx} className="border rounded-xl p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start space-x-3">
                        <Package className="w-5 h-5 text-blue-500 mt-1" />
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 truncate">{product.baseInfo.name || `Product ${idx + 1}`}</h4>
                          <p className="text-sm text-gray-500">{product.baseInfo.sku}</p>
                          <div className="flex items-center mt-2">
                            <span className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded">
                              {product.variants.length} variant{product.variants.length !== 1 ? 's' : ''}
                            </span>
                            {product.baseInfo.videoUrl && (
                              <span className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded ml-2">
                                Has Video
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {products.length > 3 && (
                  <p className="text-center text-gray-500 text-sm">
                    + {products.length - 3} more products
                  </p>
                )}

                <div className="flex justify-end mt-6">
                  <button
                    onClick={() => setProducts([])}
                    className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors mr-4"
                  >
                    Clear All
                  </button>
                  <button
                    onClick={saveToDatabase}
                    disabled={loading || uploadStage === "uploading"}
                    className={`px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center space-x-2 ${
                      loading || uploadStage === "uploading"
                        ? 'bg-green-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                  >
                    {loading && uploadStage === "uploading" ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Importing...</span>
                      </>
                    ) : (
                      <>
                        <Database className="w-5 h-5" />
                        <span>Import {products.length} Products</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Info & Stats */}
          <div className="space-y-6">
            {/* Stats Card */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
                Upload Stats
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Products Ready</span>
                  <span className="font-bold text-lg text-blue-600">
                    {products.length}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Variants</span>
                  <span className="font-bold text-lg text-purple-600">
                    {getTotalVariants()}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Status</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    uploadStage === "idle" ? 'bg-gray-100 text-gray-700' :
                    uploadStage === "parsed" ? 'bg-green-100 text-green-700' :
                    uploadStage === "uploading" ? 'bg-blue-100 text-blue-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {uploadStage === "idle" ? "Ready" :
                     uploadStage === "parsed" ? "Parsed" :
                     uploadStage === "uploading" ? "Uploading" : "Complete"}
                  </span>
                </div>
              </div>
            </div>

            {/* Requirements Card */}
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 mr-2 text-amber-600" />
                Excel Requirements
              </h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <CheckSquare className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700 text-sm">Include columns: SKU, Name, Description, Brand</span>
                </li>
                <li className="flex items-start">
                  <CheckSquare className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700 text-sm">Variant columns: Variant_Color, Variant_Size, etc.</span>
                </li>
                <li className="flex items-start">
                  <CheckSquare className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700 text-sm">Use "|" separated values for GalleryImages</span>
                </li>
                <li className="flex items-start">
                  <CheckSquare className="w-5 h-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700 text-sm">Video URLs auto-detected for YouTube/upload</span>
                </li>
              </ul>
              <button className="mt-4 w-full text-center text-blue-600 hover:text-blue-800 text-sm font-medium flex items-center justify-center">
                <FileText className="w-4 h-4 mr-2" />
                Download Template
              </button>
            </div>

            {/* Quick Tips */}
          
          </div>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 animate-slide-up">
          <div className={`rounded-xl shadow-lg p-4 flex items-center space-x-3 max-w-md ${
            notification.type === "error" 
              ? 'bg-red-50 border border-red-200' 
              : 'bg-green-50 border border-green-200'
          }`}>
            {notification.type === "error" ? (
              <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
            ) : (
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
            )}
            <span className="font-medium text-gray-900">{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="ml-auto text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Add this CSS for animation
const styles = `
@keyframes slide-up {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
.animate-slide-up {
  animation: slide-up 0.3s ease-out;
}
`;

// Add styles to head
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style")
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);
}

export default BulkUploadPage;