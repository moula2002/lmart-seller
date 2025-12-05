import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  FileText,
  Package,
  ShoppingCart,
  Plus,
  Bot,
  Upload,
  LogOut,
  User
} from 'lucide-react'

const Sidebar = ({ user, onLogout }) => {
  const location = useLocation()

  const menuItems = [
    { path: '/profile', icon: User, label: 'Profile' },
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/documentation', icon: FileText, label: 'Seller Documentation' },
    { path: '/products', icon: Package, label: 'My Products' },
    { path: '/orders', icon: ShoppingCart, label: 'Order Details' },
    { path: '/add-product', icon: Plus, label: 'Add Product' },
    { path: '/automation', icon: Bot, label: 'Python Automation' },
    { path: '/bulk-upload', icon: Upload, label: 'JSON Bulk Upload' }
  ]

  return (
    // 1. Background Gradient: Changed to purple-900/800
    <div className="w-64 h-screen bg-gradient-to-b from-purple-900 to-purple-800 shadow-2xl relative">
      {/* Header */}
      <div className="p-6 border-b border-purple-700">
        <h1 className="text-xl font-bold text-white">BaapStore</h1>
      </div>

      {/* Navigation */}
      <nav className="mt-6 pb-40 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-6 py-3 text-sm font-medium transition-colors duration-200 ${
                isActive
                  // 2. Active Link: Changed blue to purple
                  ? 'bg-white/10 text-white border-r-2 border-white'
                  // Hover: Changed gray to purple, Text: light-gray/white for contrast
                  : 'text-gray-300 hover:bg-purple-700/50 hover:text-white'
              }`}
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* User Profile & Logout */}
      <div className="absolute bottom-0 w-64 border-t border-purple-700">
        {/* User Profile Section */}
        <div className="p-4 border-b border-purple-700">
          <div className="flex items-center space-x-3">
            {/* User Avatar: Changed blue to white with purple text for contrast */}
            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-purple-800" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name || 'Seller'}</p>
              <p className="text-xs text-gray-300 truncate">{user?.email || 'seller@namah.com'}</p>
              {/* ID Text: Changed blue to purple-300 */}
              <p className="text-xs text-purple-300 truncate">ID: {user?.sellerId || 'N/A'}</p>
            </div>
          </div>
        </div>
        
        {/* Logout Button */}
        <div className="p-4">
          <button
            onClick={onLogout}
            // Logout Button: Changed red to a softer pink/red for dark backgrounds, or a subtle hover
            className="flex items-center w-full px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-800/30 rounded-lg transition-colors duration-200"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Logout
          </button>
        </div>
      </div>
    </div>
  )
}

export default Sidebar