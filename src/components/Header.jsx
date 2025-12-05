import React from 'react'
import { User, Bell, Search } from 'lucide-react'

const Header = ({ user }) => {
  return (
    <header className="bg-gradient-to-r from-purple-50 via-white to-purple-100 backdrop-blur-sm border-b border-purple-200/50 px-6 py-4 shadow-md">
      <div className="flex items-center justify-between">
        {/* Left side - Search */}
        <div className="flex items-center flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-purple-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full pl-10 pr-4 py-2 border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white/80 text-gray-800 placeholder-gray-400 shadow-sm"
            />
          </div>
        </div>

        {/* Right side - User info */}
        <div className="flex items-center space-x-4">
          {/* Notifications */}
          <button className="relative p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-100 rounded-lg transition-all duration-200">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-fuchsia-500 rounded-full animate-pulse"></span>
          </button>

          {/* User Profile */}
          <div className="flex items-center space-x-3 bg-white/70 border border-purple-100 rounded-xl px-3 py-2 shadow-sm hover:shadow-md transition-all">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center shadow-inner">
              <User className="w-4 h-4 text-white" />
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900">{user?.name || 'Admin'}</p>
              <p className="text-xs text-purple-600">{user?.email || 'admin@example.com'}</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
