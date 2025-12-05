import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'

// General Pages
import Dashboard from './pages/Dashboard'
import SellerProducts from './pages/SellerProducts' // <--- ADDED
import AddProduct from './pages/AddProduct' // <--- ADDED

// Seller Auth/Onboarding
import SellerRegister from './pages/SellerRegister'
import SellerLogin from './pages/SellerLogin'
import SellerDocuments from './pages/SellerDocuments'
import SellerPendingApproval from './pages/SellerPendingApproval'

import { SellerProvider } from './context/SellerContext'
// NOTE: Assuming pages are correctly defined in ./pages/...

const App = () => {

  return (
    <SellerProvider>
      <Router>
        <Routes>

          {/* Default Route */}
          <Route path="/" element={<Navigate to="/seller/register" replace />} />

          {/* Dashboard */}
          <Route path="/dashboard" element={<Dashboard />} />

          {/* Product Management Routes */}
          <Route path="/seller/products" element={<SellerProducts />} />
          <Route path="/add-products" element={<AddProduct />} /> {/* <--- NEW ROUTE ADDED */}
          
          {/* Seller Onboarding/Auth Routes */}
          <Route path="/seller/register" element={<SellerRegister />} />
          <Route path="/seller/login" element={<SellerLogin />} />
          <Route path="/seller/documents" element={<SellerDocuments />} />

          {/* Pending Approval Page */}
          <Route path="/seller/pending-approval" element={<SellerPendingApproval />} />

        </Routes>
      </Router>
    </SellerProvider>
  )
}

export default App