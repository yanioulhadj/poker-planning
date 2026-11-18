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

/** Statut appliqué au ticket une fois le sizing envoyé. */
export const DEFAULT_TARGET_STATUS = 'Ready for dev';

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
  // Non fourni → « Ready for dev » ; chaîne vide → statut inchangé
  const targetStatus = input.targetStatus === undefined ? DEFAULT_TARGET_STATUS : input.targetStatus.trim();
  const moveToNextSprint = input.moveToNextSprint !== false;
  // Sprint choisi dans les paramètres (sinon : premier sprint futur, déterminé à l'envoi)
  const targetSprintId =
    moveToNextSprint && Number.isInteger(input.targetSprintId) ? input.targetSprintId : undefined;
  const targetSprintName = targetSprintId != null ? input.targetSprintName?.trim() || undefined : undefined;
  return {
    baseUrl, email, apiToken, storyPointsField, groomingStatus, projectKey, groomingSprint,
    targetStatus, moveToNextSprint, targetSprintId, targetSprintName,
  };
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

/** Extrait un message lisible d'une réponse d'erreur Jira. */
async function jiraError(res: Response): Promise<string> {
  const body = await res.text().catch(() => '');
  try {
    const json = JSON.parse(body);
    if (json.errorMessages?.length) return json.errorMessages.join(', ');
    if (json.errors && Object.keys(json.errors).length) return Object.values(json.errors).join(', ');
  } catch {}
  return `Jira API ${res.status}`;
}

const sameName = (a: string, b: string) =>
  a.localeCompare(b, 'fr', { sensitivity: 'base' }) === 0;

/**
 * Passe le ticket dans le statut voulu (ex : « Nouveau ») via la transition
 * du workflow qui y mène. Ne fait rien si le ticket y est déjà.
 */
export async function transitionIssue(
  config: JiraConfig,
  issueKey: string,
  statusName: string
): Promise<{ success: true; status: string } | { success: false; error: string }> {
  const headers = { 'Authorization': authHeader(config), 'Accept': 'application/json' };
  try {
    const issueRes = await fetch(`${config.baseUrl}/rest/api/3/issue/${issueKey}?fields=status`, { headers });
    if (issueRes.ok) {
      const current: string | undefined = (await issueRes.json()).fields?.status?.name;
      if (current && sameName(current, statusName)) return { success: true, status: current };
    }

    const res = await fetch(`${config.baseUrl}/rest/api/3/issue/${issueKey}/transitions`, { headers });
    if (!res.ok) return { success: false, error: await jiraError(res) };
    const { transitions = [] }: { transitions?: { id: string; name: string; to?: { name?: string } }[] } =
      await res.json();

    // Priorité au statut d'arrivée, puis au nom de la transition
    const transition =
      transitions.find((t) => t.to?.name && sameName(t.to.name, statusName)) ??
      transitions.find((t) => sameName(t.name, statusName));
    if (!transition) {
      const available = [...new Set(transitions.map((t) => t.to?.name ?? t.name))].join(', ');
      return {
        success: false,
        error: `Aucune transition vers « ${statusName} » depuis le statut actuel${available ? ` (possibles : ${available})` : ''}`,
      };
    }

    const post = await fetch(`${config.baseUrl}/rest/api/3/issue/${issueKey}/transitions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ transition: { id: transition.id } }),
    });
    if (!post.ok) return { success: false, error: await jiraError(post) };
    return { success: true, status: transition.to?.name ?? statusName };
  } catch {
    return { success: false, error: 'Impossible de joindre Jira' };
  }
}

type AgileSprint = { id: number; name: string; state: string; originBoardId?: number; boardId?: number };

export interface JiraSprint {
  id: number;
  name: string;
  state: 'active' | 'future';
}

const sprintBoardId = (sprints: AgileSprint[]) =>
  sprints.map((s) => s.boardId ?? s.originBoardId).find((id) => id != null);

/** Identifiant du champ « Sprint » (variable selon l'instance). */
async function findSprintField(config: JiraConfig, headers: HeadersInit): Promise<string | undefined> {
  const res = await fetch(`${config.baseUrl}/rest/api/3/field`, { headers });
  if (!res.ok) return undefined;
  const fields: { id: string; schema?: { custom?: string } }[] = await res.json();
  return fields.find((f) => f.schema?.custom === 'com.pyxis.greenhopper.jira:gh-sprint')?.id;
}

/** Board Scrum du projet configuré (ou du projet du ticket). */
async function findProjectBoardId(config: JiraConfig, headers: HeadersInit, issueKey?: string) {
  const project = config.projectKey ?? issueKey?.split('-')[0];
  if (!project) return undefined;
  const res = await fetch(
    `${config.baseUrl}/rest/agile/1.0/board?type=scrum&projectKeyOrId=${encodeURIComponent(project)}`,
    { headers }
  );
  if (!res.ok) return undefined;
  return (await res.json()).values?.[0]?.id as number | undefined;
}

/**
 * Board à utiliser : celui du sprint de préparation (déduit d'un de ses tickets),
 * sinon le board Scrum du projet.
 */
async function findBoardId(config: JiraConfig, headers: HeadersInit, sprintField?: string) {
  if (sprintField && config.groomingSprint) {
    const res = await fetch(`${config.baseUrl}/rest/api/3/search/jql`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jql: `sprint = ${jqlString(config.groomingSprint)}`, maxResults: 1, fields: [sprintField] }),
    });
    if (res.ok) {
      const value = (await res.json()).issues?.[0]?.fields?.[sprintField];
      const id = Array.isArray(value) ? sprintBoardId(value) : undefined;
      if (id != null) return id;
    }
  }
  return findProjectBoardId(config, headers);
}

async function listBoardSprints(
  config: JiraConfig,
  headers: HeadersInit,
  boardId: number
): Promise<{ success: true; sprints: AgileSprint[] } | { success: false; error: string }> {
  const sprints: AgileSprint[] = [];
  let startAt = 0;
  for (;;) {
    const res = await fetch(
      `${config.baseUrl}/rest/agile/1.0/board/${boardId}/sprint?state=active,future&startAt=${startAt}&maxResults=50`,
      { headers }
    );
    if (!res.ok) return { success: false, error: await jiraError(res) };
    const page: { values?: AgileSprint[]; isLast?: boolean } = await res.json();
    sprints.push(...(page.values ?? []));
    if (page.isLast !== false || !page.values?.length || sprints.length >= 500) break;
    startAt += page.values.length;
  }
  return { success: true, sprints };
}

const isGroomingSprint = (config: JiraConfig, s: AgileSprint) =>
  !!config.groomingSprint && sameName(s.name, config.groomingSprint);

/** Sprints actifs et futurs du board (hors sprint de préparation), pour le choix dans les paramètres. */
export async function listSprints(
  config: JiraConfig
): Promise<{ success: true; sprints: JiraSprint[] } | { success: false; error: string }> {
  const headers = { 'Authorization': authHeader(config), 'Accept': 'application/json' };
  try {
    const boardId = await findBoardId(config, headers, await findSprintField(config, headers));
    if (boardId == null) {
      return { success: false, error: 'Aucun board Scrum trouvé (renseignez le projet dans la configuration)' };
    }
    const result = await listBoardSprints(config, headers, boardId);
    if (!result.success) return result;
    return {
      success: true,
      sprints: result.sprints
        .filter((s) => !isGroomingSprint(config, s))
        .map((s) => ({ id: s.id, name: s.name, state: s.state === 'active' ? 'active' : 'future' })),
    };
  } catch {
    return { success: false, error: 'Impossible de joindre Jira' };
  }
}

/**
 * Déplace le ticket dans le sprint choisi dans les paramètres, ou à défaut dans le
 * premier sprint « futur » du board (ordre du backlog), hors sprint de préparation
 * et hors sprint actuel du ticket.
 */
export async function moveIssueToNextSprint(
  config: JiraConfig,
  issueKey: string
): Promise<{ success: true; sprint: string } | { success: false; error: string }> {
  const headers = { 'Authorization': authHeader(config), 'Accept': 'application/json' };
  try {
    let target: { id: number; name: string } | undefined =
      config.targetSprintId != null
        ? { id: config.targetSprintId, name: config.targetSprintName ?? `sprint ${config.targetSprintId}` }
        : undefined;

    if (!target) {
      // Sprints actuels du ticket → board et sprints à exclure
      const sprintField = await findSprintField(config, headers);
      let issueSprints: AgileSprint[] = [];
      if (sprintField) {
        const issueRes = await fetch(`${config.baseUrl}/rest/api/3/issue/${issueKey}?fields=${sprintField}`, { headers });
        if (issueRes.ok) {
          const value = (await issueRes.json()).fields?.[sprintField];
          if (Array.isArray(value)) issueSprints = value;
        }
      }
      const boardId = sprintBoardId(issueSprints) ?? (await findProjectBoardId(config, headers, issueKey));
      if (boardId == null) return { success: false, error: 'Aucun board Scrum trouvé pour ce ticket' };

      const result = await listBoardSprints(config, headers, boardId);
      if (!result.success) return result;
      const currentIds = new Set(issueSprints.map((s) => s.id));
      target = result.sprints.find(
        (s) => s.state === 'future' && !currentIds.has(s.id) && !isGroomingSprint(config, s)
      );
      if (!target) return { success: false, error: 'Aucun prochain sprint (futur) trouvé sur le board' };
    }

    const move = await fetch(`${config.baseUrl}/rest/agile/1.0/sprint/${target.id}/issue`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ issues: [issueKey] }),
    });
    if (!move.ok) return { success: false, error: await jiraError(move) };
    return { success: true, sprint: target.name };
  } catch {
    return { success: false, error: 'Impossible de joindre Jira' };
  }
}
