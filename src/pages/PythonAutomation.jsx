// import React, { useState } from 'react';
// import { Upload, Download, FileText, Play, CheckCircle } from 'lucide-react';
// import * as XLSX from 'xlsx';

// const PythonAutomation = () => {
//   const [file, setFile] = useState(null);
//   const [processedData, setProcessedData] = useState(null);
//   const [originalData, setOriginalData] = useState(null);
//   const [processing, setProcessing] = useState(false);

//   // Enhanced Column mappings (from Node.js code)
//   const COLUMN_MAPPINGS = {
//     name: ["title", "name", "product name", "product", "product title"],
//     description: ["description", "product description", "body (html)", "details"],
//     stock: ["stock", "quantity", "qty", "available stock"],
//     sku: ["sku", "variant sku", "baseSku"],
//     category: ["category", "product category", "Type"],
//     subcategory: ["subcategory", "sub category"],
//     brand: ["brand", "vendor"],
//     price: ["price", "mrp"],
//     offerPrice: ["offerprice", "msrp", "compare at price"],
//     image: ["image1", "image 1", "img1", "image2", "image 2", "img2", "image3", "image4", "image5"],
//     size: ["size"]
//   };

//   const CORE_FIELDS = new Set([
//     "productId", "name", "description", "category", "subcategory", "baseSku",
//     "brand", "price", "offerPrice", "stock", "rating", "timestamp", "images",
//     "sellerId", "sizeVariants"
//   ]);

//   // Flatten aliases for better column detection
//   const ALIASES = Object.values(COLUMN_MAPPINGS)
//     .flat()
//     .map(v => v.toLowerCase().trim());

//   // Enhanced HTML cleaning function (from Node.js code with DOMParser fallback)
//   const cleanHtml = (text) => {
//     if (!text || text === "NaN" || text === 'undefined' || text === 'null') return "";
    
//     try {
//       // Try using DOMParser for better HTML cleaning (similar to cheerio)
//       const parser = new DOMParser();
//       const doc = parser.parseFromString(String(text), 'text/html');
//       return doc.body.textContent || doc.body.innerText || "";
//     } catch (error) {
//       // Fallback to regex-based cleaning
//       const cleanText = String(text)
//         .replace(/<[^>]*>/g, '') // Remove HTML tags
//         .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
//         .replace(/&amp;/g, '&')  // Replace &amp; with &
//         .replace(/&lt;/g, '<')   // Replace &lt; with <
//         .replace(/&gt;/g, '>')   // Replace &gt; with >
//         .replace(/&quot;/g, '"') // Replace &quot; with "
//         .replace(/&#39;/g, "'")  // Replace &#39; with '
//         .trim();
      
//       return cleanText;
//     }
//   };

//   const pickColumn = (possibleNames, availableColumns) => {
//     for (const name of possibleNames) {
//       for (const col of availableColumns) {
//         if (col.trim().toLowerCase() === name.trim().toLowerCase()) {
//           return col;
//         }
//       }
//     }
//     return null;
//   };

//   const safeNumber = (val) => {
//     try {
//       return parseInt(parseFloat(val)) || 0;
//     } catch {
//       return 0;
//     }
//   };



//   const handleFileUpload = (event) => {
//     const uploadedFile = event.target.files[0];
//     if (uploadedFile) {
//       const fileType = uploadedFile.type;
//       const fileName = uploadedFile.name.toLowerCase();
      
//       // Check for CSV files
//       if (fileType === 'text/csv' || fileName.endsWith('.csv')) {
//         setFile(uploadedFile);
//       }
//       // Check for Excel files
//       else if (
//         fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
//         fileType === 'application/vnd.ms-excel' ||
//         fileName.endsWith('.xlsx') ||
//         fileName.endsWith('.xls')
//       ) {
//         setFile(uploadedFile);
//       }
//       else {
//         alert('Please upload a valid CSV or Excel file (.csv, .xlsx, .xls)');
//       }
//     }
//   };

//   // Convert Excel file to CSV format
//   const convertExcelToCSV = async (file) => {
//     return new Promise((resolve, reject) => {
//       const reader = new FileReader();
//       reader.onload = (e) => {
//         try {
//           const data = new Uint8Array(e.target.result);
//           const workbook = XLSX.read(data, { type: 'array' });
          
//           // Get the first worksheet
//           const firstSheetName = workbook.SheetNames[0];
//           const worksheet = workbook.Sheets[firstSheetName];
          
//           // Convert to CSV
//           const csvData = XLSX.utils.sheet_to_csv(worksheet);
//           resolve(csvData);
//         } catch (error) {
//           reject(error);
//         }
//       };
//       reader.onerror = () => reject(new Error('Failed to read Excel file'));
//       reader.readAsArrayBuffer(file);
//     });
//   };

//   const parseCSV = (csvText) => {
//     const lines = csvText.split('\n').filter(line => line.trim());
//     if (lines.length === 0) {
//       return { headers: [], data: [] };
//     }

//     // Parse CSV with proper comma handling (considering quoted values)
//     const parseCSVLine = (line) => {
//       const result = [];
//       let current = '';
//       let inQuotes = false;
      
//       for (let i = 0; i < line.length; i++) {
//         const char = line[i];
        
//         if (char === '"') {
//           inQuotes = !inQuotes;
//         } else if (char === ',' && !inQuotes) {
//           result.push(current.trim());
//           current = '';
//         } else {
//           current += char;
//         }
//       }
      
//       result.push(current.trim());
//       return result.map(val => val.replace(/^"|"$/g, ''));
//     };

//     const headers = parseCSVLine(lines[0]);
//     const data = [];

//     // Convert to objects format
//     for (let i = 1; i < lines.length; i++) {
//       if (lines[i].trim()) {
//         const values = parseCSVLine(lines[i]);
//         const row = {};
//         headers.forEach((header, index) => {
//           row[header] = values[index] || '';
//         });
        
//         // Only add row if it has some meaningful data
//         const hasData = Object.values(row).some(val => val && val.trim() !== '');
//         if (hasData) {
//           data.push(row);
//         }
//       }
//     }

//     return { headers, data };
//   };

//   const processCSV = async () => {
//     if (!file) {
//       alert('Please upload a CSV or Excel file first');
//       return;
//     }

//     setProcessing(true);

//     try {
//       let csvText;
      
//       // Check if it's an Excel file
//       const fileName = file.name.toLowerCase();
//       if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
//         csvText = await convertExcelToCSV(file);
//       } else {
//         csvText = await file.text();
//       }
      
//       const { headers, data } = parseCSV(csvText);
      
//       // Store original data exactly as CSV structure for download
//       const originalDataForDownload = data.map(row => {
//         const originalRow = {};
//         headers.forEach(header => {
//           originalRow[header] = row[header] || '';
//         });
//         return originalRow;
//       });
//       setOriginalData(originalDataForDownload);

//       const products = {};
//       const aliases = [];
      
//       // Flatten aliases
//       Object.values(COLUMN_MAPPINGS).forEach(variants => {
//         variants.forEach(v => aliases.push(v.toLowerCase().trim()));
//       });
//       let processedCount = 0;
//       let skippedCount = 0;

//       data.forEach((row, index) => {
//         const productId = String(
//           row['Product ID'] || row['id'] || row['SKU'] || row['sku'] || row['Sku'] || `product_${index + 1}`
//         ).trim();

//         if (!productId || productId.toLowerCase() === 'nan' || productId === '') {
//           skippedCount++;
//           return;
//         }

//         processedCount++;

//         // Pick columns using mappings
//         const nameCol = pickColumn(COLUMN_MAPPINGS.name, headers);
//         const descCol = pickColumn(COLUMN_MAPPINGS.description, headers);
//         const stockCol = pickColumn(COLUMN_MAPPINGS.stock, headers);
//         const skuCol = pickColumn(COLUMN_MAPPINGS.sku, headers);
//         const categoryCol = pickColumn(COLUMN_MAPPINGS.category, headers);
//         const subcategoryCol = pickColumn(COLUMN_MAPPINGS.subcategory, headers);
//         const brandCol = pickColumn(COLUMN_MAPPINGS.brand, headers);
//         const priceCol = pickColumn(COLUMN_MAPPINGS.price, headers);
//         const offerCol = pickColumn(COLUMN_MAPPINGS.offerPrice, headers);
//         const sizeCol = pickColumn(COLUMN_MAPPINGS.size, headers);
        


//         const size = String(row[sizeCol] || '').trim();
//         const variantStock = safeNumber(row[stockCol] || 0);

//         if (!products[productId]) {
//           // Create new product with enhanced logic from Node.js code
//           const newProduct = {
//             productId,
//             name: nameCol ? row[nameCol] : 'Untitled',
//             description: descCol ? cleanHtml(row[descCol]) : '',
//             category: categoryCol ? row[categoryCol] : '',
//             subcategory: subcategoryCol ? row[subcategoryCol] : '',
//             baseSku: skuCol ? row[skuCol] : '',
//             brand: brandCol ? row[brandCol] : '',
//             price: priceCol ? safeNumber(row[priceCol]) : 0,
//             offerPrice: offerCol 
//               ? safeNumber(row[offerCol]) 
//               : (priceCol ? safeNumber(row[priceCol]) : 0),
//             stock: 0,
//             rating: 0,
//             timestamp: '',
//             images: [],
//             sellerId: '',
//             sizeVariants: []
//           };
          
//           products[productId] = newProduct;

//           // Enhanced image collection logic from Node.js code
//           const imageColumns = headers.filter(col => 
//             col.toLowerCase().includes('image') || col.toLowerCase().includes('img')
//           );
//           const images = [];
//           imageColumns.forEach(col => {
//             const val = String(row[col] || '').trim();
//             if (val && val.toLowerCase() !== 'nan') {
//               images.push(val);
//             }
//           });
//           products[productId].images = images;
//         }

//         // Add size variant
//         if (size) {
//           products[productId].sizeVariants.push({
//             size,
//             stock: variantStock,
//             sku: row[skuCol] || '',
//             price: safeNumber(row[priceCol] || 0)
//           });
//         }

//         // Sum stock
//         products[productId].stock += variantStock;

//         // Enhanced dynamic field addition logic from Node.js code
//         headers.forEach(col => {
//           const colClean = col.trim();
//           const val = row[colClean];
          
//           // Add extra fields dynamically (enhanced logic from Node.js)
//           if (
//             !ALIASES.includes(colClean.toLowerCase()) &&
//             !CORE_FIELDS.has(colClean) &&
//             !colClean.toLowerCase().startsWith('image') &&
//             colClean.toLowerCase() !== 'size' &&
//             val && String(val).toLowerCase() !== 'nan'
//           ) {
//             products[productId][colClean] = String(val);
//           }
//         });
        

//       });

//       const productList = Object.values(products);
      
//       if (productList.length === 0) {
//         alert('No products were generated! Check your CSV format and column names.');
//         return;
//       }
      
//       // Enhanced success message with processing summary (from Node.js code)
//       console.log(`✅ Processing completed. Generated ${productList.length} products from ${data.length} rows.`);
//       alert(`✅ Success! Processed ${productList.length} products from ${data.length} rows.`);
      
//       setProcessedData(productList);
      

      
//     } catch (error) {
//       alert(`Error processing CSV: ${error.message}`);
//     } finally {
//       setProcessing(false);
//     }
//   };

//   const downloadJSON = () => {
//     // Always use processed data
//     const dataToDownload = processedData;
    
//     if (!dataToDownload) {
//       alert('No data to download');
//       return;
//     }
    
//     if (!Array.isArray(dataToDownload)) {
//       alert('Invalid data format');
//       return;
//     }
    
//     if (dataToDownload.length === 0) {
//       alert('No data to download');
//       return;
//     }
    
//     try {
//       // Convert all field names to lowercase without spaces
//       const normalizedData = dataToDownload.map(item => {
//         const normalizedItem = {};
//         Object.keys(item).forEach(key => {
//           // Convert to lowercase and remove spaces
//           const normalizedKey = key.toLowerCase().replace(/\s+/g, '');
//           normalizedItem[normalizedKey] = item[key];
//         });
//         return normalizedItem;
//       });
      
//       const dataStr = JSON.stringify(normalizedData, null, 2);
      
//       const dataBlob = new Blob([dataStr], { type: 'application/json' });
//       const url = URL.createObjectURL(dataBlob);
      
//       // Generate unique filename with timestamp
//       const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
//       const fileName = `products_${timestamp}.json`;
      
//       const link = document.createElement('a');
//       link.href = url;
//       link.download = fileName;
//       document.body.appendChild(link);
//       link.click();
//       document.body.removeChild(link);
//       URL.revokeObjectURL(url);
      
//     } catch (error) {
//       alert(`Download failed: ${error.message}`);
//     }
//   };

//   return (
//     <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
//       {/* Header */}
//       <div className="mb-6 sm:mb-8">
//         <div className="flex items-center space-x-3 mb-2">
//           <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
//           <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900">
//             Python Automation
//           </h1>
//         </div>
//         <p className="text-sm sm:text-base text-gray-600">
//           CSV to JSON converter with intelligent column mapping and product processing
//         </p>
//       </div>

//       <div className="max-w-4xl mx-auto">
//         {/* Main Processing Panel */}
//         <div>
//           <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 sm:p-6">
//             <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-4 flex items-center">
//               <FileText className="w-5 h-5 mr-2 text-blue-600" />
//               File Processing
//             </h2>
            
//             {/* File Upload */}
//             <div className="mb-6">
//               <label className="block text-sm font-medium text-gray-700 mb-2">
//                 Upload CSV or Excel File
//               </label>
//               <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
//                 <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
//                 <input
//                   type="file"
//                   accept=".csv,.xlsx,.xls"
//                   onChange={handleFileUpload}
//                   className="hidden"
//                   id="csv-upload"
//                 />
//                 <label htmlFor="csv-upload" className="cursor-pointer">
//                   <span className="text-blue-600 hover:text-blue-700 font-medium">
//                     Click to upload
//                   </span>
//                   <span className="text-gray-500"> or drag and drop</span>
//                 </label>
//                 <p className="text-xs text-gray-500 mt-1">CSV and Excel files (.csv, .xlsx, .xls)</p>
//               </div>
//               {file && (
//                 <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
//                   <div className="flex items-center justify-between">
//                     <p className="text-sm text-green-800 flex items-center">
//                       <CheckCircle className="w-4 h-4 mr-2" />
//                       Selected: {file.name}
//                     </p>
//                     <button
//                       onClick={() => {
//                         setFile(null);
//                         setProcessedData(null);
//                       }}
//                       className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors"
//                       title="Remove file"
//                     >
//                       <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
//                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
//                       </svg>
//                     </button>
//                   </div>
//                   <p className="text-xs text-green-600 mt-1">
//                     File Type: {file.name.toLowerCase().endsWith('.csv') ? 'CSV' : 'Excel'} | 
//                     Size: {(file.size / 1024).toFixed(1)} KB
//                   </p>
//                 </div>
//               )}
//             </div>



//             {/* Action Buttons */}
//             <div className="flex flex-col sm:flex-row gap-3 mb-6">
//               <button
//                 onClick={processCSV}
//                 disabled={!file || processing}
//                 className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
//               >
//                 <Play className="w-4 h-4 mr-2" />
//                 {processing ? 'Processing...' : 'Process File'}
//               </button>
              
//               <button
//                 onClick={downloadJSON}
//                 disabled={!processedData}
//                 className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
//               >
//                 <Download className="w-4 h-4 mr-2" />
//                 Download JSON
//               </button>
//             </div>

//             {/* Results Summary */}
//             {processedData && (
//               <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
//                 <h3 className="text-lg font-semibold text-green-800 mb-2">Processing Results</h3>
//                 <div className="grid grid-cols-2 gap-4 text-sm">
//                   <div>
//                     <span className="text-green-700 font-medium">Total Products:</span>
//                     <span className="ml-2 text-green-900">{processedData.length}</span>
//                   </div>
//                   <div>
//                     <span className="text-green-700 font-medium">File Size:</span>
//                     <span className="ml-2 text-green-900">
//                       {(JSON.stringify(processedData).length / 1024).toFixed(2)} KB
//                     </span>
//                   </div>
//                 </div>
//               </div>
//             )}
//           </div>
//         </div>
//       </div>




//     </div>
//   );
// };

// export default PythonAutomation;