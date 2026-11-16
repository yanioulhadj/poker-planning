'use client';

import { useState } from 'react';
import type { JiraPublicInfo } from '@/app/lib/types';

export const JIRA_STORAGE_KEY = 'poker-planning-jira-config';
const DEFAULT_STORY_POINTS_FIELD = 'Story Points';

export interface StoredJiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  storyPointsField: string;
}

export function loadStoredJiraConfig(): StoredJiraConfig | null {
  try {
    const raw = localStorage.getItem(JIRA_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface JiraSettingsProps {
  roomId: string;
  userId: string;
  current: JiraPublicInfo | null;
  onClose: () => void;
  onSaved: () => void;
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 transition focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20';

export default function JiraSettings({ roomId, userId, current, onClose, onSaved }: JiraSettingsProps) {
  const stored = typeof window !== 'undefined' ? loadStoredJiraConfig() : null;

  const [baseUrl, setBaseUrl] = useState(current?.baseUrl ?? stored?.baseUrl ?? '');
  const [email, setEmail] = useState(current?.email ?? stored?.email ?? '');
  const [apiToken, setApiToken] = useState(stored?.apiToken ?? '');
  const [storyPointsField, setStoryPointsField] = useState(
    current?.storyPointsFieldName ?? stored?.storyPointsField ?? DEFAULT_STORY_POINTS_FIELD
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const config = { baseUrl, email, apiToken, storyPointsField };
    try {
      const res = await fetch(`/api/rooms/${roomId}/jira`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, ...config }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erreur lors de la configuration');
        return;
      }
      localStorage.setItem(JIRA_STORAGE_KEY, JSON.stringify(config));
      onSaved();
      onClose();
    } catch {
      setError('Impossible de contacter le serveur');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    await fetch(`/api/rooms/${roomId}/jira`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    }).catch(() => {});
    localStorage.removeItem(JIRA_STORAGE_KEY);
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">Configuration Jira</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Permet d&apos;envoyer les story points directement sur le ticket.
            </p>
          </div>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg px-2 text-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">URL de votre instance Jira</span>
            <input
              className={inputClass}
              placeholder="https://monentreprise.atlassian.net"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Email du compte Jira</span>
            <input
              className={inputClass}
              type="email"
              placeholder="vous@entreprise.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              Token API{' '}
              <a
                href="https://id.atlassian.com/manage-profile/security/api-tokens"
                target="_blank"
                rel="noreferrer"
                className="font-normal text-indigo-500 hover:underline"
              >
                (en créer un)
              </a>
            </span>
            <input
              className={inputClass}
              type="password"
              placeholder={current && !apiToken ? 'Déjà configuré — ressaisir pour modifier' : 'Votre token API'}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Champ « Story points »</span>
            <input
              className={inputClass}
              placeholder={DEFAULT_STORY_POINTS_FIELD}
              value={storyPointsField}
              onChange={(e) => setStoryPointsField(e.target.value)}
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Nom du champ tel qu&apos;affiché dans Jira (ex : Story Points) ou son identifiant (customfield_…).
              {current && (
                <>
                  {' '}Actuellement : <strong>{current.storyPointsFieldName ?? current.storyPointsField}</strong>
                  {current.storyPointsFieldName && ` (${current.storyPointsField})`}.
                </>
              )}
            </span>
          </label>
        </div>

        <p className="mt-3 text-[11px] text-slate-400">
          Le token est mémorisé dans ce navigateur pour vos prochaines salles, et n&apos;est jamais
          partagé avec les autres participants.
        </p>

        {error && <p className="mt-3 rounded-lg bg-red-50 p-2 text-center text-xs text-red-600">{error}</p>}

        <div className="mt-5 flex items-center gap-2">
          {current && (
            <button
              onClick={handleRemove}
              disabled={saving}
              className="cursor-pointer rounded-xl px-3 py-2.5 text-xs font-medium text-red-500 transition hover:bg-red-50 disabled:opacity-50"
            >
              Supprimer
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !baseUrl.trim() || !email.trim() || !apiToken.trim()}
            className="cursor-pointer rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-600 disabled:opacity-50 disabled:shadow-none"
          >
            {saving ? 'Vérification...' : 'Tester et enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
