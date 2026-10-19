'use client';
import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { fb } from '@/lib/firebase';

export function useUserRole() {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // fb().auth හරහා Firebase Auth instance එක ලබාගැනීම
    const firebaseAuth = fb()?.auth;

    if (!firebaseAuth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        try {
          const firebaseDb = fb()?.db;
          const userDoc = await getDoc(doc(firebaseDb, "users", user.uid));
          if (userDoc.exists()) {
            setRole(userDoc.data().role);
          } else {
            setRole('employee'); // Default role as fallback
          }
        } catch (error) {
          console.error("Error fetching user role:", error);
          setRole(null);
        }
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { role, loading };
}