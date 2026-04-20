import { initializeApp } from 'firebase/app';
import { AuthError, getAuth, signInWithPopup, signInWithRedirect, GoogleAuthProvider, signOut } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';

import firebaseConfig from './firebaseConfig';

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

const MOBILE_DEVICE_REGEX = /Android|iPhone|iPad|iPod|Mobile/i;

function isMobileBrowser() {
  return typeof navigator !== 'undefined' && MOBILE_DEVICE_REGEX.test(navigator.userAgent);
}

export const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: 'select_account'
    });

    if (isMobileBrowser()) {
      await signInWithRedirect(auth, provider);
      return;
    }

    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      const authError = error as AuthError;
      if (authError.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, provider);
        return;
      }
      throw error;
    }
}

export const logOut = () => signOut(auth);

export function getAuthErrorMessage(error: unknown): string {
  const authError = error as Partial<AuthError> & { message?: string };
  const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'este dominio';

  switch (authError.code) {
    case 'auth/popup-closed-by-user':
      return 'La ventana de Google se cerro antes de completar el ingreso. Volve a intentarlo.';
    case 'auth/popup-blocked':
      return 'El navegador bloqueo la ventana de ingreso. Habilita popups para este sitio.';
    case 'auth/unauthorized-domain':
      return `El dominio ${currentHost} no esta autorizado en Firebase Auth.`;
    case 'auth/operation-not-allowed':
      return 'Google no esta habilitado como proveedor en Firebase Authentication.';
    case 'auth/network-request-failed':
      return 'No hay conexion estable para iniciar sesion. Revisa internet e intenta de nuevo.';
    default:
      return authError.message || 'No se pudo iniciar sesion con Google.';
  }
}

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
    imageSourceType?: 'brand_web' | 'generated';
    imageSourceUrl?: string;
    imageUpdatedAt?: string;
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
