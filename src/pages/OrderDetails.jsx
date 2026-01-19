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
  RefreshCw,
  Image as ImageIcon
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
      if (order.status === 'packed' || order.orderStatus === 'packed') acc.packed += 1
      return acc
    }, { total: 0, pending: 0, packed: 0, delivered: 0 })
  }, [orders])

  const getSellerIdFromProduct = (product) => {
    if (!product) return null

    return (
      product.sellerId ??
      product.sellerID ??
      product.vendorId ??
      product.vendorID ??
      product.userId ??
      product.uid ??
      null
    )
  }

  // Get product image URL from various possible field names
  const getProductImage = (product) => {
    return (
      product.image ||
      product.imageUrl ||
      product.img ||
      product.thumbnail ||
      product.photo ||
      product.productImage ||
      'https://via.placeholder.com/100x100?text=No+Image'
    )
  }

  // Fix Firebase Storage URL if needed
  const fixImageUrl = (url) => {
    if (!url) return 'https://via.placeholder.com/100x100?text=No+Image'

    if (url.includes('firebasestorage.googleapis.com')) {
      if (url.includes('alt=media')) {
        return url;
      }
      if (url.includes('?') && !url.includes('token=')) {
        return `${url}&alt=media`;
      }
    }
    return url;
  }

  // Check if order belongs to specific seller (MODIFIED FUNCTION)
  const normalizeOrderForSeller = (order, targetSellerId) => {
    if (!order || !targetSellerId) return null

    // Check for items/products in different possible field names
    const allItems = order.items || order.products || order.orderItems || []

    const sellerItems = allItems.filter(item => {
      const itemSellerId = getSellerIdFromProduct(item)
      if (!itemSellerId) return false
      return String(itemSellerId) === String(targetSellerId)
    })

    // If no items belong to this seller, return null
    if (sellerItems.length === 0) {
      console.warn("NO PRODUCTS FOR SELLER", {
        orderId: order.id,
        targetSellerId,
        allItems
      })
      return null
    }

    // Add image URL to each product and fix URLs
    const sellerItemsWithImages = sellerItems.map(item => ({
      ...item,
      imageUrl: fixImageUrl(getProductImage(item))
    }))

    // Calculate total for these items
    const totalForSeller = sumProductTotal(sellerItemsWithImages)

    // Merge customer info from different possible locations
    const customerInfo = order.customerInfo || order.customer || {}
    const addressInfo = order.shippingAddress || order.address || customerInfo.address || 'N/A'

    return {
      ...order,
      id: order.id || order.orderId || `ORD-${Date.now()}`,
      products: sellerItemsWithImages,
      totalForSeller,
      customer: {
        name: customerInfo.name || order.customerName || 'N/A',
        email: customerInfo.email || order.customerEmail || 'N/A',
        phone: customerInfo.phone || customerInfo.phoneNumber || order.customerPhone || 'N/A'
      },
      shippingAddress: addressInfo,
      status: (order.status === 'processing' ? 'packed' : order.status) ||
        (order.orderStatus === 'processing' ? 'packed' : order.orderStatus) ||
        'pending',
      createdAt: order.createdAt || order.orderDate || order.timestamp,
      paymentMethod: order.paymentMethod || order.paymentType || 'cod',
      __path: order.__path
    }
  }

  // Check if order has items from multiple sellers (NEW FUNCTION)
  const getOrderSellerIds = (order) => {
    const allItems = order.items || order.products || order.orderItems || []
    const sellerIds = new Set()

    allItems.forEach(item => {
      const sellerId = getSellerIdFromProduct(item)
      if (sellerId) {
        sellerIds.add(String(sellerId))
      }
    })

    return Array.from(sellerIds)
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
                setMessage(`Loaded specific order: ${normalized.id}`)
              } else {
                setMessage('No products in this order match your seller ID.')
              }
            } else {
              setMessage('Order not found at provided path.')
            }
          } catch (err) {
            console.error('Failed fetching specific order:', err)
            setMessage('Error fetching specific order. Check Firestore permissions.')
          } finally {
            setIsLoading(false)
            return
          }
        }
      }

      let allOrders = []

      try {
        // Try collectionGroup first - this requires proper Firestore indexes
        const ordersQuery = collectionGroup(db, 'orders')
        const ordersSnapshot = await getDocs(ordersQuery)

        allOrders = ordersSnapshot.docs.map(doc => ({
          id: doc.id,
          __path: doc.ref.path,
          ...doc.data()
        }))

        console.log(`Found ${allOrders.length} orders via collectionGroup`)

      } catch (err) {
        console.error('Error fetching orders via collectionGroup:', err)

        // Fallback: try to fetch from user-specific path
        if (currentUserUid) {
          try {
            setMessage('Using fallback method to fetch orders...')
            const userOrdersRef = collectionGroup(db, 'orders')
            const q = query(userOrdersRef, where('sellerId', '==', currentUserUid))
            const querySnapshot = await getDocs(q)

            allOrders = querySnapshot.docs.map(doc => ({
              id: doc.id,
              __path: doc.ref.path,
              ...doc.data()
            }))

            console.log(`Found ${allOrders.length} orders via fallback method`)
          } catch (fallbackErr) {
            console.error('Fallback fetch also failed:', fallbackErr)
            setMessage('Error fetching orders. Please check Firestore rules and indexes.')
          }
        }
      }

      // === MODIFIED LOGIC ===
      // 1. First filter orders that have items from target seller
      const ordersWithTargetSeller = []

      for (const order of allOrders) {
        const sellerIdsInOrder = getOrderSellerIds(order)

        // Check if target seller has items in this order
        if (sellerIdsInOrder.includes(String(targetSellerId))) {
          const normalized = normalizeOrderForSeller(order, targetSellerId)
          if (normalized) {
            ordersWithTargetSeller.push(normalized)
          }
        }
      }

      // Sort by date (newest first)
      ordersWithTargetSeller.sort((a, b) => {
        const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() :
          (a.createdAt ? new Date(a.createdAt).getTime() : 0)
        const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() :
          (b.createdAt ? new Date(b.createdAt).getTime() : 0)
        return tb - ta
      })

      setOrders(ordersWithTargetSeller)

      if (ordersWithTargetSeller.length === 0) {
        setMessage(`No orders found with products from seller ID: ${targetSellerId}`)
        console.log('Available seller IDs in orders:',
          allOrders.map(order => ({
            orderId: order.id,
            sellerIds: getOrderSellerIds(order)
          }))
        )
      } else {
        setMessage(`Found ${ordersWithTargetSeller.length} order(s) with your products`)
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
      let orderRef

      if (orderObj && orderObj.__path) {
        orderRef = doc(db, ...orderObj.__path.split('/').filter(Boolean))
      } else {
        const userOrdersRef = collectionGroup(db, 'orders')
        const q = query(userOrdersRef, where('__name__', '==', orderId))
        const querySnapshot = await getDocs(q)
        if (!querySnapshot.empty) {
          orderRef = querySnapshot.docs[0].ref
        }
      }

      await updateDoc(orderRef, {
        status: newStatus,
        orderStatus: newStatus,
        updatedAt: new Date()
      })

      // ✅ FIX #1: Update ORDERS LIST (MOST IMPORTANT)
      setOrders(prev =>
        prev.map(o =>
          o.id === orderId
            ? { ...o, status: newStatus, orderStatus: newStatus }
            : o
        )
      )

      // ✅ FIX #2: Update MODAL STATE
      setSelectedOrder(prev =>
        prev
          ? { ...prev, status: newStatus, orderStatus: newStatus }
          : prev
      )

      setMessage('Order status updated successfully!')
    } catch (err) {
      console.error(err)
      setMessage('Error updating order status')
    } finally {
      setIsUpdating(false)
    }
  }

  useEffect(() => {
    fetchOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerId, orderPath, currentUserUid])

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

    const matchesFilter =
      filterStatus === 'all' ||
      order.status === filterStatus ||
      order.orderStatus === filterStatus

    return matchesSearch && matchesFilter
  })

  const getStatusColor = (status) => {
    const stat = (status || '').toLowerCase()
    switch (stat) {
      case 'packed': return 'bg-amber-50 text-amber-700 border border-amber-200'
      case 'pending': return 'bg-gray-50 text-gray-700 border border-gray-200'
      case 'delivered': return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
      default: return 'bg-gray-50 text-gray-700 border border-gray-200'
    }
  }

  const getStatusIcon = (status) => {
    const stat = (status || '').toLowerCase()
    switch (stat) {
      case 'packed': return <Package className="w-4 h-4 text-amber-600" />
      case 'pending': return <Clock className="w-4 h-4 text-gray-600" />
      default: return <Clock className="w-4 h-4 text-gray-600" />
    }
  }

  const OrderModal = ({ order, onClose }) => {
    const [statusToUpdate, setStatusToUpdate] = useState(order.status || order.orderStatus || 'pending')
    if (!order) return null

    // Check if order status is already packed
    const isAlreadyPacked = (order.status === 'packed' || order.orderStatus === 'packed')

    const handleUpdate = () => {
      // Prevent update if already packed
      if (isAlreadyPacked) {
        setMessage('Order is already packed and cannot be updated.')
        return
      }

      if (statusToUpdate !== (order.status || order.orderStatus)) {
        updateOrderStatus(order.id, statusToUpdate, order)
      }
      onClose()
    }

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-purple-200 shadow-2xl">
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
              {isAlreadyPacked && (
                <span className="px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-700 border border-green-200">
                  <CheckCircle className="w-4 h-4 inline mr-1" />
                  Status Locked
                </span>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="bg-white border border-purple-200/70 rounded-xl p-4">
              <h3 className="font-semibold mb-3 text-lg text-purple-700">Customer Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-700 mb-2"><strong className="text-slate-900 block text-xs uppercase tracking-wider mb-1">Name:</strong> {order.customer?.name}</p>
                  <p className="text-slate-700 mb-2"><strong className="text-slate-900 block text-xs uppercase tracking-wider mb-1">Email:</strong> {order.customer?.email}</p>
                  <p className="text-slate-700"><strong className="text-slate-900 block text-xs uppercase tracking-wider mb-1">Phone:</strong> {order.customer?.phone}</p>
                </div>
                <div>
                  <p className="text-slate-700 mb-2"><strong className="text-slate-900 block text-xs uppercase tracking-wider mb-1">Payment Method:</strong>
                    <span className={`inline-block ml-2 px-2 py-1 rounded text-xs ${order.paymentMethod === 'cod' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                      {order.paymentMethod?.toUpperCase()}
                    </span>
                  </p>
                  <p className="text-slate-700 mb-2"><strong className="text-slate-900 block text-xs uppercase tracking-wider mb-1">Order Date:</strong> {formatOrderDate(order.createdAt || order.orderDate)}</p>
                  <p className="text-slate-700"><strong className="text-slate-900 block text-xs uppercase tracking-wider mb-1">Shipping Address:</strong> {order.shippingAddress}</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-purple-200/70 rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-lg text-purple-700">Your Products ({order.products?.length || 0})</h3>
                <div className="text-sm text-slate-500">
                  Total Items: {order.products?.reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)}
                </div>
              </div>

              <div className="space-y-4">
                {order.products?.map((product, index) => (
                  <div key={index} className="flex items-start bg-white rounded-lg border border-purple-200 p-4">
                    <div className="flex-shrink-0 w-24 h-24 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.onerror = null
                          e.target.src = 'https://via.placeholder.com/100x100?text=No+Image'
                          e.target.className = "w-12 h-12 object-contain"
                        }}
                      />
                    </div>

                    <div className="ml-4 flex-grow">
                      <p className="font-medium text-slate-900 text-lg">{product.name}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {product.id && (
                          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">ID: {product.id}</span>
                        )}
                        {product.sellerId && (
                          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">Seller ID: {product.sellerId}</span>
                        )}
                        {product.selectedColor && (
                          <span className="text-xs text-white bg-purple-500 px-2 py-1 rounded">Color: {product.selectedColor}</span>
                        )}
                        {product.selectedSize && (
                          <span className="text-xs text-white bg-blue-500 px-2 py-1 rounded">Size: {product.selectedSize}</span>
                        )}
                        {product.sku && (
                          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">SKU: {product.sku}</span>
                        )}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        <p>Price per unit: ₹{Number(product.price ?? 0).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="text-right ml-4">
                      <p className="text-slate-700 text-sm mb-1">
                        Quantity: <strong className="text-lg">{product.quantity}</strong>
                      </p>
                      <p className="font-semibold text-green-600 text-lg">
                        ₹{(Number(product.price ?? 0) * Number(product.quantity ?? 1)).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 mt-6 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg">
                <div className="flex justify-between items-center font-bold text-lg">
                  <span className="text-purple-900">Total Amount for Your Products:</span>
                  <span className="text-green-700 text-2xl">₹{Number(order.totalForSeller ?? 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Update Order Status Section - Conditionally rendered */}
            {!isAlreadyPacked ? (
              <div className="bg-white border border-purple-200/70 rounded-xl p-4">
                <h3 className="font-semibold mb-3 text-lg text-purple-700">Update Order Status</h3>
                <div className="flex flex-col md:flex-row md:items-center gap-4">
                  <div className="flex-grow">
                    <select
                      value={statusToUpdate}
                      onChange={(e) => setStatusToUpdate(e.target.value)}
                      className="w-full bg-white border border-purple-200 text-slate-900 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      disabled={isAlreadyPacked}
                    >
                      <option value="pending">⏳ Pending</option>
                      <option value="packed">📦 Packed</option>
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={handleUpdate}
                      disabled={statusToUpdate === (order.status || order.orderStatus) || isUpdating || isAlreadyPacked}
                      className={`px-6 py-3 rounded-lg text-white font-medium flex items-center justify-center gap-2 ${
                        statusToUpdate === (order.status || order.orderStatus) || isUpdating || isAlreadyPacked
                          ? 'bg-purple-300 cursor-not-allowed'
                          : 'bg-gradient-to-r from-purple-600 to-purple-800 hover:opacity-95 hover:shadow-lg'
                      }`}
                    >
                      {isUpdating ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        <>
                          <Package className="w-5 h-5" />
                          Save Status Update
                        </>
                      )}
                    </button>
                    <button
                      onClick={onClose}
                      className="px-6 py-3 border border-purple-200 rounded-lg text-purple-700 hover:bg-purple-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <p className="text-sm text-slate-500 mt-3">
                  Current status: <span className={`font-semibold ${getStatusColor(order.status).replace('border ', '')} px-2 py-1 rounded`}>
                    {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
                  </span>
                </p>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
                <div className="flex items-center space-x-4">
                  <div className="bg-green-100 p-3 rounded-full">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-green-800 mb-1">Order Already Packed</h3>
                    <p className="text-green-700">
                      This order has been packed and cannot be modified further. 
                      The status is now locked and ready for shipping.
                    </p>
                    <div className="mt-3 flex items-center space-x-2">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(order.status)}`}>
                        Status: {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
                      </span>
                      <span className="text-sm text-green-600">
                        <Clock className="w-4 h-4 inline mr-1" />
                        Updated on: {formatOrderDate(order.updatedAt || new Date())}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
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
            <div className="bg-white/80 p-5 rounded-xl border border-purple-200 shadow-xl hover:shadow-2xl transition-shadow">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Your Orders</h3>
              <p className="text-3xl font-bold text-purple-800 mt-1">{statusCounts.total}</p>
            </div>
            <div className="bg-white/80 p-5 rounded-xl border border-purple-200 shadow-xl hover:shadow-2xl transition-shadow">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Pending</h3>
              <p className="text-3xl font-bold text-amber-700 mt-1">{statusCounts.pending}</p>
            </div>
            <div className="bg-white/80 p-5 rounded-xl border border-purple-200 shadow-xl hover:shadow-2xl transition-shadow">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Packed</h3>
              <p className="text-3xl font-bold text-indigo-700 mt-1">{statusCounts.packed}</p>
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
                      placeholder="Search your orders (ID, customer, product...)"
                      value={searchTerm}
                      onChange={handleSearchChange}
                      onKeyDown={handleKeyDown}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
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
                      <option value="packed">Packed</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    className="flex items-center text-purple-700 bg-purple-50 border border-purple-200 px-4 py-2 rounded-lg hover:bg-purple-100 transition-colors"
                    onClick={fetchOrders}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh Orders
                  </button>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-purple-50 border-b border-purple-200">
                  <tr>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Order ID</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Your Products</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Your Total</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-200">
                  {filteredOrders.length > 0 ? filteredOrders.map((order) => (
                    <tr key={order.__path || order.id} className="bg-white hover:bg-purple-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-mono text-sm font-semibold text-purple-900">{order.id}</div>
                        {order.__path && (
                          <div className="text-xs text-slate-500 truncate max-w-xs" title={order.__path}>
                            {order.__path.split('/').pop()}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{order.customer?.name || 'N/A'}</div>
                          <div className="text-xs text-slate-500">{order.customer?.email || 'N/A'}</div>
                          <div className="text-xs text-slate-500">{order.customer?.phone || 'N/A'}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-700">
                          <div className="font-medium mb-1">{order.products?.length || 0} item(s)</div>
                          <div className="flex -space-x-2">
                            {order.products?.slice(0, 3).map((product, idx) => (
                              <div key={idx} className="w-10 h-10 rounded-full border-2 border-white bg-gray-100 overflow-hidden shadow-sm">
                                <img
                                  src={product.imageUrl}
                                  alt={product.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.onerror = null
                                    e.target.src = 'https://via.placeholder.com/40x40?text=IMG'
                                  }}
                                />
                              </div>
                            ))}
                            {order.products?.length > 3 && (
                              <div className="w-10 h-10 rounded-full border-2 border-white bg-purple-100 flex items-center justify-center text-xs font-semibold text-purple-700">
                                +{order.products.length - 3}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-emerald-700">₹{Number(order.totalForSeller ?? 0).toLocaleString()}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-600">{formatOrderDate(order.createdAt || order.orderDate)}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(order.status)}
                          <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(order.status)}`}>
                            {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
                            {(order.status === 'packed' || order.orderStatus === 'packed') && (
                              <CheckCircle className="w-3 h-3 ml-1 inline" />
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="text-purple-700 hover:text-purple-800 flex items-center bg-purple-50 hover:bg-purple-100 px-3 py-2 rounded-lg transition-colors"
                          >
                            <Eye className="w-4 h-4 mr-2" /> View
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="7" className="p-8 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-500">
                          <Package className="w-16 h-16 mb-4 text-slate-300" />
                          <div className="text-lg font-medium mb-2">No orders found</div>
                          <p className="text-sm max-w-md mb-4">
                            No orders contain your products. Try adjusting your search or filter.
                          </p>
                          <button
                            onClick={fetchOrders}
                            className="text-purple-700 hover:text-purple-800 flex items-center bg-purple-50 hover:bg-purple-100 px-4 py-2 rounded-lg transition-colors"
                          >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Refresh Orders
                          </button>
                        </div>
                      </td>
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