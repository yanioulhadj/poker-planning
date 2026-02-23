'use client';

import { useState, useEffect, useCallback } from 'react';
import { User } from '@/app/lib/types';

const STORAGE_KEY = 'poker-planning-user';

function generateId(): string {
  return crypto.randomUUID();
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoaded(true);
  }, []);

  const loginAsGuest = useCallback((name: string) => {
    const newUser: User = {
      id: generateId(),
      name,
      authType: 'guest',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    setUser(newUser);
    return newUser;
  }, []);

  const loginWithGoogle = useCallback((name: string, avatar: string) => {
    const newUser: User = {
      id: generateId(),
      name,
      avatar,
      authType: 'google',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    setUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  const updateName = useCallback((name: string) => {
    if (!user) return;
    const updated = { ...user, name };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setUser(updated);
  }, [user]);

  return { user, loaded, loginAsGuest, loginWithGoogle, logout, updateName };
}
