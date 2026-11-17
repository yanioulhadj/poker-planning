'use client';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useUser } from '@/app/hooks/useUser';
import { useRoom } from '@/app/hooks/useRoom';
import { VOTING_VALUES } from '@/app/lib/types';
import { hasConsensus } from '@/app/lib/votes';
import VotingCard from '@/app/components/VotingCard';
import ParticipantCard from '@/app/components/ParticipantCard';
import TicketPanel from '@/app/components/TicketPanel';
import VoteResults from '@/app/components/VoteResults';
import Avatar from '@/app/components/Avatar';
import JiraSettings, { loadStoredJiraConfig } from '@/app/components/JiraSettings';
import BacklogPanel from '@/app/components/BacklogPanel';

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = use(params);
  const router = useRouter();
  const { user, loaded, loginAsGuest } = useUser();
  const { room, error, loading, vote, reveal, reset, setTicket, joinRoom, refresh } = useRoom(roomId, user?.id);

  // Vote en cours d'envoi (affichage optimiste avant confirmation serveur)
  const [pendingVote, setPendingVote] = useState<string | null>(null);
  const [showIframe, setShowIframe] = useState(false);
  const [copied, setCopied] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [joining, setJoining] = useState(false);
  const [showJiraSettings, setShowJiraSettings] = useState(false);
  const jiraAutoConfigured = useRef(false);

  const isMaster = !!user && !!room && room.masterIds.includes(user.id);
  const me = room?.participants.find((p) => p.id === user?.id);
  const isObserver = me?.role === 'observer';
  const [choosingRole, setChoosingRole] = useState<'dev' | 'observer' | null>(null);

  // Notification pour toute la room quand le maître envoie des story points sur Jira
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const lastSyncAt = useRef<number | null | undefined>(undefined);
  const syncAt = room?.jiraSync?.at ?? null;
  useEffect(() => {
    if (!room) return;
    if (lastSyncAt.current === undefined) {
      // Premier chargement : on ne notifie pas un envoi déjà passé
      lastSyncAt.current = syncAt;
      return;
    }
    if (syncAt && syncAt !== lastSyncAt.current && room.jiraSync) {
      lastSyncAt.current = syncAt;
      setSyncToast(`${room.jiraSync.issueKey} mis à jour sur Jira : ${room.jiraSync.points} pts`);
      const t = setTimeout(() => setSyncToast(null), 6000);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncAt, !!room]);

  // Déjà dans la room (ou maître) : on se réannonce en gardant son rôle.
  // Nouvel arrivant : il choisit d'abord participant ou observateur (écran dédié plus bas).
  useEffect(() => {
    if (!loaded || !user || !room) return;
    if (!isMaster && !me) return;
    joinRoom(user.name, user.avatar, user.authType, me?.role === 'observer' ? 'observer' : 'dev');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, user?.id, room?.id]);

  // Gestion des maîtres (réservée aux maîtres)
  const [masterError, setMasterError] = useState('');
  const toggleMaster = async (targetId: string, makeMaster: boolean) => {
    if (!user) return;
    setMasterError('');
    const res = await fetch(`/api/rooms/${roomId}/masters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, targetId, master: makeMaster }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setMasterError(data?.error ?? 'Action impossible');
    }
    refresh();
  };

  const joinAs = async (role: 'dev' | 'observer') => {
    if (!user) return;
    setChoosingRole(role);
    try {
      await joinRoom(user.name, user.avatar, user.authType, role);
    } finally {
      setChoosingRole(null);
    }
  };

  // Maître : réutilise automatiquement la config Jira mémorisée dans ce navigateur
  useEffect(() => {
    if (!isMaster || !room || room.jira || !user || jiraAutoConfigured.current) return;
    jiraAutoConfigured.current = true;
    const stored = loadStoredJiraConfig();
    if (!stored) return;
    fetch(`/api/rooms/${roomId}/jira`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, ...stored }),
    })
      .then(() => refresh())
      .catch(() => {});
  }, [isMaster, room, user, roomId, refresh]);

  // Le vote affiché vient du serveur : il survit au polling et disparaît au « Nouveau tour »
  const serverVote = room && user ? room.votes[user.id] : undefined;
  const selectedVote = pendingVote ?? serverVote ?? null;

  useEffect(() => {
    if (pendingVote !== null && serverVote === pendingVote) setPendingVote(null);
  }, [pendingVote, serverVote]);

  const handleVote = async (value: string) => {
    setPendingVote(value);
    try {
      await vote(value);
    } catch {
      setPendingVote(null);
    }
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

  // Sans utilisateur, useRoom ne charge rien : on n'attend pas la room
  // pour afficher l'écran « Rejoindre la salle ».
  if (!loaded || (user && loading)) {
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
            <p className="mt-1 text-sm text-slate-500">Choisissez un pseudo ou connectez-vous avec Google</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/50">
            <button
              type="button"
              onClick={() => signIn('google', { callbackUrl: `/room/${roomId}` })}
              className="mb-3 flex w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:shadow-sm"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Se connecter avec Google
            </button>
            <div className="relative mb-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-slate-400">ou</span>
              </div>
            </div>
            <input
              type="text"
              placeholder="Votre pseudo (invité)..."
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
              Rejoindre en invité
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

  if (!isMaster && !me) {
    const roleOptions = [
      { role: 'dev' as const, icon: '🃏', title: 'Participant', desc: 'Je vote pour estimer les tickets' },
      { role: 'observer' as const, icon: '👀', title: 'Observateur', desc: 'Je suis la séance sans voter' },
    ];
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 px-4">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold text-slate-800">Rejoindre « {room.name} »</h1>
            <p className="mt-1 text-sm text-slate-500">Comment voulez-vous participer, {user.name} ?</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {roleOptions.map((o) => (
              <button
                key={o.role}
                onClick={() => joinAs(o.role)}
                disabled={choosingRole !== null}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white p-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-400 hover:shadow-md disabled:opacity-60"
              >
                <span className="text-3xl">{o.icon}</span>
                <span className="text-sm font-semibold text-slate-800">
                  {choosingRole === o.role ? 'Connexion...' : o.title}
                </span>
                <span className="text-xs text-slate-500">{o.desc}</span>
              </button>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-slate-400">Vous pourrez changer de rôle à tout moment.</p>
        </div>
      </div>
    );
  }

  const votingParticipants = room.participants.filter((p) => p.role !== 'observer');
  const observers = room.participants.filter((p) => p.role === 'observer');
  const totalVoters = votingParticipants.length;
  const totalVotes = Object.keys(room.votes).length;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-50 via-white to-purple-50 lg:h-screen lg:overflow-hidden">
      {/* Header */}
      <header className="z-10 shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => router.push('/')}
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              ←
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold text-slate-800">{room.name}</h1>
              <p className="text-xs text-slate-400">{room.participants.length} participant{room.participants.length > 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isMaster && (
              <button
                onClick={() => setShowJiraSettings(true)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  room.jira
                    ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
                title={room.jira ? `Connecté à ${room.jira.baseUrl}` : 'Configurer Jira'}
              >
                {room.jira ? '✓ Jira' : '⚙️ Jira'}
              </button>
            )}
            {me && (
              <button
                onClick={() => joinAs(isObserver ? 'dev' : 'observer')}
                disabled={choosingRole !== null}
                title={isObserver ? 'Participer au vote' : 'Suivre la séance sans voter'}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
              >
                {isObserver ? '🃏 Participer' : '👀 Observer'}
              </button>
            )}
            <button
              onClick={handleCopyLink}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100"
            >
              {copied ? '✓ Copié !' : '🔗 Partager'}
            </button>
            <div className="hidden items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600 sm:flex">
              <Avatar name={user.name} src={user.avatar} className="h-5 w-5 text-[8px]" />
              {user.name}
              {isMaster && <span className="font-medium text-amber-600">(Maître)</span>}
              {isObserver && <span className="font-medium text-slate-400">(Observateur)</span>}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 p-4 lg:min-h-0">
        <div className="grid gap-4 lg:h-full lg:grid-cols-[1fr_280px]">
          {/* Main area */}
          <div className="flex flex-col gap-4 lg:min-h-0">
            {/* Ticket + backlog (mobile) */}
            <div className="space-y-4 lg:hidden">
              <TicketPanel
                ticket={room.currentTicket}
                isMaster={isMaster}
                onSetTicket={setTicket}
                showIframe={showIframe}
                onToggleIframe={() => setShowIframe(!showIframe)}
                sync={room.jiraSync}
              />
              <BacklogPanel
                roomId={roomId}
                userId={user.id}
                isMaster={isMaster}
                jira={room.jira}
                currentTicket={room.currentTicket}
                onSelect={setTicket}
                onConfigureJira={() => setShowJiraSettings(true)}
                onFilterChange={refresh}
                syncAt={room.jiraSync?.at}
              />
            </div>

            {/* Voting table */}
            <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:min-h-0 lg:flex-1">
              {/* Status + master controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {room.revealed ? (
                  hasConsensus(room.votes) ? (
                    <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                      Votes révélés — consensus !
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                      Pas de consensus — discutez et ajustez vos votes
                    </div>
                  )
                ) : totalVotes > 0 ? (
                  <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                    {totalVotes}/{totalVoters} ont voté
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
                    En attente des votes...
                  </div>
                )}

                {isMaster && (
                  <div className="flex gap-2">
                    <button
                      onClick={reveal}
                      disabled={room.revealed || totalVotes === 0}
                      className="cursor-pointer rounded-lg bg-indigo-500 px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/30 transition hover:bg-indigo-600 disabled:opacity-40 disabled:shadow-none"
                    >
                      Révéler les votes
                    </button>
                    <button
                      onClick={reset}
                      className="cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                    >
                      Nouveau tour
                    </button>
                  </div>
                )}
              </div>

              {/* Participants */}
              <div className="flex flex-1 flex-wrap content-center items-start justify-center gap-4 overflow-y-auto py-4">
                {votingParticipants.map((p) => (
                  <ParticipantCard
                    key={p.id}
                    participant={p}
                    vote={room.votes[p.id]}
                    revealed={room.revealed}
                    isMaster={room.masterIds.includes(p.id)}
                  />
                ))}
              </div>

              {observers.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500">
                  <span>👀 Observateur{observers.length > 1 ? 's' : ''} :</span>
                  {observers.map((p) => (
                    <span key={p.id} className={`flex items-center gap-1 ${p.connected ? '' : 'opacity-50'}`}>
                      <Avatar name={p.name} src={p.avatar} className="h-4 w-4 text-[7px]" fallbackClassName="bg-slate-400" />
                      {p.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom panel: deck while voting, results once revealed */}
            <div className="shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {room.revealed && Object.keys(room.votes).length > 0 ? (
                <VoteResults
                  votes={room.votes}
                  isMaster={isMaster}
                  hasTicket={!!room.currentTicket}
                  roomId={roomId}
                  userId={user.id}
                  jiraConfigured={!!room.jira}
                  onConfigureJira={() => setShowJiraSettings(true)}
                  myVote={selectedVote}
                  canChangeVote={user.id in room.votes}
                  onChangeVote={handleVote}
                />
              ) : isObserver ? (
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  <p className="text-sm font-semibold text-slate-700">👀 Vous observez cette séance</p>
                  <p className="text-xs text-slate-500">Les votes des participants s&apos;affichent sur la table.</p>
                  <button
                    onClick={() => joinAs('dev')}
                    disabled={choosingRole !== null}
                    className="mt-1 cursor-pointer rounded-lg bg-indigo-50 px-4 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100 disabled:opacity-50"
                  >
                    🃏 Participer au vote
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="mb-2 text-center text-sm font-semibold text-slate-700">
                    {room.revealed ? 'Votes révélés — en attente du prochain tour' : 'Choisissez votre estimation'}
                  </h3>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
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
                </>
              )}
            </div>
          </div>

          {/* Sidebar (desktop) */}
          <div className="hidden min-h-0 flex-col gap-4 overflow-y-auto lg:flex">
            <TicketPanel
              ticket={room.currentTicket}
              isMaster={isMaster}
              onSetTicket={setTicket}
              showIframe={showIframe}
              onToggleIframe={() => setShowIframe(!showIframe)}
              sync={room.jiraSync}
            />

            <BacklogPanel
              roomId={roomId}
              userId={user.id}
              isMaster={isMaster}
              jira={room.jira}
              currentTicket={room.currentTicket}
              onSelect={setTicket}
              onConfigureJira={() => setShowJiraSettings(true)}
              onFilterChange={refresh}
              syncAt={room.jiraSync?.at}
            />

            {/* Participants list */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">
                Participants ({room.participants.length})
              </h3>
              <div className="space-y-2">
                {room.participants.map((p) => (
                  <div key={p.id} className="group flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-slate-300'}`} />
                    <Avatar
                      name={p.name}
                      src={p.avatar}
                      className="h-5 w-5 text-[8px]"
                      fallbackClassName={room.masterIds.includes(p.id) ? 'bg-amber-500' : 'bg-indigo-500'}
                    />
                    <span className="flex-1 truncate text-xs text-slate-600">{p.name}</span>
                    {room.masterIds.includes(p.id) && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">Maître</span>
                    )}
                    {p.role === 'observer' && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">Observateur</span>
                    )}
                    {room.votes[p.id] && (
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${room.revealed ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {room.revealed ? room.votes[p.id] : 'A voté'}
                      </span>
                    )}
                    {isMaster && (room.masterIds.includes(p.id) ? room.masterIds.length > 1 : true) && (
                      <button
                        onClick={() => toggleMaster(p.id, !room.masterIds.includes(p.id))}
                        title={room.masterIds.includes(p.id) ? 'Retirer le rôle de maître' : 'Nommer maître de la salle'}
                        className="hidden cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-500 transition hover:bg-amber-50 hover:text-amber-700 group-hover:inline"
                      >
                        {room.masterIds.includes(p.id) ? 'Retirer maître' : '+ Maître'}
                      </button>
                    )}
                  </div>
                ))}
                {masterError && <p className="text-[11px] text-red-500">{masterError}</p>}
              </div>
            </div>
          </div>
        </div>
      </main>
      {syncToast && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-600/30">
            ✓ {syncToast}
          </div>
        </div>
      )}
      {showJiraSettings && isMaster && (
        <JiraSettings
          roomId={roomId}
          userId={user.id}
          current={room.jira}
          onClose={() => setShowJiraSettings(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
