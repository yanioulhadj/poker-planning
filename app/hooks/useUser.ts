'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { User } from '@/app/lib/types';

const STORAGE_KEY = 'poker-planning-user';

function generateId(): string {
  return crypto.randomUUID();
}

function sessionToUser(session: { user: { id?: string; name?: string | null; email?: string | null; image?: string | null } }): User {
  const u = session.user;
  return {
    id: u.id ?? u.email ?? crypto.randomUUID(),
    name: u.name ?? u.email ?? 'Utilisateur',
    avatar: u.image ?? undefined,
    authType: 'google',
  };
}

export function useUser() {
  const { data: session, status } = useSession();
  const [guestUser, setGuestUser] = useState<User | null>(null);
  const [loaded, setLoaded] = useState(false);

  const user: User | null = session?.user
    ? sessionToUser(session)
    : guestUser;

  useEffect(() => {
    if (status === 'loading') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && !session?.user) {
      try {
        setGuestUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    } else if (session?.user) {
      localStorage.removeItem(STORAGE_KEY);
    }
    setLoaded(true);
  }, [session?.user, status]);

  const loginAsGuest = useCallback((name: string) => {
    const newUser: User = {
      id: generateId(),
      name,
      authType: 'guest',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
    setGuestUser(newUser);
    return newUser;
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY);
    setGuestUser(null);
    if (session?.user) {
      const { signOut } = await import('next-auth/react');
      await signOut();
    }
  }, [session?.user]);

  const updateName = useCallback((name: string) => {
    if (!guestUser) return;
    const updated = { ...guestUser, name };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setGuestUser(updated);
  }, [guestUser]);

  const loadedWithSession = loaded && status !== 'loading';

  return { user, loaded: loadedWithSession, loginAsGuest, logout, updateName };
}
