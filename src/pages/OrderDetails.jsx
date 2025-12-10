import React, { useState, useEffect, useMemo } from 'react'
import {
  Search,
  Filter,
  Eye,
  Download,
  Package,
  Truck,
  CheckCircle,
  Clock,
  RefreshCw
} from 'lucide-react'
import {
  collectionGroup,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  query,
  where
} from 'firebase/firestore'
import { onAuthStateChanged } from 'firebase/auth'
import { db, auth } from '../config/firebase'

// ---------------- Utils ----------------
const formatOrderDate = (timestamp) => {
  if (!timestamp) return 'N/A'
  try {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return 'Invalid Date'
  }
}

// Sum price*qty safely
const sumProductTotal = (products = []) =>
  products.reduce((acc, p) => {
    const price = Number(p.price ?? 0)
    const qty = Number(p.quantity ?? 1)
    return acc + price * qty
  }, 0)

// ---------------- Component ----------------
const OrderDetails = ({ sellerId = null, orderPath = null }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orders, setOrders] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [isUpdating, setIsUpdating] = useState(false)
  const [currentUserUid, setCurrentUserUid] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUserUid(user ? user.uid : null)
    })
    return () => unsub()
  }, [])

  // Counters for the visible (already filtered) orders
  const statusCounts = useMemo(() => {
    return orders.reduce((acc, order) => {
      acc.total += 1
      if (order.status === 'pending' || order.orderStatus === 'pending') acc.pending += 1
      if (order.status === 'processing' || order.orderStatus === 'processing') acc.processing += 1
      if (order.status === 'delivered' || order.deliveryStatus === 'delivered') acc.delivered += 1
      return acc
    }, { total: 0, pending: 0, processing: 0, delivered: 0 })
  }, [orders])

  const getSellerIdFromProduct = (product) => {
    return (
      product.sellerId ||
      product.sellerID ||
      product.sellerid ||
      product.seller
    )
  }

  // Normalize order to only show products from specific seller
  const normalizeOrderForSeller = (order, targetSellerId) => {
    if (!order || !targetSellerId) return null

    // Check for items/products in different possible field names
    const allItems = order.items || order.products || order.orderItems || []

    // Filter items that belong to the target seller
    const sellerItems = allItems.filter(item => {
      const itemSellerId = getSellerIdFromProduct(item)
      return itemSellerId && String(itemSellerId) === String(targetSellerId)
    })

    if (sellerItems.length === 0) return null

    // Calculate total for these items
    const totalForSeller = sumProductTotal(sellerItems)

    // Merge customer info from different possible locations
    const customerInfo = order.customerInfo || order.customer || {}

    return {
      ...order,
      id: order.id || order.orderId || `ORD-${Date.now()}`,
      products: sellerItems,
      totalForSeller,
      customer: {
        name: customerInfo.name || 'N/A',
        email: customerInfo.email || 'N/A',
        phone: customerInfo.phone || customerInfo.phoneNumber || 'N/A'
      },
      shippingAddress: customerInfo.address || order.shippingAddress || 'N/A',
      status: order.status || order.orderStatus || order.deliveryStatus || 'pending',
      createdAt: order.createdAt || order.orderDate,
      paymentMethod: order.paymentMethod || 'cod'
    }
  }

  const fetchOrders = async () => {
    setIsLoading(true)
    setMessage('')
    setOrders([])

    try {
      // Use prop sellerId or current logged-in user's ID
      const targetSellerId = sellerId || currentUserUid

      if (!targetSellerId) {
        setMessage('Please log in or provide a seller ID.')
        setIsLoading(false)
        return
      }

      // ---- Single specific order path ----
      if (orderPath && typeof orderPath === 'string') {
        const segments = orderPath.replace(/^\/+|\/+$/g, '').split('/')
        if (segments.length >= 4 && (segments[0] === 'users' || segments[0] === 'user')) {
          try {
            const orderRef = doc(db, segments[0], segments[1], 'orders', segments[3])
            const snap = await getDoc(orderRef)
            if (snap.exists()) {
              const orderData = { id: snap.id, __path: snap.ref.path, ...snap.data() }
              const normalized = normalizeOrderForSeller(orderData, targetSellerId)
              if (normalized) {
                setOrders([normalized])
              } else {
                setMessage('No products in this order match your seller ID.')
              }
            } else {
              setMessage('Order not found at provided path.')
            }
          } catch (err) {
            console.error('Failed fetching specific order:', err)
            setMessage('Error fetching specific order.')
          } finally {
            setIsLoading(false)
            return
          }
        }
      }

      let allOrders = []

      try {
        const ordersQuery = collectionGroup(db, 'orders')
        const ordersSnapshot = await getDocs(ordersQuery)

        allOrders = ordersSnapshot.docs.map(doc => ({
          id: doc.id,
          __path: doc.ref.path,
          ...doc.data()
        }))

      } catch (err) {
        console.error('Error fetching orders:', err)
        // Fallback: try to fetch from a specific path
        if (currentUserUid) {
          try {
            setMessage('Error fetching orders using collectionGroup. Check Firestore rules/index.')
          } catch (fallbackErr) {
            console.error('Fallback fetch also failed:', fallbackErr)
          }
        }
      }

      // Normalize and filter orders for this seller
      const sellerOrders = allOrders
        .map(order => normalizeOrderForSeller(order, targetSellerId))
        .filter(Boolean)

      // Sort by date (newest first)
      sellerOrders.sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() :
          (a.createdAt ? new Date(a.createdAt).getTime() : 0)
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() :
          (b.createdAt ? new Date(b.createdAt).getTime() : 0)
        return tb - ta
      })

      setOrders(sellerOrders)

      if (sellerOrders.length === 0) {
        setMessage(`No orders found with products from seller ID: ${targetSellerId}`)
      } else {
        setMessage(`Found ${sellerOrders.length} order(s) with your products`)
      }

    } catch (err) {
      console.error('Error in fetchOrders:', err)
      setMessage('Error loading orders. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const updateOrderStatus = async (orderId, newStatus, orderObj = null) => {
    setIsUpdating(true)
    try {
      if (orderObj && orderObj.__path) {
        const parts = orderObj.__path.split('/')
        if (parts.length >= 4) {
          const orderRef = doc(db, parts[0], parts[1], parts[2], parts[3])
          await updateDoc(orderRef, {
            status: newStatus,
            orderStatus: newStatus,
            deliveryStatus: newStatus,
            updatedAt: new Date()
          })
        } else {
          await updateDoc(doc(db, 'orders', orderId), {
            status: newStatus,
            updatedAt: new Date()
          })
        }
      } else {
        await updateDoc(doc(db, 'orders', orderId), {
          status: newStatus,
          updatedAt: new Date()
        })
      }

      // Update local state
      setOrders(prev => prev.map(o =>
        o.id === orderId ? ({ ...o, status: newStatus }) : o
      ))

      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(prev => ({ ...prev, status: newStatus }))
      }

      setMessage('Order status updated successfully!')
    } catch (err) {
      console.error('Error updating order status:', err)
      setMessage('Error updating order status. Please try again.')
    } finally {
      setIsUpdating(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, orderPath, currentUserUid])

  // ---------------- Search & suggestions ----------------
  const generateSuggestions = (searchValue) => {
    if (!searchValue.trim()) { setSuggestions([]); return }
    const searchLower = searchValue.toLowerCase().trim()
    const suggestionSet = new Set()
    orders.forEach(order => {
      if (order.id && order.id.toLowerCase().includes(searchLower)) suggestionSet.add(order.id)
      if (order.customer?.name?.toLowerCase().includes(searchLower)) suggestionSet.add(order.customer.name)
      if (order.customer?.email?.toLowerCase().includes(searchLower)) suggestionSet.add(order.customer.email)
      order.products?.forEach(product => {
        if (product.name?.toLowerCase().includes(searchLower)) suggestionSet.add(product.name)
      })
      if (order.shippingAddress && order.shippingAddress.toLowerCase().includes(searchLower)) suggestionSet.add(order.shippingAddress)
    })
    setSuggestions(Array.from(suggestionSet).slice(0, 8))
  }

  const handleSearchChange = (e) => {
    const value = e.target.value
    setSearchTerm(value)
    generateSuggestions(value)
    setShowSuggestions(true)
    setSelectedSuggestionIndex(-1)
  }

  const handleSuggestionClick = (suggestion) => {
    setSearchTerm(suggestion)
    setShowSuggestions(false)
    setSelectedSuggestionIndex(-1)
  }

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev < suggestions.length - 1 ? prev + 1 : 0)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : suggestions.length - 1)
        break
      case 'Enter':
        e.preventDefault()
        if (selectedSuggestionIndex >= 0) {
          handleSuggestionClick(suggestions[selectedSuggestionIndex])
        } else {
          setShowSuggestions(false)
        }
        break
      case 'Escape':
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        break
      default:
        break
    }
  }

  const filteredOrders = orders.filter(order => {
    const searchLower = searchTerm.toLowerCase().trim()
    const matchesSearch =
      (order.id && order.id.toLowerCase().includes(searchLower)) ||
      (order.customer?.name && order.customer.name.toLowerCase().includes(searchLower)) ||
      (order.customer?.email && order.customer.email.toLowerCase().includes(searchLower)) ||
      (order.customer?.phone && String(order.customer.phone).toLowerCase().includes(searchLower)) ||
      (order.products && order.products.some(product =>
        (product.name && product.name.toLowerCase().includes(searchLower)) ||
        (product.sku && product.sku.toLowerCase().includes(searchLower)) ||
        (product.id && product.id.toLowerCase().includes(searchLower))
      )) ||
      (order.shippingAddress && order.shippingAddress.toLowerCase().includes(searchLower)) ||
      (order.paymentMethod && order.paymentMethod.toLowerCase().includes(searchLower))

    const orderStatus = order.status || order.orderStatus || order.deliveryStatus || 'pending'
    const matchesFilter = filterStatus === 'all' || orderStatus === filterStatus
    return matchesSearch && matchesFilter
  })

  const getStatusColor = (status) => {
    const stat = (status || '').toLowerCase()
    switch (stat) {
      case 'delivered': return 'bg-green-50 text-green-700 border border-green-200'
      case 'shipped': return 'bg-indigo-50 text-indigo-700 border border-indigo-200'
      case 'processing': return 'bg-amber-50 text-amber-700 border border-amber-200'
      case 'pending': return 'bg-gray-50 text-gray-700 border border-gray-200'
      case 'cancelled': return 'bg-rose-50 text-rose-700 border-rose-200'
      default: return 'bg-gray-50 text-gray-700 border border-gray-200'
    }
  }

  const getStatusIcon = (status) => {
    const stat = (status || '').toLowerCase()
    switch (stat) {
      case 'delivered': return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'shipped': return <Truck className="w-4 h-4 text-indigo-600" />
      case 'processing': return <Package className="w-4 h-4 text-amber-600" />
      case 'pending': return <Clock className="w-4 h-4 text-gray-600" />
      default: return <Clock className="w-4 h-4 text-gray-600" />
    }
  }

  const OrderModal = ({ order, onClose }) => {
    const [statusToUpdate, setStatusToUpdate] = useState(order.status || order.orderStatus || 'pending')
    if (!order) return null

    const handleUpdate = () => {
      if (statusToUpdate !== (order.status || order.orderStatus)) {
        updateOrderStatus(order.id, statusToUpdate, order)
      }
      onClose()
    }

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-purple-200 shadow-2xl">
          <div className="p-6 border-b border-purple-200 sticky top-0 bg-gradient-to-r from-purple-600 to-purple-800 text-white rounded-t-2xl z-10">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Order: #{order.id}</h2>
              <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            <div className="flex items-center space-x-2 mt-2">
              {getStatusIcon(order.status)}
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(order.status)}`}>
                {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
              </span>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-white border border-purple-200/70 rounded-xl p-4">
              <h3 className="font-semibold mb-3 text-lg text-purple-700">Customer Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <p className="text-slate-700"><strong className="text-slate-900 block">Name:</strong> {order.customer?.name}</p>
                <p className="text-slate-700"><strong className="text-slate-900 block">Payment:</strong> {order.paymentMethod}</p>
              </div>
            </div>

            <div className="bg-white border border-purple-200/70 rounded-xl p-4">
              <h3 className="font-semibold mb-3 text-lg text-purple-700">Products ({order.products?.length || 0})</h3>
              <div className="space-y-3">
                {order.products?.map((product, index) => (
                  <div key={index} className="flex justify-between items-center bg-white rounded-lg border border-purple-200 p-3">
                    <div>
                      <p className="font-medium text-slate-900">{product.name}</p>
                      <p className="text-xs text-slate-500">ID: {product.id}</p>
                      {product.sellerId && (
                        <p className="text-xs text-slate-500">Seller ID: {product.sellerId}</p>
                      )}
                      {product.selectedColor && (
                        <p className="text-xs text-slate-500">Color: {product.selectedColor}</p>
                      )}
                      {product.selectedSize && (
                        <p className="text-xs text-slate-500">Size: {product.selectedSize}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-slate-700 text-sm">Qty: <strong>{product.quantity}</strong></p>
                      <p className="font-semibold text-green-600 text-sm">₹{Number(product.price ?? 0).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 mt-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex justify-between items-center font-bold text-lg">
                  <span className="text-purple-900">Total Amount (matching products):</span>
                  <span className="text-green-700">₹{Number(order.totalForSeller ?? 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="bg-white border border-purple-200/70 rounded-xl p-4">
              <h3 className="font-semibold mb-3 text-lg text-purple-700">Shipping & Tracking</h3>
              <div className="text-sm space-y-2">
                <p className="text-slate-700"><strong className="text-slate-900">Address:</strong> {order.shippingAddress}</p>
                <p className="text-slate-700"><strong className="text-slate-900">Order Date:</strong> {formatOrderDate(order.createdAt || order.orderDate)}</p>
                {order.deliveryDate && <p className="text-slate-700"><strong className="text-slate-900">Delivery Date:</strong> {formatOrderDate(order.deliveryDate)}</p>}
                {order.trackingNumber && <p className="text-slate-700"><strong className="text-slate-900">Tracking Number:</strong> <span className="font-mono text-amber-700">{order.trackingNumber}</span></p>}
              </div>
            </div>

            <div className="bg-white border border-purple-200/70 rounded-xl p-4">
              <h3 className="font-semibold mb-3 text-lg text-purple-700">Update Status</h3>
              <div className="flex items-center space-x-3">
                <select
                  value={statusToUpdate}
                  onChange={(e) => setStatusToUpdate(e.target.value)}
                  className="bg-white border border-purple-200 text-slate-900 rounded-lg px-3 py-2 flex-grow focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button
                  onClick={handleUpdate}
                  disabled={statusToUpdate === (order.status || order.orderStatus) || isUpdating}
                  className={`px-4 py-2 rounded-lg text-white font-medium flex items-center gap-2 ${statusToUpdate === (order.status || order.orderStatus) || isUpdating
                      ? 'bg-purple-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-purple-800 hover:opacity-95'
                    }`}
                >
                  {isUpdating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                  {isUpdating ? 'Updating...' : 'Save Update'}
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-purple-200 flex justify-end bg-white/80 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 border border-purple-200 rounded-lg text-purple-700 hover:bg-purple-50">
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 min-h-screen font-sans bg-gradient-to-br from-purple-100 via-white to-purple-50">
      <div className="mb-8 border-b border-purple-200 pb-4">
        <h1 className="text-4xl font-extrabold text-purple-800 mb-2 tracking-tight">Order Management Dashboard 📦</h1>
        <p className="text-slate-600 text-lg">Quickly track, search, and manage customer orders.</p>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-xl border ${message.includes('Error')
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
        >
          {message}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col justify-center items-center py-20 text-purple-600">
          <RefreshCw className="w-8 h-8 animate-spin mb-4" />
          <div className="text-xl">Loading orders... Please wait.</div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white/80 p-5 rounded-xl border border-purple-200 shadow-xl">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Orders</h3>
              <p className="text-3xl font-bold text-purple-800 mt-1">{statusCounts.total}</p>
            </div>
            <div className="bg-white/80 p-5 rounded-xl border border-purple-200 shadow-xl">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Pending</h3>
              <p className="text-3xl font-bold text-amber-700 mt-1">{statusCounts.pending}</p>
            </div>
            <div className="bg-white/80 p-5 rounded-xl border border-purple-200 shadow-xl">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Processing</h3>
              <p className="text-3xl font-bold text-indigo-700 mt-1">{statusCounts.processing}</p>
            </div>
            <div className="bg-white/80 p-5 rounded-xl border border-purple-200 shadow-xl">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Delivered</h3>
              <p className="text-3xl font-bold text-emerald-700 mt-1">{statusCounts.delivered}</p>
            </div>
          </div>

          <div className="bg-white/80 rounded-xl border border-purple-200 shadow-2xl mb-8">
            <div className="p-5 border-b border-purple-200">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-purple-500 w-4 h-4 z-10" />
                    <input
                      type="text"
                      placeholder="Search orders (ID, customer, product...)"
                      value={searchTerm}
                      onChange={handleSearchChange}
                      onKeyDown={handleKeyDown}
                      onFocus={() => setShowSuggestions(true)}
                      className="pl-10 pr-4 py-2 bg-white border border-purple-200 text-slate-900 rounded-lg w-full md:w-80 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-purple-200 rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto">
                        {suggestions.map((s, i) => (
                          <div
                            key={i}
                            className={`px-3 py-2 cursor-pointer text-sm ${i === selectedSuggestionIndex
                                ? 'bg-purple-100 text-purple-900'
                                : 'text-slate-700 hover:bg-purple-50'
                              }`}
                            onClick={() => handleSuggestionClick(s)}
                            onMouseEnter={() => setSelectedSuggestionIndex(i)}
                          >
                            {s}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Filter className="w-4 h-4 text-slate-500" />
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className="bg-white border border-purple-200 text-slate-900 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="all">All Status</option>
                      <option value="pending">Pending</option>
                      <option value="processing">Processing</option>
                      <option value="shipped">Shipped</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                <button
                  className="flex items-center text-purple-700 bg-purple-50 border border-purple-200 px-4 py-2 rounded-lg hover:bg-purple-100"
                  onClick={fetchOrders}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Refresh Orders
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-purple-50 border-b border-purple-200">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Order ID</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Products</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-200">
                  {filteredOrders.length > 0 ? filteredOrders.map((order) => (
                    <tr key={order.__path || order.id} className="bg-white hover:bg-purple-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-slate-900">{order.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{order.customer?.name || 'N/A'}</div>
                          <div className="text-xs text-slate-500">{order.customer?.email || 'N/A'}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-700">{order.products?.length || 0} item(s)</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-emerald-700">₹{Number(order.totalForSeller ?? 0).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{formatOrderDate(order.createdAt || order.orderDate)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(order.status)}
                          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                            {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button onClick={() => setSelectedOrder(order)} className="text-purple-700 hover:text-purple-800 flex items-center">
                          <Eye className="w-4 h-4 mr-1" /> View Details
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-slate-500 text-lg">No orders found matching your search and filter criteria.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {selectedOrder && <OrderModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
        </>
      )}
    </div>
  )
}

export default OrderDetails