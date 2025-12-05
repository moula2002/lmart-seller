import React, { createContext, useContext, useReducer, useEffect } from 'react'

// Initial state
const initialState = {
  seller: null,
  isAuthenticated: false,
  documents: {
    identity: null,
    business: null,
    bank: null,
    address: null,
    product: null
  },
  verificationStatus: {
    overall: 'pending', // pending, in_review, approved, rejected
    identity: 'not_uploaded', // not_uploaded, uploaded, pending, approved, rejected
    business: 'not_uploaded',
    bank: 'not_uploaded',
    address: 'not_uploaded',
    product: 'not_uploaded'
  },
  notifications: [],
  loading: false,
  error: null
}

// Action types
const actionTypes = {
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  REGISTER_SELLER: 'REGISTER_SELLER',
  LOGIN_SELLER: 'LOGIN_SELLER',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGOUT: 'LOGOUT',
  UPDATE_SELLER_PROFILE: 'UPDATE_SELLER_PROFILE',
  UPLOAD_DOCUMENT: 'UPLOAD_DOCUMENT',
  UPDATE_DOCUMENT_STATUS: 'UPDATE_DOCUMENT_STATUS',
  SET_VERIFICATION_STATUS: 'SET_VERIFICATION_STATUS',
  ADD_NOTIFICATION: 'ADD_NOTIFICATION',
  REMOVE_NOTIFICATION: 'REMOVE_NOTIFICATION',
  CLEAR_NOTIFICATIONS: 'CLEAR_NOTIFICATIONS'
}

// Reducer function
const sellerReducer = (state, action) => {
  switch (action.type) {
    case actionTypes.SET_LOADING:
      return {
        ...state,
        loading: action.payload
      }

    case actionTypes.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false
      }

    case actionTypes.CLEAR_ERROR:
      return {
        ...state,
        error: null
      }

    case actionTypes.LOGIN_SUCCESS:
      return {
        ...state,
        seller: action.payload.seller,
        isAuthenticated: true,
        documents: action.payload.documents || state.documents,
        verificationStatus: action.payload.verificationStatus || state.verificationStatus,
        loading: false,
        error: null
      }

    case actionTypes.REGISTER_SELLER:
      return {
        ...state,
        seller: action.payload,
        isAuthenticated: true,
        loading: false,
        error: null
      }

    case actionTypes.LOGIN_SELLER:
      return {
        ...state,
        seller: action.payload,
        isAuthenticated: true,
        loading: false,
        error: null
      }

    case actionTypes.LOGOUT:
      return {
        ...initialState
      }

    case actionTypes.UPDATE_SELLER_PROFILE:
      return {
        ...state,
        seller: {
          ...state.seller,
          ...action.payload
        }
      }

    case actionTypes.UPLOAD_DOCUMENT:
      const { category, document } = action.payload
      return {
        ...state,
        documents: {
          ...state.documents,
          [category]: document
        },
        verificationStatus: {
          ...state.verificationStatus,
          [category]: 'uploaded'
        }
      }

    case actionTypes.UPDATE_DOCUMENT_STATUS:
      const { category: docCategory, status } = action.payload
      return {
        ...state,
        verificationStatus: {
          ...state.verificationStatus,
          [docCategory]: status
        }
      }

    case actionTypes.SET_VERIFICATION_STATUS:
      return {
        ...state,
        verificationStatus: {
          ...state.verificationStatus,
          ...action.payload
        }
      }

    case 'LOGOUT_SELLER':
      localStorage.removeItem('sellerData')
      return initialState

    case actionTypes.ADD_NOTIFICATION:
      return {
        ...state,
        notifications: [
          ...state.notifications,
          {
            id: Date.now(),
            ...action.payload,
            timestamp: new Date().toISOString()
          }
        ]
      }

    case actionTypes.REMOVE_NOTIFICATION:
      return {
        ...state,
        notifications: state.notifications.filter(
          notification => notification.id !== action.payload
        )
      }

    case actionTypes.CLEAR_NOTIFICATIONS:
      return {
        ...state,
        notifications: []
      }

    default:
      return state
  }
}

// Create context
const SellerContext = createContext()

// Custom hook to use seller context
export const useSeller = () => {
  const context = useContext(SellerContext)
  if (!context) {
    throw new Error('useSeller must be used within a SellerProvider')
  }
  return context
}

// Provider component
export const SellerProvider = ({ children }) => {
  const [state, dispatch] = useReducer(sellerReducer, initialState)

  // Load seller data from localStorage on mount
  useEffect(() => {
    const savedSeller = localStorage.getItem('seller')
    if (savedSeller) {
      try {
        const sellerData = JSON.parse(savedSeller)
        dispatch({
          type: actionTypes.LOGIN_SUCCESS,
          payload: sellerData
        })
      } catch (error) {
        console.error('Error loading seller data:', error)
        localStorage.removeItem('seller')
      }
    }
  }, [])

  // Save seller data to localStorage whenever it changes
  useEffect(() => {
    if (state.isAuthenticated && state.seller) {
      localStorage.setItem('seller', JSON.stringify({
        seller: state.seller,
        documents: state.documents,
        verificationStatus: state.verificationStatus
      }))
    } else {
      localStorage.removeItem('seller')
    }
  }, [state.isAuthenticated, state.seller, state.documents, state.verificationStatus])

  // Action creators
  const actions = {
    setLoading: (loading) => {
      dispatch({ type: actionTypes.SET_LOADING, payload: loading })
    },

    setError: (error) => {
      dispatch({ type: actionTypes.SET_ERROR, payload: error })
    },

    clearError: () => {
      dispatch({ type: actionTypes.CLEAR_ERROR })
    },

    login: async (credentials) => {
      try {
        dispatch({ type: actionTypes.SET_LOADING, payload: true })
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Mock seller data
        const sellerData = {
          sellers: {
            id: '12345',
            firstName: 'John',
            lastName: 'Doe',
            email: credentials.email,
            phone: '+91-9876543210',
            businessName: 'John\'s Electronics',
            businessType: 'Proprietorship',
            gstNumber: '27AAAAA0000A1Z5',
            address: '123 Business Street, Mumbai',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            registrationDate: '2024-01-15'
          },
          documents: {
            identity: {
              fileName: 'aadhaar.pdf',
              uploadDate: '2024-01-16',
              status: 'approved'
            },
            business: {
              fileName: 'gst_certificate.pdf',
              uploadDate: '2024-01-16',
              status: 'pending'
            },
            bank: null,
            address: null,
            product: null
          },
          verificationStatus: {
            overall: 'in_review',
            identity: 'approved',
            business: 'pending',
            bank: 'not_uploaded',
            address: 'not_uploaded',
            product: 'not_uploaded'
          }
        }
        
        dispatch({
          type: actionTypes.LOGIN_SUCCESS,
          payload: sellerData
        })
        
        return { success: true }
      } catch (error) {
        dispatch({ type: actionTypes.SET_ERROR, payload: error.message })
        return { success: false, error: error.message }
      }
    },

    register: async (registrationData) => {
      try {
        dispatch({ type: actionTypes.SET_LOADING, payload: true })
        
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Mock successful registration
        const newSeller = {
          id: Date.now().toString(),
          ...registrationData,
          registrationDate: new Date().toISOString().split('T')[0]
        }
        
        dispatch({
          type: actionTypes.LOGIN_SUCCESS,
          payload: {
            seller: newSeller,
            documents: initialState.documents,
            verificationStatus: initialState.verificationStatus
          }
        })
        
        actions.addNotification({
          type: 'success',
          title: 'Registration Successful',
          message: 'Welcome! Please upload your documents for verification.'
        })
        
        return { success: true }
      } catch (error) {
        dispatch({ type: actionTypes.SET_ERROR, payload: error.message })
        return { success: false, error: error.message }
      }
    },

    logout: () => {
      dispatch({ type: actionTypes.LOGOUT })
    },

    updateProfile: (profileData) => {
      dispatch({ type: actionTypes.UPDATE_SELLER_PROFILE, payload: profileData })
    },

    uploadDocument: async (category, file, documentType) => {
      try {
        dispatch({ type: actionTypes.SET_LOADING, payload: true })
        
        // Simulate file upload
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        const document = {
          fileName: file.name,
          fileSize: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          uploadDate: new Date().toLocaleDateString(),
          documentType: documentType,
          status: 'pending'
        }
        
        dispatch({
          type: actionTypes.UPLOAD_DOCUMENT,
          payload: { category, document }
        })
        
        actions.addNotification({
          type: 'success',
          title: 'Document Uploaded',
          message: `${category} document uploaded successfully. It will be reviewed within 24-48 hours.`
        })
        
        dispatch({ type: actionTypes.SET_LOADING, payload: false })
        return { success: true }
      } catch (error) {
        dispatch({ type: actionTypes.SET_ERROR, payload: error.message })
        return { success: false, error: error.message }
      }
    },

    updateDocumentStatus: (category, status, reason = null) => {
      dispatch({
        type: actionTypes.UPDATE_DOCUMENT_STATUS,
        payload: { category, status }
      })
      
      // Add notification for status change
      const statusMessages = {
        approved: 'Document approved successfully!',
        rejected: `Document rejected. ${reason || 'Please upload a valid document.'}`,
        pending: 'Document is under review.'
      }
      
      actions.addNotification({
        type: status === 'approved' ? 'success' : status === 'rejected' ? 'error' : 'info',
        title: `${category} Document ${status}`,
        message: statusMessages[status]
      })
    },

    updateOverallVerificationStatus: () => {
      const { verificationStatus } = state
      const requiredDocs = ['identity', 'business', 'bank', 'address']
      
      const allApproved = requiredDocs.every(doc => verificationStatus[doc] === 'approved')
      const anyRejected = requiredDocs.some(doc => verificationStatus[doc] === 'rejected')
      const allUploaded = requiredDocs.every(doc => 
        ['uploaded', 'pending', 'approved', 'rejected'].includes(verificationStatus[doc])
      )
      
      let overall = 'pending'
      if (allApproved) {
        overall = 'approved'
      } else if (anyRejected) {
        overall = 'rejected'
      } else if (allUploaded) {
        overall = 'in_review'
      }
      
      dispatch({
        type: actionTypes.SET_VERIFICATION_STATUS,
        payload: { overall }
      })
    },

    addNotification: (notification) => {
      dispatch({ type: actionTypes.ADD_NOTIFICATION, payload: notification })
      
      // Auto-remove notification after 5 seconds
      setTimeout(() => {
        actions.removeNotification(notification.id || Date.now())
      }, 5000)
    },

    removeNotification: (id) => {
      dispatch({ type: actionTypes.REMOVE_NOTIFICATION, payload: id })
    },

    clearNotifications: () => {
      dispatch({ type: actionTypes.CLEAR_NOTIFICATIONS })
    },

    // Utility functions
    getVerificationProgress: () => {
      const { verificationStatus } = state
      const requiredDocs = ['identity', 'business', 'bank', 'address']
      const approvedDocs = requiredDocs.filter(doc => verificationStatus[doc] === 'approved')
      return Math.round((approvedDocs.length / requiredDocs.length) * 100)
    },

    getUploadProgress: () => {
      const { verificationStatus } = state
      const requiredDocs = ['identity', 'business', 'bank', 'address']
      const uploadedDocs = requiredDocs.filter(doc => 
        ['uploaded', 'pending', 'approved', 'rejected'].includes(verificationStatus[doc])
      )
      return Math.round((uploadedDocs.length / requiredDocs.length) * 100)
    },

    canStartSelling: () => {
      return state.verificationStatus.overall === 'approved'
    }
  }

  const value = {
    ...state,
    dispatch,
    ...actions
  }

  return (
    <SellerContext.Provider value={value}>
      {children}
    </SellerContext.Provider>
  )
}

// Custom hook to use the SellerContext
export const useSellerContext = () => {
  const context = useContext(SellerContext)
  if (!context) {
    throw new Error('useSellerContext must be used within a SellerProvider')
  }
  return context
}

export default SellerContext