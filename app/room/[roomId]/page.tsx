'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/app/hooks/useUser';
import { useRoom } from '@/app/hooks/useRoom';
import { VOTING_VALUES } from '@/app/lib/types';
import VotingCard from '@/app/components/VotingCard';
import ParticipantCard from '@/app/components/ParticipantCard';
import TicketPanel from '@/app/components/TicketPanel';
import VoteResults from '@/app/components/VoteResults';

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const router = useRouter();
  const { user, loaded, loginAsGuest } = useUser();
  const { room, error, loading, vote, reveal, reset, setTicket, joinRoom } = useRoom(roomId, user?.id);

  const [selectedVote, setSelectedVote] = useState<string | null>(null);
  const [showIframe, setShowIframe] = useState(false);
  const [copied, setCopied] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [joining, setJoining] = useState(false);
  const [jiraConfigured, setJiraConfigured] = useState(false);

  const isMaster = room?.masterId === user?.id;

  useEffect(() => {
    if (!loaded || !user || !room) return;
    joinRoom(user.name, user.avatar, user.authType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, user?.id, room?.id]);

  useEffect(() => {
    fetch(`/api/rooms/${roomId}/sync-jira`)
      .then((r) => r.json())
      .then((d) => setJiraConfigured(d.configured))
      .catch(() => {});
  }, [roomId]);

  useEffect(() => {
    if (room && !room.revealed) {
      setSelectedVote(null);
    }
  }, [room?.revealed, room]);

  const handleVote = async (value: string) => {
    setSelectedVote(value);
    await vote(value);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGuestJoin = () => {
    if (!guestName.trim()) return;
    setJoining(true);
    loginAsGuest(guestName.trim());
  };

  if (!loaded || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-slate-500">Chargement de la salle...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500 text-2xl shadow-lg shadow-indigo-500/30">
              🃏
            </div>
            <h1 className="text-xl font-bold text-slate-800">Rejoindre la salle</h1>
            <p className="mt-1 text-sm text-slate-500">Choisissez un pseudo pour participer</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50">
            <input
              type="text"
              placeholder="Votre pseudo..."
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGuestJoin()}
              className="mb-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              autoFocus
            />
            <button
              onClick={handleGuestJoin}
              disabled={joining || !guestName.trim()}
              className="w-full cursor-pointer rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-600 disabled:opacity-50"
            >
              Rejoindre
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 text-2xl">
            ⚠️
          </div>
          <h2 className="mb-2 text-lg font-bold text-slate-800">Salle introuvable</h2>
          <p className="mb-4 text-sm text-slate-500">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="cursor-pointer rounded-xl bg-indigo-500 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-600"
          >
            Retour à l&apos;accueil
          </button>
        </div>
      </div>
    );
  }

  if (!room) return null;

  const participantNames: Record<string, string> = {};
  room.participants.forEach((p) => { participantNames[p.id] = p.name; });

  const votingParticipants = room.participants.filter((p) => p.role === 'dev' || p.id === room.masterId);
  const totalVoters = votingParticipants.length;
  const totalVotes = Object.keys(room.votes).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              ←
            </button>
            <div>
              <h1 className="text-sm font-bold text-slate-800">{room.name}</h1>
              <p className="text-xs text-slate-400">{room.participants.length} participant{room.participants.length > 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyLink}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100"
            >
              {copied ? '✓ Copié !' : '🔗 Partager'}
            </button>
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {user.name}
              {isMaster && <span className="font-medium text-amber-600">(Maître)</span>}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          {/* Main area */}
          <div className="space-y-6">
            {/* Ticket Panel (mobile) */}
            <div className="lg:hidden">
              <TicketPanel
                ticket={room.currentTicket}
                isMaster={isMaster}
                onSetTicket={setTicket}
                showIframe={showIframe}
                onToggleIframe={() => setShowIframe(!showIframe)}
              />
            </div>

            {/* Voting table */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {/* Status */}
              <div className="mb-6 text-center">
                {room.revealed ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-4 py-1.5 text-sm font-medium text-indigo-700">
                    Votes révélés
                  </div>
                ) : totalVotes > 0 ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-1.5 text-sm font-medium text-amber-700">
                    {totalVotes}/{totalVoters} ont voté
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5 text-sm font-medium text-slate-500">
                    En attente des votes...
                  </div>
                )}
              </div>

              {/* Participants */}
              <div className="mb-6 flex flex-wrap items-end justify-center gap-4">
                {room.participants.map((p) => (
                  <ParticipantCard
                    key={p.id}
                    participant={p}
                    vote={room.votes[p.id]}
                    revealed={room.revealed}
                    isMaster={p.id === room.masterId}
                  />
                ))}
              </div>

              {/* Master controls */}
              {isMaster && (
                <div className="flex justify-center gap-3 border-t border-slate-100 pt-4">
                  <button
                    onClick={reveal}
                    disabled={room.revealed || totalVotes === 0}
                    className="cursor-pointer rounded-xl bg-indigo-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-600 disabled:opacity-40 disabled:shadow-none"
                  >
                    Révéler les votes
                  </button>
                  <button
                    onClick={reset}
                    className="cursor-pointer rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  >
                    Nouveau tour
                  </button>
                </div>
              )}
            </div>

            {/* Voting cards */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-center text-sm font-semibold text-slate-700">
                {room.revealed ? 'Votes révélés — en attente du prochain tour' : 'Choisissez votre estimation'}
              </h3>
              <div className="flex flex-wrap items-center justify-center gap-3">
                {VOTING_VALUES.map((value) => (
                  <VotingCard
                    key={value}
                    value={value}
                    selected={selectedVote === value}
                    disabled={room.revealed}
                    onClick={handleVote}
                  />
                ))}
              </div>
            </div>

            {/* Vote Results (when revealed) */}
            {room.revealed && Object.keys(room.votes).length > 0 && (
              <VoteResults
                votes={room.votes}
                participantNames={participantNames}
                isMaster={isMaster}
                hasTicket={!!room.currentTicket}
                roomId={roomId}
                userId={user.id}
                jiraConfigured={jiraConfigured}
              />
            )}
          </div>

          {/* Sidebar (desktop) */}
          <div className="hidden space-y-4 lg:block">
            <TicketPanel
              ticket={room.currentTicket}
              isMaster={isMaster}
              onSetTicket={setTicket}
              showIframe={showIframe}
              onToggleIframe={() => setShowIframe(!showIframe)}
            />

            {/* Participants list */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">
                Participants ({room.participants.length})
              </h3>
              <div className="space-y-2">
                {room.participants.map((p) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                    {p.avatar ? (
                      <img src={p.avatar} alt={p.name} className="h-5 w-5 rounded-full" />
                    ) : (
                      <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white ${p.id === room.masterId ? 'bg-amber-500' : 'bg-indigo-500'}`}>
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="flex-1 truncate text-xs text-slate-600">{p.name}</span>
                    {p.id === room.masterId && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Maître</span>
                    )}
                    {room.votes[p.id] && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${room.revealed ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {room.revealed ? room.votes[p.id] : 'A voté'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
