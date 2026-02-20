import React, { createContext, useContext, useReducer, useEffect } from 'react'

// Initial state
const initialState = {
  seller: null,
  isAuthenticated: false,
  loading: false,
  error: null
}

// Action types
const actionTypes = {
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  LOGIN_SELLER: 'LOGIN_SELLER',
  REGISTER_SELLER: 'REGISTER_SELLER',
  LOGOUT: 'LOGOUT'
}

// Reducer
const sellerReducer = (state, action) => {
  switch (action.type) {

    case actionTypes.SET_LOADING:
      return { ...state, loading: action.payload }

    case actionTypes.SET_ERROR:
      return { ...state, error: action.payload, loading: false }

    case actionTypes.CLEAR_ERROR:
      return { ...state, error: null }

    case actionTypes.LOGIN_SELLER:
      return {
        ...state,
        seller: action.payload,
        isAuthenticated: true,
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

    case actionTypes.LOGOUT:
      return initialState

    default:
      return state
  }
}

// Create context
const SellerContext = createContext()

// Provider
export const SellerProvider = ({ children }) => {
  const [state, dispatch] = useReducer(sellerReducer, initialState)

  // Load from localStorage on refresh
  useEffect(() => {
    const savedSeller = localStorage.getItem('seller')

    if (savedSeller) {
      try {
        const sellerData = JSON.parse(savedSeller)

        dispatch({
          type: actionTypes.LOGIN_SELLER,
          payload: sellerData
        })
      } catch (error) {
        console.error('Error parsing seller data:', error)
        localStorage.removeItem('seller')
      }
    }
  }, [])

  // Save to localStorage
  useEffect(() => {
    if (state.isAuthenticated && state.seller) {
      localStorage.setItem('seller', JSON.stringify(state.seller))
    } else {
      localStorage.removeItem('seller')
    }
  }, [state.isAuthenticated, state.seller])

  const value = {
    ...state,
    dispatch
  }

  return (
    <SellerContext.Provider value={value}>
      {children}
    </SellerContext.Provider>
  )
}

// Hook
export const useSellerContext = () => {
  const context = useContext(SellerContext)
  if (!context) {
    throw new Error('useSellerContext must be used within SellerProvider')
  }
  return context
}

export default SellerContext