/**
 * Jira Cloud REST API integration.
 *
 * Required environment variables:
 *   JIRA_BASE_URL        – e.g. https://mycompany.atlassian.net
 *   JIRA_EMAIL           – email of the Jira user
 *   JIRA_API_TOKEN       – API token (https://id.atlassian.com/manage-profile/security/api-tokens)
 *   JIRA_STORY_POINTS_FIELD – custom field id for story points (default: "story_points",
 *                              common alternatives: "customfield_10016", "customfield_10028")
 */

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  storyPointsField: string;
}

export function getJiraConfig(): JiraConfig | null {
  const baseUrl = process.env.JIRA_BASE_URL?.replace(/\/+$/, '');
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  const storyPointsField = process.env.JIRA_STORY_POINTS_FIELD || 'story_points';

  if (!baseUrl || !email || !apiToken) return null;
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
