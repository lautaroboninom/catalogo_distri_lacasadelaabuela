import { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        // In real firestore rules we allow read of self, but we are also checking if email falls back to admin
        if (user.email === 'lautaroboninom@gmail.com') {
             setIsAdmin(true);
        } else {
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                setIsAdmin(userDoc.data()?.role === 'admin');
            } catch {
                setIsAdmin(false);
            }
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  return { user, isAdmin, loading };
}
