export interface User {
  id: string;
  name: string;
  avatar?: string;
  authType: 'guest' | 'google';
}

export interface Participant extends User {
  role: 'master' | 'dev';
  lastSeen: number;
  connected: boolean;
}

export interface Ticket {
  url: string;
  title: string;
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
}

export interface RoomState {
  id: string;
  name: string;
  masterId: string;
  participants: Participant[];
  votes: Record<string, string>;
  currentTicket: Ticket | null;
  revealed: boolean;
}

export const VOTING_VALUES = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '?', '☕'];

export const DISCONNECT_THRESHOLD = 30_000;
export const REMOVE_THRESHOLD = 300_000;
