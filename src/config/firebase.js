// ✅ Import Firebase SDKs
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ✅ Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyB10u72cOS9UgQFSXKx509PuCCl8kFbFZo",
  authDomain: "emart-ecommerce.firebaseapp.com",
  projectId: "emart-ecommerce",
  storageBucket: "emart-ecommerce.firebasestorage.app",
  messagingSenderId: "730402982718",
  appId: "1:730402982718:web:0258d0fb6e4c092554fa6f",
  measurementId: "G-SFHKTQVX9B"
};

// ✅ Initialize Firebase
const app = initializeApp(firebaseConfig);

// ✅ Export Firebase Services
export const auth = getAuth(app);
export const storage = getStorage(app);

export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  useFetchStreams: false,
});
