'use client';

import { useEffect, useState } from 'react';
import type { JiraPublicInfo } from '@/app/lib/types';

export const JIRA_STORAGE_KEY = 'poker-planning-jira-config';
const DEFAULT_STORY_POINTS_FIELD = 'Story Points';
const DEFAULT_GROOMING_SPRINT = 'Préparation grooming';
const DEFAULT_TARGET_STATUS = 'Ready for dev';

export interface StoredJiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  storyPointsField: string;
  groomingStatus?: string;
  projectKey?: string;
  groomingSprint?: string;
  targetStatus?: string;
  moveToNextSprint?: boolean;
  targetSprintId?: number;
  targetSprintName?: string;
}

interface SprintOption {
  id: number;
  name: string;
  state: 'active' | 'future';
}

/** Valeur de la liste « sprint cible » : pas de déplacement, automatique, ou id du sprint */
type SprintChoice = 'none' | 'auto' | number;

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
  const [groomingStatus, setGroomingStatus] = useState(
    current ? current.groomingStatus ?? '' : stored?.groomingStatus ?? ''
  );
  const [projectKey, setProjectKey] = useState(current?.projectKey ?? stored?.projectKey ?? '');
  const [groomingSprint, setGroomingSprint] = useState(
    current?.groomingSprint ?? stored?.groomingSprint ?? DEFAULT_GROOMING_SPRINT
  );
  const [targetStatus, setTargetStatus] = useState(
    current?.targetStatus ?? stored?.targetStatus ?? DEFAULT_TARGET_STATUS
  );
  const initial = current ?? stored;
  const [sprintChoice, setSprintChoice] = useState<SprintChoice>(
    initial?.moveToNextSprint === false ? 'none' : initial?.targetSprintId ?? 'auto'
  );
  const [sprintChoiceName, setSprintChoiceName] = useState(initial?.targetSprintName);
  const [sprints, setSprints] = useState<SprintOption[] | null>(null);
  const [sprintsLoading, setSprintsLoading] = useState(false);
  const [sprintsError, setSprintsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadSprints = async () => {
    setSprintsLoading(true);
    setSprintsError('');
    try {
      const res = await fetch(`/api/rooms/${roomId}/jira/sprints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, baseUrl, email, apiToken, projectKey, groomingSprint, groomingStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSprintsError(data.error || 'Impossible de charger les sprints');
        return;
      }
      setSprints(data.sprints);
    } catch {
      setSprintsError('Impossible de contacter le serveur');
    } finally {
      setSprintsLoading(false);
    }
  };

  // Chargement à l'ouverture si des identifiants sont disponibles ; ensuite via « Actualiser »
  useEffect(() => {
    if (current || stored?.apiToken) loadSprints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSprintChange = (value: string) => {
    if (value === 'none' || value === 'auto') {
      setSprintChoice(value);
      return;
    }
    const id = Number(value);
    setSprintChoice(id);
    setSprintChoiceName(sprints?.find((s) => s.id === id)?.name ?? sprintChoiceName);
  };

  const sprintMissing =
    typeof sprintChoice === 'number' && sprints !== null && !sprints.some((s) => s.id === sprintChoice);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    const config = {
      baseUrl, email, apiToken, storyPointsField, groomingStatus, projectKey, groomingSprint,
      targetStatus,
      moveToNextSprint: sprintChoice !== 'none',
      targetSprintId: typeof sprintChoice === 'number' ? sprintChoice : undefined,
      targetSprintName: typeof sprintChoice === 'number' ? sprintChoiceName : undefined,
    };
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
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
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Sprint de préparation</span>
            <input
              className={inputClass}
              placeholder="Aucun filtre sur le sprint"
              value={groomingSprint}
              onChange={(e) => setGroomingSprint(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Statuts (optionnel)</span>
              <input
                className={inputClass}
                placeholder="Tous les statuts"
                value={groomingStatus}
                onChange={(e) => setGroomingStatus(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Projet</span>
              <input
                className={inputClass}
                placeholder="PROJ"
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
              />
            </label>
          </div>
          <p className="-mt-1 text-[11px] text-slate-400">
            La room affiche les tickets de ce sprint. Statuts (séparés par des virgules) et projet sont
            optionnels : laissez vide pour ne pas filtrer.
          </p>

          <div className="space-y-3 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-700">Après l&apos;envoi du sizing</p>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Passer le ticket au statut</span>
              <input
                className={inputClass}
                placeholder="Statut inchangé"
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-medium text-slate-600">
                Déplacer le ticket dans le sprint
                <button
                  type="button"
                  onClick={loadSprints}
                  disabled={sprintsLoading}
                  className="cursor-pointer font-normal text-indigo-500 hover:underline disabled:opacity-50"
                >
                  {sprintsLoading ? 'Chargement…' : sprints ? '↻ Actualiser' : 'Charger les sprints'}
                </button>
              </span>
              <select
                className={`${inputClass} cursor-pointer`}
                value={String(sprintChoice)}
                onChange={(e) => handleSprintChange(e.target.value)}
              >
                <option value="auto">Prochain sprint (automatique)</option>
                <option value="none">Ne pas changer de sprint</option>
                {sprints && sprints.length > 0 && (
                  <optgroup label="Sprints du board">
                    {sprints.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.state === 'active' ? ' (en cours)' : ''}
                      </option>
                    ))}
                  </optgroup>
                )}
                {typeof sprintChoice === 'number' && (sprints === null || sprintMissing) && (
                  <option value={sprintChoice}>
                    {sprintChoiceName ?? `Sprint ${sprintChoice}`}
                    {sprintMissing ? ' (terminé ou introuvable)' : ''}
                  </option>
                )}
              </select>
              <span className="mt-1 block text-[11px] text-slate-400">
                {sprintsError ||
                  (sprintMissing
                    ? 'Ce sprint n’est plus actif ni futur : choisissez-en un autre.'
                    : sprintChoice === 'auto'
                      ? 'Automatique : premier sprint futur du board, hors sprint de préparation.'
                      : sprintChoice === 'none'
                        ? 'Le ticket reste dans son sprint actuel.'
                        : '')}
              </span>
            </label>
          </div>
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
