'use client';

import { useState } from 'react';

interface VoteResultsProps {
  votes: Record<string, string>;
  participantNames: Record<string, string>;
  isMaster: boolean;
  hasTicket: boolean;
  roomId: string;
  userId: string;
  jiraConfigured: boolean;
}

export default function VoteResults({
  votes,
  participantNames,
  isMaster,
  hasTicket,
  roomId,
  userId,
  jiraConfigured,
}: VoteResultsProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  const voteValues = Object.values(votes);
  if (voteValues.length === 0) return null;

  const numericVotes = voteValues
    .map(Number)
    .filter((v) => !isNaN(v));

  const average = numericVotes.length > 0
    ? (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(1)
    : null;

  const distribution: Record<string, number> = {};
  for (const v of voteValues) {
    distribution[v] = (distribution[v] || 0) + 1;
  }

  const consensus = Object.keys(distribution).length === 1;
  const consensusValue = consensus ? voteValues[0] : null;
  const canSyncToJira = isMaster && hasTicket && jiraConfigured && consensusValue !== null && !isNaN(Number(consensusValue));

  const handleSyncJira = async (value: string) => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/sync-jira`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, value }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncResult({ ok: true, message: `Story points (${data.points}) envoyés sur ${data.issueKey}` });
      } else {
        setSyncResult({ ok: false, message: data.error || 'Erreur inconnue' });
      }
    } catch {
      setSyncResult({ ok: false, message: 'Impossible de contacter le serveur' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Résultats</h3>

      {consensus ? (
        <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-center">
          <p className="text-xs text-emerald-600">Consensus !</p>
          <p className="text-2xl font-bold text-emerald-700">{voteValues[0]}</p>
        </div>
      ) : (
        <>
          {average && (
            <div className="mb-3 rounded-lg bg-indigo-50 p-3 text-center">
              <p className="text-xs text-indigo-600">Moyenne</p>
              <p className="text-2xl font-bold text-indigo-700">{average}</p>
            </div>
          )}
          <div className="space-y-1">
            {Object.entries(distribution)
              .sort(([a], [b]) => {
                const na = Number(a), nb = Number(b);
                if (!isNaN(na) && !isNaN(nb)) return na - nb;
                return a.localeCompare(b);
              })
              .map(([value, count]) => (
                <div key={value} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{value}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 rounded-full bg-indigo-200" style={{ width: `${(count / voteValues.length) * 80}px` }} />
                    <span className="text-xs text-slate-500">{count} vote{count > 1 ? 's' : ''}</span>
                  </div>
                </div>
              ))}
          </div>
        </>
      )}

      <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
        {Object.entries(votes).map(([uid, val]) => (
          <div key={uid} className="flex items-center justify-between text-xs text-slate-500">
            <span>{participantNames[uid] || uid}</span>
            <span className="font-semibold text-slate-700">{val}</span>
          </div>
        ))}
      </div>

      {/* Jira sync */}
      {isMaster && hasTicket && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          {canSyncToJira ? (
            <button
              onClick={() => handleSyncJira(consensusValue!)}
              disabled={syncing}
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 0 0-.84-.84h-9.63zm-4.67 4.65c0 2.4 1.97 4.35 4.35 4.35h1.78v1.72c0 2.39 1.94 4.34 4.34 4.34V7.49a.84.84 0 0 0-.84-.84H6.86zM2 11.33c.01 2.4 1.97 4.35 4.35 4.35h1.78v1.72c0 2.4 1.94 4.35 4.34 4.35V12.17a.84.84 0 0 0-.83-.84H2z"/>
              </svg>
              {syncing ? 'Envoi en cours...' : `Envoyer ${consensusValue} pts sur Jira`}
            </button>
          ) : !jiraConfigured ? (
            <p className="text-center text-xs text-slate-400 italic">
              Jira non configuré — ajoutez les variables d&apos;environnement JIRA_*
            </p>
          ) : !consensus ? (
            <div className="space-y-2">
              <p className="text-center text-xs text-slate-500">Pas de consensus. Envoyer manuellement :</p>
              <div className="flex flex-wrap justify-center gap-1.5">
                {Object.keys(distribution)
                  .filter((v) => !isNaN(Number(v)))
                  .sort((a, b) => Number(a) - Number(b))
                  .map((value) => (
                    <button
                      key={value}
                      onClick={() => handleSyncJira(value)}
                      disabled={syncing}
                      className="cursor-pointer rounded-md bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-100 disabled:opacity-50"
                    >
                      {value} pts
                    </button>
                  ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 italic">
              La valeur votée n&apos;est pas numérique — envoi Jira non disponible
            </p>
          )}

          {syncResult && (
            <div className={`mt-2 rounded-lg p-2 text-center text-xs font-medium ${syncResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {syncResult.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
