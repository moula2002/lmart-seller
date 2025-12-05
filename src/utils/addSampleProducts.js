import { collection, addDoc } from 'firebase/firestore'
import { db } from '../config/firebase'

const sampleProducts = [
  {
    name: 'Wireless Headphones',
    description: 'High-quality wireless headphones with noise cancellation',
    category: 'Electronics',
    subcategory: 'Audio',
    price: 2999,
    comparePrice: 3499,
    sku: 'WH001',
    stock: 50,
    weight: 0.3,
    specifications: [
      { key: 'Battery Life', value: '30 hours' },
      { key: 'Connectivity', value: 'Bluetooth 5.0' },
      { key: 'Driver Size', value: '40mm' }
    ],
    tags: ['wireless', 'headphones', 'audio', 'bluetooth'],
    images: [],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: 'Cotton T-Shirt',
    description: 'Comfortable 100% cotton t-shirt for men',
    category: 'Clothing',
    subcategory: 'Men\'s Wear',
    price: 599,
    comparePrice: 799,
    sku: 'CT001',
    stock: 100,
    weight: 0.2,
    specifications: [
      { key: 'Material', value: '100% Cotton' },
      { key: 'Fit', value: 'Regular' },
      { key: 'Care', value: 'Machine Wash' }
    ],
    tags: ['cotton', 't-shirt', 'men', 'casual'],
    images: [],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: 'Smartphone Case',
    description: 'Protective case for smartphones with shock absorption',
    category: 'Electronics',
    subcategory: 'Accessories',
    price: 299,
    comparePrice: 399,
    sku: 'SC001',
    stock: 200,
    weight: 0.05,
    specifications: [
      { key: 'Material', value: 'TPU + PC' },
      { key: 'Protection', value: 'Drop Protection' },
      { key: 'Compatibility', value: 'Universal' }
    ],
    tags: ['case', 'protection', 'smartphone', 'accessories'],
    images: [],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: 'Running Shoes',
    description: 'Lightweight running shoes with advanced cushioning',
    category: 'Sports',
    subcategory: 'Footwear',
    price: 3499,
    comparePrice: 4299,
    sku: 'RS001',
    stock: 75,
    weight: 0.8,
    specifications: [
      { key: 'Material', value: 'Mesh + Synthetic' },
      { key: 'Sole', value: 'EVA Foam' },
      { key: 'Type', value: 'Running' }
    ],
    tags: ['running', 'shoes', 'sports', 'fitness'],
    images: [],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: 'Coffee Mug',
    description: 'Ceramic coffee mug with heat retention technology',
    category: 'Home & Kitchen',
    subcategory: 'Drinkware',
    price: 199,
    comparePrice: 299,
    sku: 'CM001',
    stock: 150,
    weight: 0.4,
    specifications: [
      { key: 'Material', value: 'Ceramic' },
      { key: 'Capacity', value: '350ml' },
      { key: 'Microwave Safe', value: 'Yes' }
    ],
    tags: ['mug', 'coffee', 'ceramic', 'kitchen'],
    images: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }
]

export const addSampleProducts = async () => {
  try {
    console.log('Adding sample products to Firebase...')
    
    for (const product of sampleProducts) {
      await addDoc(collection(db, 'products'), product)
      console.log(`Added product: ${product.name}`)
    }
    
    console.log('All sample products added successfully!')
    return { success: true, message: 'Sample products added successfully!' }
  } catch (error) {
    console.error('Error adding sample products:', error)
    return { success: false, message: 'Error adding sample products: ' + error.message }
  }
}

// Function to add a single product
export const addSingleProduct = async (productData) => {
  try {
    const docRef = await addDoc(collection(db, 'products'), {
      ...productData,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    console.log('Product added with ID:', docRef.id)
    return { success: true, id: docRef.id }
  } catch (error) {
    console.error('Error adding product:', error)
    return { success: false, message: error.message }
  }
}