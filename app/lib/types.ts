export interface User {
  id: string;
  name: string;
  avatar?: string;
  authType: 'guest' | 'google';
}

export interface Participant extends User {
  /** observer : suit la séance sans voter */
  role: 'master' | 'dev' | 'observer';
  lastSeen: number;
  connected: boolean;
}

export interface Ticket {
  url: string;
  title: string;
}

export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  /** Identifiant technique du champ (ex : customfield_10028) */
  storyPointsField: string;
  /** Nom affiché dans Jira (ex : Story Points) */
  storyPointsFieldName?: string;
  /** Statut(s) Jira à filtrer, séparés par des virgules (optionnel, ex : Grooming, Elaboration) */
  groomingStatus?: string;
  /** Clé du projet pour limiter le backlog (optionnel, ex : PROJ) */
  projectKey?: string;
  /** Nom du sprint contenant les tickets à groomer (optionnel, ex : Préparation grooming) */
  groomingSprint?: string;
}

/** Infos Jira exposées aux clients (jamais le token). */
export interface JiraPublicInfo {
  baseUrl: string;
  email: string;
  storyPointsField: string;
  storyPointsFieldName?: string;
  groomingStatus?: string;
  projectKey?: string;
  groomingSprint?: string;
}

/** Ticket Jira affiché dans la section « Préparation grooming ». */
export interface BacklogIssue {
  key: string;
  summary: string;
  url: string;
  issueType?: string;
  priority?: string;
  status?: string;
  storyPoints: number | null;
}

export interface Room {
  id: string;
  name: string;
  masterId: string;
  participants: Record<string, Participant>;
  votes: Record<string, string>;
  currentTicket: Ticket | null;
  revealed: boolean;
  createdAt: number;
  jiraConfig: JiraConfig | null;
}

export interface RoomState {
  id: string;
  name: string;
  masterId: string;
  participants: Participant[];
  votes: Record<string, string>;
  currentTicket: Ticket | null;
  revealed: boolean;
  jira: JiraPublicInfo | null;
}

export const VOTING_VALUES = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '?', '☕'];

export const DISCONNECT_THRESHOLD = 30_000;
export const REMOVE_THRESHOLD = 300_000;
