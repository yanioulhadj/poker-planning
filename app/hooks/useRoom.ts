'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RoomState } from '@/app/lib/types';

const POLL_INTERVAL = 1500;

export function useRoom(roomId: string, userId: string | undefined) {
  const [room, setRoom] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRoom = useCallback(async () => {
    if (!roomId || !userId) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}?userId=${userId}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Erreur inconnue');
        setRoom(null);
        return;
      }
      const data: RoomState = await res.json();
      setRoom(data);
      setError(null);
    } catch {
      setError('Impossible de se connecter au serveur');
    } finally {
      setLoading(false);
    }
  }, [roomId, userId]);

  useEffect(() => {
    fetchRoom();
    intervalRef.current = setInterval(fetchRoom, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchRoom]);

  const vote = useCallback(async (value: string) => {
    await fetch(`/api/rooms/${roomId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, value }),
    });
    fetchRoom();
  }, [roomId, userId, fetchRoom]);

  const reveal = useCallback(async () => {
    await fetch(`/api/rooms/${roomId}/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    fetchRoom();
  }, [roomId, userId, fetchRoom]);

  const reset = useCallback(async () => {
    await fetch(`/api/rooms/${roomId}/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    fetchRoom();
  }, [roomId, userId, fetchRoom]);

  const setTicket = useCallback(async (url: string, title: string) => {
    await fetch(`/api/rooms/${roomId}/ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, url, title }),
    });
    fetchRoom();
  }, [roomId, userId, fetchRoom]);

  const joinRoom = useCallback(async (userName: string, avatar?: string, authType?: string) => {
    await fetch(`/api/rooms/${roomId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, userName, avatar, authType }),
    });
    fetchRoom();
  }, [roomId, userId, fetchRoom]);

  return { room, error, loading, vote, reveal, reset, setTicket, joinRoom };
}
