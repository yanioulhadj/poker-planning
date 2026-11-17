'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BacklogIssue, JiraPublicInfo, Ticket } from '@/app/lib/types';
import { JIRA_STORAGE_KEY, loadStoredJiraConfig } from '@/app/components/JiraSettings';

const REFRESH_INTERVAL = 60_000;

const parseStatuses = (value?: string) =>
  (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

interface BacklogPanelProps {
  roomId: string;
  userId: string;
  isMaster: boolean;
  jira: JiraPublicInfo | null;
  currentTicket: Ticket | null;
  onSelect: (url: string, title: string) => void;
  onConfigureJira: () => void;
  /** Appelé après modification du filtre de statuts (pour rafraîchir la room) */
  onFilterChange: () => void;
}

export default function BacklogPanel({
  roomId,
  userId,
  isMaster,
  jira,
  currentTicket,
  onSelect,
  onConfigureJira,
  onFilterChange,
}: BacklogPanelProps) {
  const [issues, setIssues] = useState<BacklogIssue[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Le filtre de statuts ne change la requête Jira que s'il n'y a pas de sprint
  const jiraKey = jira
    ? `${jira.baseUrl}|${jira.projectKey ?? ''}|${jira.groomingSprint ?? ''}|${jira.groomingSprint ? '' : jira.groomingStatus ?? ''}`
    : null;

  // Filtre de statuts (appliqué ici quand un sprint est défini). Mise à jour optimiste côté maître.
  const [pendingStatuses, setPendingStatuses] = useState<string[] | null>(null);
  const selectedStatuses = pendingStatuses ?? parseStatuses(jira?.groomingStatus);
  const selectedLower = new Set(selectedStatuses.map((s) => s.toLowerCase()));
  const filterByStatus = !!jira?.groomingSprint && selectedLower.size > 0;

  useEffect(() => {
    setPendingStatuses(null);
  }, [jira?.groomingStatus]);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of issues ?? []) {
      const st = i.status ?? 'Sans statut';
      counts.set(st, (counts.get(st) ?? 0) + 1);
    }
    // Garde visibles les statuts sélectionnés absents du sprint (pour pouvoir les décocher)
    for (const st of selectedStatuses) {
      if (![...counts.keys()].some((k) => k.toLowerCase() === st.toLowerCase())) counts.set(st, 0);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [issues, selectedStatuses]);

  const visibleIssues = useMemo(
    () => (issues ?? []).filter((i) => !filterByStatus || selectedLower.has((i.status ?? '').toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [issues, filterByStatus, selectedStatuses.join('|')]
  );

  const toggleStatus = async (status: string) => {
    if (!isMaster) return;
    const isOn = selectedLower.has(status.toLowerCase());
    const next = isOn
      ? selectedStatuses.filter((s) => s.toLowerCase() !== status.toLowerCase())
      : [...selectedStatuses, status];
    setPendingStatuses(next);
    try {
      const res = await fetch(`/api/rooms/${roomId}/jira`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, groomingStatuses: next }),
      });
      if (!res.ok) throw new Error();
      // Mémorise le choix pour les prochaines rooms de ce navigateur
      const stored = loadStoredJiraConfig();
      if (stored) {
        localStorage.setItem(JIRA_STORAGE_KEY, JSON.stringify({ ...stored, groomingStatus: next.join(', ') }));
      }
      onFilterChange();
    } catch {
      setPendingStatuses(null);
    }
  };

  const load = useCallback(async () => {
    if (!jiraKey) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/jira/backlog?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erreur Jira');
        return;
      }
      setIssues(data.issues);
      setError('');
    } catch {
      setError('Impossible de contacter le serveur');
    } finally {
      setLoading(false);
    }
  }, [roomId, userId, jiraKey]);

  // Chargement automatique + rafraîchissement périodique et à chaque changement de ticket
  useEffect(() => {
    if (!jiraKey) return;
    load();
    const id = setInterval(load, REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [load, jiraKey, currentTicket?.url]);

  const title = 'Préparation grooming';

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-slate-700">
          {title}
          {issues && <span className="ml-1 font-normal text-slate-400">({visibleIssues.length})</span>}
        </h3>
        {jira && (
          <button
            onClick={load}
            disabled={loading}
            title="Rafraîchir"
            className={`cursor-pointer rounded-lg px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-default ${loading ? 'animate-spin' : ''}`}
          >
            ↻
          </button>
        )}
      </div>

      {!jira ? (
        isMaster ? (
          <button
            onClick={onConfigureJira}
            className="w-full cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-medium text-slate-500 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
          >
            Configurer Jira pour afficher le backlog
          </button>
        ) : (
          <p className="text-xs italic text-slate-400">Jira n&apos;est pas configuré pour cette salle</p>
        )
      ) : error ? (
        <p className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{error}</p>
      ) : issues === null ? (
        <p className="text-xs text-slate-400">Chargement des tickets...</p>
      ) : (
        <>
          {jira.groomingSprint && statusCounts.length > 0 && (
            <div className="mb-2.5">
              <div className="flex flex-wrap gap-1">
                {statusCounts.map(([status, count]) => {
                  const on = selectedLower.has(status.toLowerCase());
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => toggleStatus(status)}
                      disabled={!isMaster}
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                        on
                          ? 'border-indigo-500 bg-indigo-500 text-white'
                          : 'border-slate-200 bg-white text-slate-500'
                      } ${isMaster ? 'cursor-pointer hover:border-indigo-300' : 'cursor-default'}`}
                    >
                      {status} <span className={on ? 'text-indigo-100' : 'text-slate-400'}>{count}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                {filterByStatus
                  ? `${visibleIssues.length} ticket${visibleIssues.length > 1 ? 's' : ''} sur ${issues.length} dans le sprint`
                  : isMaster
                    ? 'Cliquez sur les statuts à afficher (tous par défaut)'
                    : 'Tous les statuts sont affichés'}
              </p>
            </div>
          )}
          {visibleIssues.length === 0 ? (
        <p className="text-xs italic text-slate-400">
          Aucun ticket
          {jira.groomingSprint ? ` dans le sprint « ${jira.groomingSprint} »` : ''}
          {jira.groomingStatus ? ` en « ${jira.groomingStatus} »` : ''}
          {jira.projectKey ? ` (projet ${jira.projectKey})` : ''}
        </p>
      ) : (
        <ul className="-mx-1 max-h-72 space-y-1 overflow-y-auto px-1">
          {visibleIssues.map((issue) => {
            const isCurrent = currentTicket?.url === issue.url;
            const selectable = isMaster && !isCurrent;
            const select = () => {
              if (selectable) onSelect(issue.url, `${issue.key} — ${issue.summary}`);
            };
            return (
              <li key={issue.key}>
                <div
                  role={selectable ? 'button' : undefined}
                  tabIndex={selectable ? 0 : undefined}
                  onClick={select}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      select();
                    }
                  }}
                  title={selectable ? 'Groomer ce ticket' : issue.summary}
                  className={`group w-full rounded-lg border px-2.5 py-2 text-left transition ${
                    isCurrent
                      ? 'border-indigo-300 bg-indigo-50'
                      : selectable
                        ? 'cursor-pointer border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/50'
                        : 'cursor-default border-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] font-semibold text-indigo-600 hover:underline"
                    >
                      {issue.key}
                    </a>
                    {issue.issueType && (
                      <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">{issue.issueType}</span>
                    )}
                    <span className="flex-1" />
                    {issue.storyPoints !== null && (
                      <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-700">
                        {issue.storyPoints} pts
                      </span>
                    )}
                    {isCurrent ? (
                      <span className="text-[10px] font-medium text-indigo-600">En cours</span>
                    ) : (
                      isMaster && (
                        <span className="hidden text-[10px] font-medium text-indigo-500 group-hover:inline">
                          Groomer →
                        </span>
                      )
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-700">{issue.summary}</p>
                </div>
              </li>
            );
          })}
        </ul>
          )}
        </>
      )}
    </div>
  );
}
