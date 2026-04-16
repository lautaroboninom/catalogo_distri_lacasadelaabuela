import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

import firebaseConfig from '../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth();
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Enable offline persistence if we want, ignoring errors if multiple tabs open
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code == 'failed-precondition') {
    console.warn("Multiple tabs open, persistence can only be enabled in one tab at a a time.");
  } else if (err.code == 'unimplemented') {
    console.warn("The current browser does not support all of the features required to enable persistence");
  }
});

export const signInWithGoogle = () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account'
    });
    return signInWithPopup(auth, provider);
}

export const logOut = () => signOut(auth);

// Shared Types
export interface Product {
    id: string;
    name: string;
    sku: string;
    description: string;
    category: string;
    price: number;
    cost: number;
    stock: number;
    imageUrl: string;
    offerPrice?: number;
    isNew?: boolean;
    status: 'active' | 'inactive';
}

export interface Promotion {
    id: string;
    name: string;
    type: 'volume' | 'percentage';
    targetType: 'all' | 'category' | 'product';
    targetId?: string; // Empty if 'all', category name if 'category', product id if 'product'
    value?: number; // Valid for percentage discounts (e.g., 15 for 15% off)
    buyQuantity?: number; // Valid for volume discounts (e.g., 3 for 3x2)
    payQuantity?: number; // Valid for volume discounts (e.g., 2 for 3x2)
    startDate?: string;
    endDate?: string;
}

// Error Boundary handling pattern for Firestore
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
