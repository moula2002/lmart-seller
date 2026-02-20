import { Navigate } from "react-router-dom"
import { useSellerContext } from "../context/SellerContext"

const RequireRole = ({ role, children }) => {
  const { seller } = useSellerContext()

  // 1️⃣ Not logged in
  if (!seller) {
    return <Navigate to="/seller/login" replace />
  }

  // 2️⃣ Role check
  // If seller object has roles array (recommended structure)
  if (role && seller?.roles) {
    if (!seller.roles.includes(role)) {
      return <Navigate to="/" replace />
    }
  }

  // 3️⃣ If using single role string (fallback)
  if (role && seller?.role && seller.role !== role) {
    return <Navigate to="/" replace />
  }

  return children
}

export default RequireRole