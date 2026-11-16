/**
 * Intégration Jira Cloud REST API.
 *
 * La configuration (URL, email, token API, champ story points) est saisie
 * par le maître de la salle depuis l'interface et stockée avec la room.
 * Token API : https://id.atlassian.com/manage-profile/security/api-tokens
 */

import type { JiraConfig } from './types';

export type { JiraConfig };

/** Nom du champ Jira utilisé par défaut (≠ « Story point estimate », customfield_10016). */
export const DEFAULT_STORY_POINTS_FIELD = 'Story Points';

export function normalizeJiraConfig(input: Partial<JiraConfig>): JiraConfig | null {
  const baseUrl = input.baseUrl?.trim().replace(/\/+$/, '');
  const email = input.email?.trim();
  const apiToken = input.apiToken?.trim();
  const storyPointsField = input.storyPointsField?.trim() || DEFAULT_STORY_POINTS_FIELD;

  if (!baseUrl || !email || !apiToken) return null;
  if (!/^https:\/\/[^/]+/.test(baseUrl)) return null;
  return { baseUrl, email, apiToken, storyPointsField };
}

function authHeader(config: JiraConfig): string {
  const encoded = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

/**
 * Extract the Jira issue key (e.g. "PROJ-123") from various URL formats:
 *   - https://company.atlassian.net/browse/PROJ-123
 *   - https://company.atlassian.net/jira/software/projects/PROJ/boards/1?selectedIssue=PROJ-123
 *   - PROJ-123 (plain key)
 */
export function extractIssueKey(input: string): string | null {
  const keyRegex = /[A-Z][A-Z0-9_]+-\d+/;

  const selectedIssueMatch = input.match(/selectedIssue=([A-Z][A-Z0-9_]+-\d+)/);
  if (selectedIssueMatch) return selectedIssueMatch[1];

  const browseMatch = input.match(/\/browse\/([A-Z][A-Z0-9_]+-\d+)/);
  if (browseMatch) return browseMatch[1];

  const plain = input.match(keyRegex);
  if (plain) return plain[0];

  return null;
}

export async function updateStoryPoints(
  config: JiraConfig,
  issueKey: string,
  points: number
): Promise<{ success: boolean; error?: string }> {
  const url = `${config.baseUrl}/rest/api/3/issue/${issueKey}`;

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': authHeader(config),
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          [config.storyPointsField]: points,
        },
      }),
    });

    if (res.status === 204 || res.ok) {
      return { success: true };
    }

    const body = await res.text();
    let message = `Jira API ${res.status}`;
    try {
      const json = JSON.parse(body);
      if (json.errorMessages?.length) message = json.errorMessages.join(', ');
      else if (json.errors) message = Object.values(json.errors).join(', ');
    } catch {
      if (body) message = body.slice(0, 200);
    }
    return { success: false, error: message };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erreur réseau' };
  }
}

export async function getIssue(
  config: JiraConfig,
  issueKey: string
): Promise<{ success: boolean; summary?: string; storyPoints?: number; error?: string }> {
  const url = `${config.baseUrl}/rest/api/3/issue/${issueKey}?fields=summary,${config.storyPointsField}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader(config),
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      return { success: false, error: `Jira API ${res.status}` };
    }

    const data = await res.json();
    return {
      success: true,
      summary: data.fields?.summary,
      storyPoints: data.fields?.[config.storyPointsField],
    };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Erreur réseau' };
  }
}

/** Vérifie les identifiants en appelant /myself. */
export async function testConnection(
  config: JiraConfig
): Promise<{ success: boolean; displayName?: string; error?: string }> {
  try {
    const res = await fetch(`${config.baseUrl}/rest/api/3/myself`, {
      headers: { 'Authorization': authHeader(config), 'Accept': 'application/json' },
    });
    if (res.status === 401 || res.status === 403) {
      return { success: false, error: 'Identifiants Jira refusés (email ou token API invalide)' };
    }
    if (!res.ok) {
      return { success: false, error: `Jira a répondu ${res.status}. Vérifiez l'URL de votre instance.` };
    }
    const data = await res.json();
    return { success: true, displayName: data.displayName };
  } catch {
    return { success: false, error: "Impossible de joindre Jira. Vérifiez l'URL de votre instance." };
  }
}

/**
 * Résout le champ story points : accepte un identifiant (customfield_12345)
 * ou un nom tel qu'affiché dans Jira (ex : « Story Points », insensible à la casse).
 */
export async function resolveStoryPointsField(
  config: JiraConfig
): Promise<{ success: true; id: string; name: string } | { success: false; error: string }> {
  try {
    const res = await fetch(`${config.baseUrl}/rest/api/3/field`, {
      headers: { 'Authorization': authHeader(config), 'Accept': 'application/json' },
    });
    if (!res.ok) {
      return { success: false, error: `Impossible de lister les champs Jira (${res.status})` };
    }
    const fields: { id: string; name: string }[] = await res.json();
    const wanted = config.storyPointsField.trim();

    const byId = fields.find((f) => f.id === wanted);
    if (byId) return { success: true, id: byId.id, name: byId.name };

    const byName = fields.filter((f) => f.name.toLowerCase() === wanted.toLowerCase());
    if (byName.length === 1) return { success: true, id: byName[0].id, name: byName[0].name };
    if (byName.length > 1) {
      return {
        success: false,
        error: `Plusieurs champs s'appellent « ${wanted} » (${byName.map((f) => f.id).join(', ')}). Indiquez l'identifiant voulu.`,
      };
    }
    return { success: false, error: `Aucun champ « ${wanted} » trouvé dans votre Jira` };
  } catch {
    return { success: false, error: 'Impossible de joindre Jira pour lister les champs' };
  }
}
