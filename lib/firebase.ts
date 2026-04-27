// Import the functions you need from the SDKs you need
import { initializeApp,  getApps, getApp  } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage} from "firebase/storage";
import { GoogleAuthProvider } from 'firebase/auth';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDYpkzkDEIn9kKISVxRmK0YFmlceyeRJ5E",
  authDomain: "mini-blog-website-41d33.firebaseapp.com",
  projectId: "mini-blog-website-41d33",
  storageBucket: "mini-blog-website-41d33.firebasestorage.app",
  messagingSenderId: "1098774248837",
  appId: "1:1098774248837:web:1749ee26a42d358ca258ec"
};

// Initialize Firebase
const app = !getApps().length
  ? initializeApp(firebaseConfig)
  : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });