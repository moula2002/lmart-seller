import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Mail, Phone, MapPin, Building, Eye, EyeOff, ArrowRight, Lock } from 'lucide-react'
import { useSellerContext } from '../context/SellerContext'
import { auth, db } from '../config/firebase'
import { createUserWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth'
import { doc, setDoc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore'

const SellerRegister = () => {
  const navigate = useNavigate()
  const { dispatch } = useSellerContext()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    businessName: '',
    businessType: '',
    gstNumber: '',
    address: '',
    city: '',
    state: '',
    pincode: ''
  })

  const [errors, setErrors] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isUserLoggedIn, setIsUserLoggedIn] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState('')

  // Check auth state on mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsUserLoggedIn(!!user)
      setAuthChecked(true)
      
      // If user is logged in, populate email from their account (only if email is empty)
      if (user && user.email) {
        setFormData(prev => {
          if (!prev.email) {
            return { ...prev, email: user.email }
          }
          return prev
        })
      }
    })

    return () => unsubscribe()
  }, [])

  const businessTypes = [
    'Individual',
    'Proprietorship',
    'Partnership',
    'Private Limited Company',
    'Public Limited Company',
    'LLP (Limited Liability Partnership)'
  ]

  const indianStates = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry'
  ]

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }))
  }

  const validateForm = () => {
    const newErrors = {}
    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required'
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required'
    if (!formData.email.trim()) newErrors.email = 'Email is required'
    
    // Password validation - only required if user is not already logged in
    if (!isUserLoggedIn) {
      if (!formData.password) newErrors.password = 'Password is required'
      else if (formData.password.length < 6) newErrors.password = 'Password must be at least 6 characters'
      
      if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password'
      else if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match'
    }
    
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required'
    if (!formData.businessName.trim()) newErrors.businessName = 'Business name is required'
    if (!formData.businessType) newErrors.businessType = 'Business type is required'
    if (!formData.address.trim()) newErrors.address = 'Address is required'
    if (!formData.city.trim()) newErrors.city = 'City is required'
    if (!formData.state) newErrors.state = 'State is required'
    if (!formData.pincode.trim()) newErrors.pincode = 'Pincode is required'

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (formData.email && !emailRegex.test(formData.email)) newErrors.email = 'Please enter a valid email address'

    const phoneRegex = /^[6-9]\d{9}$/
    if (formData.phone && !phoneRegex.test(formData.phone)) newErrors.phone = 'Please enter a valid 10-digit phone number'

    const pincodeRegex = /^[1-9][0-9]{5}$/
    if (formData.pincode && !pincodeRegex.test(formData.pincode)) newErrors.pincode = 'Please enter a valid 6-digit pincode'

    if (formData.gstNumber) {
      const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
      if (!gstRegex.test(formData.gstNumber)) newErrors.gstNumber = 'Please enter a valid GST number'
    }

  
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleUseCurrentLocation = () => {
    setLocationError('')

    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported in this browser.')
      return
    }

    setLocationLoading(true)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords

          // Basic reverse geocoding using OpenStreetMap Nominatim
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`
          )

          if (!response.ok) {
            throw new Error('Failed to fetch address details.')
          }

          const data = await response.json()
          const addr = data.address || {}

          const city =
            addr.city ||
            addr.town ||
            addr.village ||
            addr.suburb ||
            ''

          const state = addr.state || ''
          const pincode = addr.postcode || ''

          // Build a readable address line
          const addressLineParts = [
            addr.house_number,
            addr.road,
            addr.neighbourhood,
            addr.suburb
          ].filter(Boolean)

          const addressText = addressLineParts.join(', ')

          setFormData(prev => ({
            ...prev,
            address: prev.address || addressText,
            city: prev.city || city,
            state: prev.state || state,
            pincode: prev.pincode || pincode
          }))

          // Clear field-level errors for location fields
          setErrors(prev => ({
            ...prev,
            address: '',
            city: '',
            state: '',
            pincode: ''
          }))
        } catch (err) {
          console.error('Location lookup failed:', err)
          setLocationError('Could not automatically fetch address. Please fill manually.')
        } finally {
          setLocationLoading(false)
        }
      },
      (err) => {
        console.error('Geolocation error:', err)
        if (err.code === 1) {
          setLocationError('Location permission denied. Please allow access or fill address manually.')
        } else {
          setLocationError('Unable to get current location. Please try again or fill manually.')
        }
        setLocationLoading(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
  }

 const handleSubmit = async (e) => {
  e.preventDefault()
  if (!validateForm()) return
  setIsLoading(true)

  try {
    let user = auth.currentUser
    let sellerId = null

    // If user is not logged in, create Firebase Auth account
    if (!isUserLoggedIn || !user) {
      try {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        )
        user = userCredential.user
        sellerId = user.uid
      } catch (authError) {
        if (authError.code === 'auth/email-already-in-use') {
          setErrors({ ...errors, email: 'This email is already registered. Please login instead.' })
          setIsLoading(false)
          return
        } else {
          throw authError
        }
      }
    } else {
      // User is already logged in (from main website)
      sellerId = user.uid
      
      // Check if seller profile already exists
      const existingSellerRef = doc(db, "sellers", sellerId)
      const existingSellerSnap = await getDoc(existingSellerRef)
      if (existingSellerSnap.exists()) {
        alert("You already have a seller account. Please login instead.")
        navigate("/seller/login")
        setIsLoading(false)
        return
      }
    }

    const sellerData = {
      sellerId,
      uid: sellerId,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email || user.email,
      phone: formData.phone,
      businessName: formData.businessName,
      businessType: formData.businessType,
      gstNumber: formData.gstNumber,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      pincode: formData.pincode,
      registrationDate: new Date().toISOString(),
      createdAt: new Date(),
      status: "pending",
      documentsUploaded: false,
      profileCompleted: false
    }

    // ✅ Create seller profile
    await setDoc(doc(db, "sellers", sellerId), sellerData)

    // ✅ Create or update user document with seller role
    const userRef = doc(db, "users", sellerId)
    const userSnap = await getDoc(userRef)
    
    if (userSnap.exists()) {
      // User exists, add seller role
      await updateDoc(userRef, {
        roles: arrayUnion("seller"),
        email: formData.email || user.email,
        displayName: `${formData.firstName} ${formData.lastName}`,
        updatedAt: new Date()
      })
    } else {
      // Create new user document
      await setDoc(userRef, {
        uid: sellerId,
        email: formData.email || user.email,
        displayName: `${formData.firstName} ${formData.lastName}`,
        roles: ["seller"],
        createdAt: new Date(),
        updatedAt: new Date()
      })
    }

    dispatch({
      type: "REGISTER_SELLER",
      payload: { id: sellerId, ...sellerData }
    })

    alert("🎉 Seller registration successful! Upload documents next.")
    navigate("/seller/documents")

  } catch (error) {
    console.error("Seller registration error:", error)
    let errorMessage = "Registration failed. Try again."
    if (error.code === 'auth/email-already-in-use') {
      errorMessage = "This email is already registered. Please login instead."
    } else if (error.code === 'auth/weak-password') {
      errorMessage = "Password is too weak. Please use a stronger password."
    } else if (error.code === 'auth/invalid-email') {
      errorMessage = "Invalid email address."
    }
    alert(errorMessage)
  } finally {
    setIsLoading(false)
  }
}
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-100 via-white to-purple-50 px-4 py-10">
      <div className="mx-auto max-w-5xl">
        {/* top hero */}
        <div className="mb-6 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-purple-700">Seller Registration</h1>
          <p className="mt-2 text-gray-600">Join our marketplace and start growing your business 🚀</p>
        </div>

        {/* main card */}
        <div className="rounded-2xl border border-purple-200 bg-white/80 backdrop-blur-md shadow-2xl">
          {/* subtle top gradient bar */}
          <div className="h-2 w-full rounded-t-2xl bg-gradient-to-r from-purple-500 via-fuchsia-500 to-purple-700" />

          <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
            {/* personal info */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
                  <User className="h-4 w-4 text-purple-600" />
                </span>
                <h2 className="text-lg font-semibold text-purple-700">Personal Information</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* First Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">First Name *</label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    placeholder="Enter your first name"
                    className={`w-full rounded-md border px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 ${errors.firstName ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>}
                </div>

                {/* Last Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Last Name *</label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    placeholder="Enter your last name"
                    className={`w-full rounded-md border px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 ${errors.lastName ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {errors.lastName && <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>}
                </div>

                {/* Email */}
                <div className="relative">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Email Address *</label>
                  <Mail className="pointer-events-none absolute right-3 top-9 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="you@example.com"
                    className={`w-full rounded-md border px-4 py-2 pr-9 outline-none focus:ring-2 focus:ring-purple-500 ${errors.email ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
                </div>

                {/* Password - Only show if user is not logged in */}
                {authChecked && !isUserLoggedIn && (
                  <>
                    <div className="relative">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Password *</label>
                      <Lock className="pointer-events-none absolute right-3 top-9 h-4 w-4 text-gray-400" />
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          name="password"
                          value={formData.password}
                          onChange={handleInputChange}
                          placeholder="Create a password (min 6 characters)"
                          className={`w-full rounded-md border px-4 py-2 pr-9 outline-none focus:ring-2 focus:ring-purple-500 ${errors.password ? 'border-red-500' : 'border-gray-300'}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-purple-600"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
                    </div>

                    <div className="relative">
                      <label className="mb-1 block text-sm font-medium text-gray-700">Confirm Password *</label>
                      <Lock className="pointer-events-none absolute right-3 top-9 h-4 w-4 text-gray-400" />
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          name="confirmPassword"
                          value={formData.confirmPassword}
                          onChange={handleInputChange}
                          placeholder="Confirm your password"
                          className={`w-full rounded-md border px-4 py-2 pr-9 outline-none focus:ring-2 focus:ring-purple-500 ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300'}`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-3 text-gray-400 hover:text-purple-600"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {errors.confirmPassword && <p className="mt-1 text-xs text-red-500">{errors.confirmPassword}</p>}
                    </div>
                  </>
                )}

                {/* Phone */}
                <div className="relative">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Phone Number *</label>
                  <Phone className="pointer-events-none absolute right-3 top-9 h-4 w-4 text-gray-400" />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    maxLength="10"
                    onChange={handleInputChange}
                    placeholder="10-digit mobile number"
                    className={`w-full rounded-md border px-4 py-2 pr-9 outline-none focus:ring-2 focus:ring-purple-500 ${errors.phone ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
                </div>
              </div>
            </section>

            {/* business info */}
            <section>
              <div className="mb-4 flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
                  <Building className="h-4 w-4 text-purple-600" />
                </span>
                <h2 className="text-lg font-semibold text-purple-700">Business Information</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Business Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Business Name *</label>
                  <input
                    type="text"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleInputChange}
                    placeholder="Enter your business name"
                    className={`w-full rounded-md border px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 ${errors.businessName ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {errors.businessName && <p className="mt-1 text-xs text-red-500">{errors.businessName}</p>}
                </div>

                {/* Business Type */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Business Type *</label>
                  <select
                    name="businessType"
                    value={formData.businessType}
                    onChange={handleInputChange}
                    className={`w-full rounded-md border px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 ${errors.businessType ? 'border-red-500' : 'border-gray-300'}`}
                  >
                    <option value="">Select business type</option>
                    {businessTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  {errors.businessType && <p className="mt-1 text-xs text-red-500">{errors.businessType}</p>}
                </div>

                {/* GST (optional) */}
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">GST Number (Optional)</label>
                  <input
                    type="text"
                    name="gstNumber"
                    value={formData.gstNumber}
                    onChange={handleInputChange}
                    maxLength="15"
                    placeholder="15-character GSTIN"
                    className={`w-full rounded-md border px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 ${errors.gstNumber ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {errors.gstNumber && <p className="mt-1 text-xs text-red-500">{errors.gstNumber}</p>}
                </div>
              </div>
            </section>

            {/* address */}
            <section>
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-purple-100">
                    <MapPin className="h-4 w-4 text-purple-600" />
                  </span>
                  <h2 className="text-lg font-semibold text-purple-700">Address Information</h2>
                </div>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={locationLoading}
                  className="text-xs md:text-sm px-3 py-1 rounded-full border border-purple-500 text-purple-700 hover:bg-purple-50 disabled:opacity-60"
                >
                  {locationLoading ? 'Detecting location...' : 'Use current location'}
                </button>
              </div>

              {locationError && (
                <p className="mb-2 text-xs text-red-500">
                  {locationError}
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Address */}
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">Business Address *</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    rows="3"
                    placeholder="Door no, street, area..."
                    className={`w-full rounded-md border px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 ${errors.address ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {errors.address && <p className="mt-1 text-xs text-red-500">{errors.address}</p>}
                </div>

                {/* City */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">City *</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    placeholder="City"
                    className={`w-full rounded-md border px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 ${errors.city ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {errors.city && <p className="mt-1 text-xs text-red-500">{errors.city}</p>}
                </div>

                {/* State */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">State *</label>
                  <select
                    name="state"
                    value={formData.state}
                    onChange={handleInputChange}
                    className={`w-full rounded-md border px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 ${errors.state ? 'border-red-500' : 'border-gray-300'}`}
                  >
                    <option value="">Select state</option>
                    {indianStates.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {errors.state && <p className="mt-1 text-xs text-red-500">{errors.state}</p>}
                </div>

                {/* Pincode */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Pincode *</label>
                  <input
                    type="text"
                    name="pincode"
                    value={formData.pincode}
                    onChange={handleInputChange}
                    maxLength="6"
                    placeholder="6-digit pincode"
                    className={`w-full rounded-md border px-4 py-2 outline-none focus:ring-2 focus:ring-purple-500 ${errors.pincode ? 'border-red-500' : 'border-gray-300'}`}
                  />
                  {errors.pincode && <p className="mt-1 text-xs text-red-500">{errors.pincode}</p>}
                </div>
              </div>
            </section>
            {/* submit */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full overflow-hidden rounded-md bg-gradient-to-r from-purple-600 to-purple-800 px-4 py-3 text-white transition hover:opacity-95 disabled:opacity-60"
              >
                <span className="absolute inset-0 translate-y-full bg-white/20 transition-transform duration-300 group-hover:translate-y-0" />
                <span className="relative flex items-center justify-center">
                  {isLoading ? (
                    <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white"></div>
                  ) : (
                    <>
                      Register as Seller <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
                </span>
              </button>
              <p className="mt-4 text-center text-sm text-gray-600">
                Already have an account?{' '}
                <button onClick={() => navigate('/seller/login')} className="font-medium text-purple-600 hover:underline">
                  Login here
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default SellerRegister
