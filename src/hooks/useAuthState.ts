import { useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { isFallbackAdminEmail } from '../adminAccess';

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let userDocUnsub: (() => void) | null = null;

    const unsub = onAuthStateChanged(auth, (user) => {
      userDocUnsub?.();
      userDocUnsub = null;
      setUser(user);

      if (user) {
        if (user.emailVerified && isFallbackAdminEmail(user.email)) {
          setIsAdmin(true);
          setLoading(false);
        } else {
          setLoading(true);
          userDocUnsub = onSnapshot(
            doc(db, 'users', user.uid),
            (userDoc) => {
              setIsAdmin(userDoc.data()?.role === 'admin');
              setLoading(false);
            },
            () => {
              setIsAdmin(false);
              setLoading(false);
            }
          );
        }
      } else {
        setIsAdmin(false);
        setLoading(false);
      }
    });

    return () => {
      userDocUnsub?.();
      unsub();
    };
  }, []);

  return { user, isAdmin, loading };
}
