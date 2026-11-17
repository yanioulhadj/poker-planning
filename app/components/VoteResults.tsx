'use client';

import { useState } from 'react';
import { VOTING_VALUES } from '@/app/lib/types';
import { hasConsensus } from '@/app/lib/votes';

interface VoteResultsProps {
  votes: Record<string, string>;
  isMaster: boolean;
  hasTicket: boolean;
  roomId: string;
  userId: string;
  jiraConfigured: boolean;
  onConfigureJira?: () => void;
  /** Vote actuel de l'utilisateur (pour le surligner dans la rangée de modification) */
  myVote: string | null;
  /** L'utilisateur a voté ce tour-ci et peut donc ajuster son vote */
  canChangeVote: boolean;
  onChangeVote: (value: string) => void;
}

const JiraIcon = () => (
  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.53 2c0 2.4 1.97 4.35 4.35 4.35h1.78v1.7c0 2.4 1.94 4.34 4.34 4.35V2.84a.84.84 0 0 0-.84-.84h-9.63zm-4.67 4.65c0 2.4 1.97 4.35 4.35 4.35h1.78v1.72c0 2.39 1.94 4.34 4.34 4.34V7.49a.84.84 0 0 0-.84-.84H6.86zM2 11.33c.01 2.4 1.97 4.35 4.35 4.35h1.78v1.72c0 2.4 1.94 4.35 4.34 4.35V12.17a.84.84 0 0 0-.83-.84H2z" />
  </svg>
);

export default function VoteResults({
  votes,
  isMaster,
  hasTicket,
  roomId,
  userId,
  jiraConfigured,
  onConfigureJira,
  myVote,
  canChangeVote,
  onChangeVote,
}: VoteResultsProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [finalSizing, setFinalSizing] = useState('');

  const voteValues = Object.values(votes);
  if (voteValues.length === 0) return null;

  const numericVotes = voteValues.map(Number).filter((v) => !isNaN(v));
  const average =
    numericVotes.length > 0
      ? (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length).toFixed(1)
      : null;

  const distribution: Record<string, number> = {};
  for (const v of voteValues) distribution[v] = (distribution[v] || 0) + 1;
  const sortedDistribution = Object.entries(distribution).sort(([a], [b]) => {
    const na = Number(a), nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  const maxCount = Math.max(...Object.values(distribution));

  const consensus = hasConsensus(votes);
  const consensusValue = consensus ? voteValues[0] : null;
  const canSyncToJira =
    isMaster && hasTicket && jiraConfigured && consensusValue !== null && !isNaN(Number(consensusValue));

  const finalSizingValid = finalSizing.trim() !== '' && !isNaN(Number(finalSizing.replace(',', '.')));

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
        setSyncResult({ ok: true, message: `${data.points} pts envoyés sur ${data.issueKey}` });
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
    <div className="space-y-3">
      {/* Pas d'accord : chacun peut ajuster son vote */}
      {!consensus && canChangeVote && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-b border-slate-100 pb-3">
          <span className="text-xs font-medium text-amber-700">Pas d&apos;accord — modifiez votre vote :</span>
          <div className="flex flex-wrap justify-center gap-1">
            {VOTING_VALUES.map((value) => (
              <button
                key={value}
                onClick={() => onChangeVote(value)}
                className={`h-9 w-8 cursor-pointer rounded-md border text-xs font-bold transition ${
                  myVote === value
                    ? 'border-indigo-600 bg-indigo-500 text-white shadow-md shadow-indigo-500/30'
                    : 'border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-indigo-300'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Résumé */}
        <div
          className={`flex shrink-0 flex-col items-center justify-center rounded-xl px-6 py-3 ${
            consensus ? 'bg-emerald-50' : 'bg-indigo-50'
          }`}
        >
          <p className={`text-xs ${consensus ? 'text-emerald-600' : 'text-indigo-600'}`}>
            {consensus ? 'Consensus !' : 'Moyenne'}
          </p>
          <p className={`text-3xl font-bold ${consensus ? 'text-emerald-700' : 'text-indigo-700'}`}>
            {consensus ? consensusValue : average ?? '—'}
          </p>
        </div>

        {/* Répartition */}
        <div className="flex min-w-0 flex-1 items-end justify-center gap-3">
          {sortedDistribution.map(([value, count]) => (
            <div key={value} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-slate-500">{count} vote{count > 1 ? 's' : ''}</span>
              <div
                className="w-8 rounded-t-md bg-indigo-300"
                style={{ height: `${Math.max(8, (count / maxCount) * 48)}px` }}
              />
              <span className="text-sm font-semibold text-slate-700">{value}</span>
            </div>
          ))}
        </div>

        {/* Jira */}
        {isMaster && hasTicket && (
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-56">
            {canSyncToJira ? (
              <button
                onClick={() => handleSyncJira(consensusValue!)}
                disabled={syncing}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-600 disabled:opacity-50"
              >
                <JiraIcon />
                {syncing ? 'Envoi en cours...' : `Envoyer ${consensusValue} pts sur Jira`}
              </button>
            ) : !jiraConfigured ? (
              <button
                onClick={onConfigureJira}
                className="cursor-pointer rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs font-medium text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
              >
                Configurer Jira pour envoyer les story points
              </button>
            ) : !consensus ? (
              <form
                className="space-y-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (finalSizingValid) handleSyncJira(finalSizing.replace(',', '.').trim());
                }}
              >
                <label className="block text-center text-xs text-slate-500">Pas de consensus — sizing final :</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="ex : 5"
                    value={finalSizing}
                    onChange={(e) => setFinalSizing(e.target.value)}
                    className="w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <button
                    type="submit"
                    disabled={syncing || !finalSizingValid}
                    className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-600 disabled:opacity-50"
                  >
                    <JiraIcon />
                    {syncing ? '...' : 'Envoyer'}
                  </button>
                </div>
                <div className="flex flex-wrap justify-center gap-1">
                  {Object.keys(distribution)
                    .filter((v) => !isNaN(Number(v)))
                    .sort((a, b) => Number(a) - Number(b))
                    .map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFinalSizing(value)}
                        className="cursor-pointer rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600 transition hover:bg-blue-100"
                      >
                        {value}
                      </button>
                    ))}
                </div>
              </form>
            ) : (
              <p className="text-center text-xs italic text-slate-400">
                Valeur non numérique — envoi Jira indisponible
              </p>
            )}

            {syncResult && (
              <div
                className={`rounded-lg p-2 text-center text-xs font-medium ${
                  syncResult.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                }`}
              >
                {syncResult.message}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
