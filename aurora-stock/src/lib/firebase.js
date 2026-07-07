// src/lib/firebase.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// 🔐 Firebase configuration
// (These values are safe to be public in a frontend app)
const firebaseConfig = {
  apiKey: "AIzaSyBJOX0xh9d_56ATFsLdXzl-KSjJoVIq-Ps",
  authDomain: "medtrak-b1cad.firebaseapp.com",
  projectId: "medtrak-b1cad",
  storageBucket: "medtrak-b1cad.firebasestorage.app",
  messagingSenderId: "604281618962",
  appId: "1:604281618962:web:5771242095bc8bc8f88ecb",
};

// 🚀 Initialise Firebase app (singleton)
const app = initializeApp(firebaseConfig);

// 📦 Firestore database
export const db = getFirestore(app);

// 👤 Firebase Authentication
export const auth = getAuth(app);

// (Optional future exports)
// export const storage = getStorage(app);
