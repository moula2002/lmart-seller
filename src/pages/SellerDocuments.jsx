import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, CheckCircle, ArrowRight, ArrowLeft, AlertCircle, Trash2, Eye } from 'lucide-react';
import { useSellerContext } from '../context/SellerContext';
import { storage, db, auth } from '../config/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from "firebase/auth";

const SellerDocuments = () => {

  const navigate = useNavigate();
  const { dispatch } = useSellerContext();

  const [currentStep, setCurrentStep] = useState(0);
  const [uploadedDocs, setUploadedDocs] = useState({});
  const [uploadProgress, setUploadProgress] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setAuthReady(true);
    });
    return unsub;
  }, []);

  const documentSteps = [
    { id: "identity", title: "Identity Proof", description: "Upload Aadhaar Card, PAN Card, or Passport", formats: "PDF, JPG, PNG (Max 5MB)" },
    { id: "business", title: "Business Proof", description: "Upload GST Certificate or Business Registration", formats: "PDF, JPG, PNG (Max 5MB)" },
    { id: "bank", title: "Bank Details", description: "Upload Cancelled Cheque or Bank Statement", formats: "PDF, JPG, PNG (Max 5MB)" }
  ];

  const getOverallProgress = () => {
    const done = documentSteps.filter(d => uploadedDocs[d.id]).length;
    return Math.round((done / documentSteps.length) * 100);
  };

  useEffect(() => {
    const fetchDocs = async () => {
      if (!auth.currentUser) {
        setIsLoading(false);
        return;
      }
      const user = auth.currentUser;
      const sellerRef = doc(db, "sellers", user.uid);
      const snap = await getDoc(sellerRef);

      if (snap.exists()) {
        const data = snap.data();
        if (data.documents) {
          setUploadedDocs(data.documents);
        }
      }
      setIsLoading(false);
    };

    if (authReady) fetchDocs();
  }, [authReady]);

  const handleViewDocument = (url) => {
    window.open(url, "_blank");
  };

  const handleFileUpload = async (categoryId, file) => {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("Max file size is 5MB");
      return;
    }

    const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!allowed.includes(file.type)) {
      alert("Invalid format. Allowed PDF, JPG, JPEG, PNG");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      alert("Auth still loading. Try again");
      return;
    }

    setIsUploading(true);
    setUploadProgress(prev => ({ ...prev, [categoryId]: 10 }));

    try {
      const sellerId = user.uid;
      const uuid = crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`;

      const ext = file.name.split(".").pop();
      const safeName = file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "_").substring(0, 60);

      const finalName = `${categoryId}_${safeName}_${uuid}.${ext}`;

      const fileRef = ref(storage, `seller-documents/${sellerId}/${finalName}`);
      const uploadTask = uploadBytesResumable(fileRef, file);

      uploadTask.on(
        "state_changed",
        snapshot => {
          const prog = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(prev => ({ ...prev, [categoryId]: Math.round(prog) }));
        },
        error => {
          alert("Upload failed");
          setIsUploading(false);
        },
        async () => {
          const fileUrl = await getDownloadURL(uploadTask.snapshot.ref);

          const metadataRecord = {
            fileUrl,
            fileName: finalName,
            originalFileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            uploadedAt: new Date().toISOString()
          };

          const sellerRef = doc(db, "sellers", user.uid);
          await updateDoc(sellerRef, {
            [`documents.${categoryId}`]: metadataRecord,
            [`verificationStatus.${categoryId}`]: "uploaded",
            updatedAt: new Date().toISOString()
          });

          setUploadedDocs(prev => ({ ...prev, [categoryId]: metadataRecord }));
          setUploadProgress(prev => ({ ...prev, [categoryId]: 100 }));
          setIsUploading(false);

          alert("Upload successful");
        }
      );
    } catch {
      alert("Upload failed");
      setIsUploading(false);
    }
  };

  const handleFileDelete = async categoryId => {
    const user = auth.currentUser;
    if (!user) return;

    const record = uploadedDocs[categoryId];
    if (!record) return;

    if (!window.confirm("Delete this file?")) return;

    try {
      const fileRef = ref(storage, `seller-documents/${user.uid}/${record.fileName}`);
      await deleteObject(fileRef).catch(() => {});

      const sellerRef = doc(db, "sellers", user.uid);
      await updateDoc(sellerRef, {
        [`documents.${categoryId}`]: null,
        [`verificationStatus.${categoryId}`]: "not_uploaded"
      });

      const temp = { ...uploadedDocs };
      delete temp[categoryId];
      setUploadedDocs(temp);

      alert("Deleted");
    } catch {
      alert("Delete failed");
    }
  };

  const handleSubmitForVerification = async () => {
    if (getOverallProgress() < 100) {
      alert("Upload all documents first");
      return;
    }

    const user = auth.currentUser;
    if (!user) return;

    try {
      const sellerRef = doc(db, "sellers", user.uid);
      await updateDoc(sellerRef, {
        documentsUploaded: true,
        documentsSubmittedAt: new Date().toISOString(),
        status: "pending_review",
        overallVerificationStatus: "under_review",
        updatedAt: new Date().toISOString()
      });

      dispatch({
        type: "UPLOAD_DOCUMENTS",
        payload: uploadedDocs
      });

      alert("Documents submitted successfully");

      navigate("/seller/pending-approval"); // Redirect updated
    } catch {
      alert("Submit failed");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xl">Loading document data...</p>
      </div>
    );
  }

  const currentStepData = documentSteps[currentStep];


  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">

        {/* HEADER */}
        <div className="bg-white shadow-xl rounded-2xl overflow-hidden mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Document Verification</h1>
                <p className="text-blue-100">Step {currentStep + 1} of {documentSteps.length}</p>
              </div>

              <div className="text-white text-right">
                <div className="text-2xl font-bold">{getOverallProgress()}%</div>
                <div className="text-sm">Complete</div>
              </div>
            </div>

            {/* Mini Steps */}
            <div className="mt-6 flex justify-between items-center">
              {documentSteps.map((step, index) => (
                <React.Fragment key={step.id}>
                  <div className="flex flex-col items-center cursor-pointer" onClick={() => setCurrentStep(index)}>
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                        ${index === currentStep ? "bg-yellow-400 text-black" :
                        uploadedDocs[step.id] ? "bg-green-500 text-white" :
                        "bg-blue-500/30 text-white"}`}
                    >
                      {uploadedDocs[step.id] ? <CheckCircle className="w-5 h-5" /> : index + 1}
                    </div>
                    <p className="text-xs mt-2">{step.title.split(" ")[0]}</p>
                  </div>

                  {index < documentSteps.length - 1 && (
                    <div className={`flex-1 h-1 mx-2
                      ${uploadedDocs[step.id] ? "bg-green-500" : "bg-blue-500/30"}`}
                    ></div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* STEP CONTENT */}
        <div className="bg-white shadow-xl rounded-2xl mb-8">
          <div className="px-8 py-6 bg-gray-50 border-b border-gray-200 flex items-center">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center mr-4">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{currentStepData.title}</h2>
              <p className="text-gray-600 mt-1">{currentStepData.description}</p>
              <p className="text-sm text-gray-500 mt-1 font-semibold">{currentStepData.formats}</p>
            </div>
          </div>

          <div className="px-8 py-8">
            {(() => {
              const uploadedDoc = uploadedDocs[currentStepData.id];
              const progress = uploadProgress[currentStepData.id] || 0;
              const isCurrentUploading = isUploading && progress > 0;

              return (
                <div>
                  {!uploadedDoc ? (
                    <div className="border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center bg-gray-100 hover:border-blue-500 hover:bg-blue-50">
                      <div className="w-12 h-12 mx-auto bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-4">
                        <Upload className="h-6 w-6 text-white" />
                      </div>

                      <label className="cursor-pointer">
                        <span className="text-lg font-semibold text-gray-900 block mb-2">
                          {isCurrentUploading ? "Uploading..." : "Click or Drag to Upload"}
                        </span>

                        <span className="text-sm text-gray-600">
                          {isCurrentUploading ? `Uploading ${progress}%` : "Max 5MB. Accepts PDF, JPG, PNG"}
                        </span>

                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={e => handleFileUpload(currentStepData.id, e.target.files[0])}
                          disabled={isUploading}
                        />
                      </label>

                      {isCurrentUploading && (
                        <div className="mt-8">
                          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full"
                              style={{ width: `${progress}%` }}
                            ></div>
                          </div>
                          <p className="text-sm font-medium text-blue-600 mt-2">{progress}% Complete</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-green-50 rounded-2xl p-6 border border-green-300 shadow-inner">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mr-4">
                            <CheckCircle className="h-5 w-5 text-white" />
                          </div>

                          <div>
                            <p className="text-lg font-semibold text-gray-900">{currentStepData.title} Uploaded</p>
                            <p className="text-gray-600 text-sm truncate max-w-xs">{uploadedDoc.originalFileName}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              Size: {(uploadedDoc.fileSize / 1024 / 1024).toFixed(2)} MB
                              Uploaded: {new Date(uploadedDoc.uploadedAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>

                        <div className="flex space-x-3">
                          <button
                            onClick={() => handleViewDocument(uploadedDoc.fileUrl)}
                            className="flex items-center bg-blue-600 text-white px-4 py-2 rounded-lg text-sm"
                          >
                            <Eye className="w-4 h-4 mr-1" /> View
                          </button>

                          <button
                            onClick={() => handleFileDelete(currentStepData.id)}
                            className="flex items-center bg-red-600 text-white px-4 py-2 rounded-lg text-sm"
                          >
                            <Trash2 className="w-4 h-4 mr-1" /> Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* NAV BUTTONS */}
        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => currentStep > 0 && setCurrentStep(currentStep - 1)}
            className="flex items-center px-6 py-3 bg-gray-100 text-gray-700 rounded-lg shadow"
            disabled={currentStep === 0}
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Previous
          </button>

          {currentStep < documentSteps.length - 1 ? (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={!uploadedDocs[currentStepData.id] || isUploading}
              className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg shadow-lg"
            >
              Next Document
              <ArrowRight className="w-5 h-5 ml-2" />
            </button>
          ) : (
            <button
              onClick={handleSubmitForVerification}
              disabled={getOverallProgress() < 100 || isUploading}
              className="flex items-center px-8 py-3 bg-green-600 text-white rounded-lg shadow-lg"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Submit All for Verification
            </button>
          )}
        </div>

        {isUploading && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 rounded-lg p-4 mb-6 shadow-md">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
              <p className="text-yellow-800 font-medium">
                Upload in progress. Do not close your browser.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default SellerDocuments;
