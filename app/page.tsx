'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/app/hooks/useUser';

type Tab = 'create' | 'join';

export default function Home() {
  const router = useRouter();
  const { user, loaded, loginAsGuest } = useUser();
  const [tab, setTab] = useState<Tab>('create');
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) setName(user.name);
  }, [user]);

  const ensureUser = () => {
    if (user) return user;
    if (!name.trim()) {
      setError('Veuillez entrer votre pseudo');
      return null;
    }
    return loginAsGuest(name.trim());
  };

  const handleCreate = async () => {
    if (!roomName.trim()) {
      setError('Veuillez donner un nom à la salle');
      return;
    }
    const currentUser = ensureUser();
    if (!currentUser) return;

    setIsSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: roomName.trim(),
          userId: currentUser.id,
          userName: currentUser.name,
          avatar: currentUser.avatar,
          authType: currentUser.authType,
        }),
      });
      const data = await res.json();
      if (data.roomId) {
        router.push(`/room/${data.roomId}`);
      }
    } catch {
      setError('Erreur lors de la création de la salle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoin = () => {
    if (!roomCode.trim()) {
      setError('Veuillez entrer le code de la salle');
      return;
    }
    const currentUser = ensureUser();
    if (!currentUser) return;
    router.push(`/room/${roomCode.trim()}`);
  };

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500 text-3xl shadow-lg shadow-indigo-500/30">
            🃏
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Poker Planning</h1>
          <p className="mt-1 text-sm text-slate-500">Estimez vos tickets en équipe</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50">
          {/* Name input */}
          <div className="mb-6">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Votre pseudo
            </label>
            <input
              type="text"
              placeholder="Entrez votre pseudo..."
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          {/* Google sign-in placeholder */}
          <div className="mb-6">
            <div className="relative mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-slate-400">ou</span>
              </div>
            </div>
            <button
              onClick={() => {
                setError('Configurez NEXT_PUBLIC_GOOGLE_CLIENT_ID pour activer Google Sign-In');
              }}
              className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:shadow-sm"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Se connecter avec Google
            </button>
          </div>

          {/* Tabs */}
          <div className="mb-4 flex rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => { setTab('create'); setError(''); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition cursor-pointer ${
                tab === 'create'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Créer une salle
            </button>
            <button
              onClick={() => { setTab('join'); setError(''); }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition cursor-pointer ${
                tab === 'join'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Rejoindre
            </button>
          </div>

          {tab === 'create' ? (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Nom de la salle (ex: Sprint 42)"
                value={roomName}
                onChange={(e) => { setRoomName(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                onClick={handleCreate}
                disabled={isSubmitting}
                className="w-full cursor-pointer rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-600 disabled:opacity-50"
              >
                {isSubmitting ? 'Création...' : 'Créer la salle'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Code de la salle (ex: abc-1234)"
                value={roomCode}
                onChange={(e) => { setRoomCode(e.target.value); setError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <button
                onClick={handleJoin}
                disabled={isSubmitting}
                className="w-full cursor-pointer rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-600 disabled:opacity-50"
              >
                Rejoindre la salle
              </button>
            </div>
          )}

          {error && (
            <p className="mt-3 text-center text-xs text-red-500">{error}</p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Poker Planning — Estimation agile SCRUM
        </p>
      </div>
    </div>
  );
}
