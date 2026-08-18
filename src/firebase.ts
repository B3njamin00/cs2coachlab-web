import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyD7Xq0RMV1TTiwVifil39K0oWHI3-W2FLg",
  authDomain: "cs2-coach-lab.firebaseapp.com",
  projectId: "cs2-coach-lab",
  storageBucket: "cs2-coach-lab.firebasestorage.app",
  messagingSenderId: "985771598344",
  appId: "1:985771598344:web:3ee5a7766ffa1c50be67bd",
  measurementId: "G-05QWKJSJBK",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);

export default app;