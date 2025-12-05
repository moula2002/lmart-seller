import { collection, addDoc } from 'firebase/firestore'
import { db } from '../config/firebase'

export const addTestProduct = async () => {
  try {
    console.log('Adding test product to Firebase...')
    
    const testProduct = {
      name: 'Test Product from Code',
      description: 'This is a test product added directly from code',
      price: 299,
      stock: 50,
      category: 'Electronics',
      sku: 'TEST-001',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    console.log('Test product data:', testProduct)
    
    const docRef = await addDoc(collection(db, 'products'), testProduct)
    console.log('Test product added successfully with ID:', docRef.id)
    
    return {
      success: true,
      productId: docRef.id,
      message: 'Test product added successfully'
    }
    
  } catch (error) {
    console.error('Error adding test product:', error)
    return {
      success: false,
      error: error.message,
      code: error.code
    }
  }
}