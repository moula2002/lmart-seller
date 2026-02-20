import React from "react"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"

// ================= PAGES =================
import Dashboard from "./pages/Dashboard"
import SellerProducts from "./pages/SellerProducts"
import AddProduct from "./pages/AddProduct"
import EditProduct from "./pages/EditProduct"

import SellerRegister from "./pages/SellerRegister"
import SellerLogin from "./pages/SellerLogin"
import SellerDocuments from "./pages/SellerDocuments"
import SellerPendingApproval from "./pages/SellerPendingApproval"

// ================= CONTEXT =================
import { SellerProvider } from "./context/SellerContext"

// ================= ROLE GUARD =================
import RequireRole from "./pages/RequireRole"

const App = () => {
  return (
    <SellerProvider>
      <Router>
        <Routes>

          {/* ================= DEFAULT ================= */}
          <Route path="/" element={<Navigate to="/seller/login" replace />} />

          {/* ================= SELLER AUTH ================= */}
          <Route path="/seller/register" element={<SellerRegister />} />
          <Route path="/seller/login" element={<SellerLogin />} />

          {/* ================= PROTECTED SELLER ROUTES ================= */}

          <Route
            path="/seller/dashboard"
            element={
              <RequireRole role="seller">
                <Dashboard />
              </RequireRole>
            }
          />

          <Route
            path="/seller/products"
            element={
              <RequireRole role="seller">
                <SellerProducts />
              </RequireRole>
            }
          />

          <Route
            path="/seller/add-product"
            element={
              <RequireRole role="seller">
                <AddProduct />
              </RequireRole>
            }
          />

          <Route
            path="/seller/products/edit/:productId"
            element={
              <RequireRole role="seller">
                <EditProduct />
              </RequireRole>
            }
          />

          <Route
            path="/seller/documents"
            element={
              <RequireRole role="seller">
                <SellerDocuments />
              </RequireRole>
            }
          />

          <Route
            path="/seller/pending-approval"
            element={
              <RequireRole role="seller">
                <SellerPendingApproval />
              </RequireRole>
            }
          />

          {/* ================= FALLBACK ================= */}
          <Route path="*" element={<Navigate to="/seller/login" replace />} />

        </Routes>
      </Router>
    </SellerProvider>
  )
}

export default App