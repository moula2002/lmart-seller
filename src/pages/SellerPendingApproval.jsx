// SellerPendingApproval.jsx

import React, { useEffect, useState } from 'react';
import { auth, db } from '../config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Clock, Ban } from 'lucide-react';

const SellerPendingApproval = () => {
  const [status, setStatus] = useState('loading');
  const navigate = useNavigate();

  useEffect(() => {
    let unsubscribeAuth;
    let unsubscribeSeller;

    unsubscribeAuth = auth.onAuthStateChanged(user => {
      if (!user) {
        navigate('/seller/login', { replace: true });
        return;
      }

      // ✅ FIXED COLLECTION NAME
      const sellerRef = doc(db, 'sellers', user.uid);

      unsubscribeSeller = onSnapshot(sellerRef, snap => {
        if (!snap.exists()) {
          setStatus('not-found');
          return;
        }

        const data = snap.data();
        const currentStatus = data?.status || 'pending';

        setStatus(currentStatus);

        // ✅ AUTO REDIRECT WHEN APPROVED
        if (currentStatus === 'approved') {
          alert('🎉 Your account has been approved!');
          navigate('/seller/dashboard', { replace: true });
        }

        // Optional: if rejected
        if (currentStatus === 'rejected') {
          alert('❌ Your account was rejected. Please update documents.');
        }
      });

      return unsubscribeSeller;
    });

    return () => {
      if (unsubscribeAuth) unsubscribeAuth();
      if (unsubscribeSeller) unsubscribeSeller();
    };
  }, [navigate]);

  // ================= UI =================

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
        <p className="text-lg">Checking your approval status...</p>
      </div>
    );
  }

  if (status === 'blocked') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-100 px-4">
        <div className="bg-white shadow-xl rounded-2xl p-10 max-w-md w-full text-center border border-gray-200">
          <Ban className="w-10 h-10 text-red-600 mx-auto mb-4" />
          <h1 className="text-3xl font-extrabold text-red-900 mb-3">
            Account Blocked
          </h1>
          <p className="text-gray-700 text-md">
            Your account has been blocked. Please contact support.
          </p>
        </div>
      </div>
    );
  }

  // Default Pending UI
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-100 px-4">
      <div className="bg-white shadow-xl rounded-2xl p-10 max-w-md w-full text-center border border-gray-200">
        <div className="mx-auto w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-4">
          <Clock className="w-10 h-10 text-blue-600" />
        </div>

        <h1 className="text-3xl font-extrabold text-gray-900 mb-3">
          Review in Progress
        </h1>

        <p className="text-gray-700 text-md mb-1">
          Your documents have been received successfully.
        </p>

        <p className="text-gray-500 text-sm">
          Our team is reviewing your information.
          You will be automatically redirected once approved.
        </p>

        <div className="mt-6">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce"></div>
            <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce delay-150"></div>
            <div className="w-3 h-3 bg-blue-600 rounded-full animate-bounce delay-300"></div>
          </div>

          <p className="text-blue-700 font-semibold mt-3 text-sm">
            Waiting for approval...
          </p>
        </div>
      </div>
    </div>
  );
};

export default SellerPendingApproval;