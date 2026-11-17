/**
 * Intégration Jira Cloud REST API.
 *
 * La configuration (URL, email, token API, champ story points) est saisie
 * par le maître de la salle depuis l'interface et stockée avec la room.
 * Token API : https://id.atlassian.com/manage-profile/security/api-tokens
 */

import type { BacklogIssue, JiraConfig } from './types';

export type { JiraConfig };

/** Nom du champ Jira utilisé par défaut (≠ « Story point estimate », customfield_10016). */
export const DEFAULT_STORY_POINTS_FIELD = 'Story Points';

export const DEFAULT_GROOMING_SPRINT = 'Préparation grooming';

/** « Grooming, Elaboration » → ['Grooming', 'Elaboration'] */
export function parseStatuses(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

export function normalizeJiraConfig(input: Partial<JiraConfig>): JiraConfig | null {
  const baseUrl = input.baseUrl?.trim().replace(/\/+$/, '');
  const email = input.email?.trim();
  const apiToken = input.apiToken?.trim();
  const storyPointsField = input.storyPointsField?.trim() || DEFAULT_STORY_POINTS_FIELD;
  // Optionnel : vide → pas de filtre sur le statut
  const groomingStatus = parseStatuses(input.groomingStatus ?? '').join(', ') || undefined;
  const projectKey = input.projectKey?.trim().toUpperCase() || undefined;
  // Non fourni → sprint par défaut ; chaîne vide → pas de filtre sur le sprint
  const groomingSprint =
    input.groomingSprint === undefined ? DEFAULT_GROOMING_SPRINT : input.groomingSprint.trim() || undefined;

  if (!baseUrl || !email || !apiToken) return null;
  if (!/^https:\/\/[^/]+/.test(baseUrl)) return null;
  if (projectKey && !/^[A-Z][A-Z0-9_]+$/.test(projectKey)) return null;
  // Sans sprint ni statut, la recherche renverrait tout le Jira
  if (!groomingSprint && !groomingStatus) return null;
  return { baseUrl, email, apiToken, storyPointsField, groomingStatus, projectKey, groomingSprint };
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

const jqlString = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Tickets du sprint de préparation (et des statuts choisis, si définis), triés par rang du backlog. */
export async function searchBacklog(
  config: JiraConfig
): Promise<{ success: true; issues: BacklogIssue[] } | { success: false; error: string }> {
  const clauses: string[] = [];
  if (config.groomingSprint) {
    // Avec un sprint, on récupère tous ses tickets : le filtre par statut est appliqué
    // dans l'interface (pastilles), ce qui permet d'afficher le nombre de tickets par statut.
    clauses.push(`sprint = ${jqlString(config.groomingSprint)}`);
  } else {
    const statuses = parseStatuses(config.groomingStatus ?? '');
    if (statuses.length) clauses.push(`status in (${statuses.map(jqlString).join(', ')})`);
  }
  if (!clauses.length) {
    return { success: false, error: 'Indiquez un sprint ou des statuts dans la configuration Jira' };
  }
  if (config.projectKey) clauses.unshift(`project = ${jqlString(config.projectKey)}`);
  const jql = `${clauses.join(' AND ')} ORDER BY Rank ASC`;

  type RawIssue = { key: string; fields: Record<string, unknown> & {
    summary?: string; issuetype?: { name?: string }; priority?: { name?: string }; status?: { name?: string };
  } };
  const MAX_ISSUES = 500;
  const raw: RawIssue[] = [];

  try {
    // Pagination via nextPageToken (API /search/jql)
    let nextPageToken: string | undefined;
    do {
      const res = await fetch(`${config.baseUrl}/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader(config),
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          jql,
          maxResults: 100,
          fields: ['summary', 'issuetype', 'priority', 'status', config.storyPointsField],
          ...(nextPageToken ? { nextPageToken } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        let message = `Jira API ${res.status}`;
        try {
          const json = JSON.parse(body);
          if (json.errorMessages?.length) message = json.errorMessages.join(', ');
        } catch {}
        return { success: false, error: message };
      }

      const data = await res.json();
      raw.push(...(data.issues ?? []));
      nextPageToken = data.isLast ? undefined : data.nextPageToken;
    } while (nextPageToken && raw.length < MAX_ISSUES);

    const issues: BacklogIssue[] = raw.slice(0, MAX_ISSUES).map((i) => {
      const points = i.fields[config.storyPointsField];
      return {
        key: i.key,
        summary: i.fields.summary ?? '',
        url: `${config.baseUrl}/browse/${i.key}`,
        issueType: i.fields.issuetype?.name,
        priority: i.fields.priority?.name,
        status: i.fields.status?.name,
        storyPoints: typeof points === 'number' ? points : null,
      };
    });
    return { success: true, issues };
  } catch {
    return { success: false, error: 'Impossible de joindre Jira' };
  }
}
