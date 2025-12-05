// Debug Firebase connection and data
import { db } from '../config/firebase'
import { collection, getDocs, addDoc } from 'firebase/firestore'

export const debugFirebaseConnection = () => {
  console.log('=== FIREBASE DEBUG START ===')
  console.log('Firebase db object:', db)
  console.log('Firebase app:', db.app)
  console.log('Firebase project ID:', db.app.options.projectId)
  console.log('=== FIREBASE DEBUG END ===')
}

export const testFirebaseRead = async () => {
  console.log('=== TESTING FIREBASE READ ===')
  try {
    const productsRef = collection(db, 'products')
    console.log('Collection reference created:', productsRef)
    
    const snapshot = await getDocs(productsRef)
    console.log('Read successful! Documents found:', snapshot.size)
    
    snapshot.forEach((doc) => {
      console.log('Document:', doc.id, doc.data())
    })
    
    return { success: true, count: snapshot.size }
  } catch (error) {
    console.error('Read failed:', error)
    return { success: false, error: error.message }
  }
}

export const testFirebaseWrite = async () => {
  console.log('=== TESTING FIREBASE WRITE ===')
  try {
    const testData = {
      name: 'Debug Test Product',
      price: 999,
      status: 'active',
      createdAt: new Date(),
      isDebugTest: true
    }
    
    const docRef = await addDoc(collection(db, 'products'), testData)
    console.log('Write successful! Document ID:', docRef.id)
    
    return { success: true, docId: docRef.id }
  } catch (error) {
    console.error('Write failed:', error)
    return { success: false, error: error.message }
  }
}