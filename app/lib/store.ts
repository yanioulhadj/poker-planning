import { Room, RoomState, Participant, JiraConfig, JiraSync, Ticket, DISCONNECT_THRESHOLD, REMOVE_THRESHOLD } from './types';
import { hasConsensus } from './votes';
import { kv } from './kv';

/**
 * Les rooms sont persistées dans un KV (Upstash Redis en prod) pour être partagées
 * entre toutes les instances serverless. Une room = 4 clés :
 *   room:{id}               → méta (JSON) : nom, maître, ticket, révélé, config Jira
 *   room:{id}:participants  → hash userId → Participant (JSON)
 *   room:{id}:votes         → hash userId → valeur (écritures atomiques par votant)
 *   room:{id}:seen          → hash userId → dernier signe de vie (ms)
 * Elles expirent après ROOM_TTL sans activité.
 */
const ROOM_TTL_SECONDS = 60 * 60 * 24;

interface RoomMeta {
  id: string;
  name: string;
  masterId: string;
  currentTicket: Ticket | null;
  revealed: boolean;
  createdAt: number;
  jiraConfig: JiraConfig | null;
  jiraSync?: JiraSync | null;
}

function normalizeRoomId(id: string): string {
  return id?.toLowerCase().trim() || '';
}

const keys = (id: string) => ({
  meta: `room:${id}`,
  participants: `room:${id}:participants`,
  votes: `room:${id}:votes`,
  seen: `room:${id}:seen`,
});

async function touch(id: string): Promise<void> {
  const k = keys(id);
  await kv.expire([k.meta, k.participants, k.votes, k.seen], ROOM_TTL_SECONDS);
}

async function getMeta(id: string): Promise<RoomMeta | null> {
  const raw = await kv.get(keys(id).meta);
  return raw ? (JSON.parse(raw) as RoomMeta) : null;
}

async function saveMeta(meta: RoomMeta): Promise<void> {
  await kv.set(keys(meta.id).meta, JSON.stringify(meta), ROOM_TTL_SECONDS);
}

/** Modifie la méta si l'utilisateur est le maître de la room. */
async function updateAsMaster(
  roomId: string,
  userId: string,
  update: (meta: RoomMeta) => void
): Promise<RoomMeta | null> {
  const meta = await getMeta(normalizeRoomId(roomId));
  if (!meta || meta.masterId !== userId) return null;
  update(meta);
  await saveMeta(meta);
  await touch(meta.id);
  return meta;
}

export async function createRoom(id: string, name: string, master: Participant): Promise<void> {
  const normId = normalizeRoomId(id);
  const k = keys(normId);
  await saveMeta({
    id: normId,
    name,
    masterId: master.id,
    currentTicket: null,
    revealed: false,
    createdAt: Date.now(),
    jiraConfig: null,
  });
  await Promise.all([
    kv.hset(k.participants, master.id, JSON.stringify(master)),
    kv.hset(k.seen, master.id, String(Date.now())),
  ]);
  await touch(normId);
}

export async function getRoom(roomId: string): Promise<Room | undefined> {
  const normId = normalizeRoomId(roomId);
  const meta = await getMeta(normId);
  if (!meta) return undefined;

  const k = keys(normId);
  const [rawParticipants, votes, seen] = await Promise.all([
    kv.hgetall(k.participants),
    kv.hgetall(k.votes),
    kv.hgetall(k.seen),
  ]);

  const now = Date.now();
  const participants: Record<string, Participant> = {};
  for (const [uid, raw] of Object.entries(rawParticipants)) {
    const p = JSON.parse(raw) as Participant;
    const lastSeen = Number(seen[uid] ?? p.lastSeen ?? 0);
    participants[uid] = { ...p, lastSeen, connected: now - lastSeen <= DISCONNECT_THRESHOLD };
  }

  return { ...meta, participants, votes };
}

export async function joinRoom(roomId: string, participant: Participant): Promise<boolean> {
  const normId = normalizeRoomId(roomId);
  const meta = await getMeta(normId);
  if (!meta) return false;

  const k = keys(normId);
  const existingRaw = (await kv.hgetall(k.participants))[participant.id];
  const existing = existingRaw ? (JSON.parse(existingRaw) as Participant) : null;
  const next: Participant = existing
    ? {
        ...existing,
        name: participant.name,
        avatar: participant.avatar || existing.avatar,
        // Le maître garde son rôle ; les autres peuvent basculer participant ↔ observateur
        role: existing.role === 'master' || participant.id === meta.masterId ? 'master' : participant.role,
      }
    : participant;

  await Promise.all([
    kv.hset(k.participants, participant.id, JSON.stringify(next)),
    kv.hset(k.seen, participant.id, String(Date.now())),
    // Un observateur ne vote pas : on retire un éventuel vote en cours
    next.role === 'observer' ? kv.hdel(k.votes, participant.id) : Promise.resolve(),
  ]);
  await touch(normId);
  return true;
}

export async function submitVote(roomId: string, userId: string, value: string): Promise<boolean> {
  const room = await getRoom(roomId);
  if (!room || !room.participants[userId]) return false;
  if (room.participants[userId].role === 'observer') return false;
  // Après révélation : seuls les votants peuvent modifier leur vote, et uniquement
  // tant qu'il n'y a pas de consensus (pour s'aligner sur les autres).
  if (room.revealed && (!(userId in room.votes) || hasConsensus(room.votes))) return false;
  await kv.hset(keys(room.id).votes, userId, value);
  await touch(room.id);
  return true;
}

export async function revealVotes(roomId: string, userId: string): Promise<boolean> {
  return !!(await updateAsMaster(roomId, userId, (m) => { m.revealed = true; }));
}

export async function resetRound(roomId: string, userId: string): Promise<boolean> {
  const meta = await updateAsMaster(roomId, userId, (m) => { m.revealed = false; });
  if (!meta) return false;
  await kv.del(keys(meta.id).votes);
  return true;
}

export async function setTicket(roomId: string, userId: string, url: string, title: string): Promise<boolean> {
  const meta = await updateAsMaster(roomId, userId, (m) => {
    m.currentTicket = { url, title };
    m.revealed = false;
  });
  if (!meta) return false;
  await kv.del(keys(meta.id).votes);
  return true;
}

export async function setJiraConfig(roomId: string, userId: string, config: JiraConfig | null): Promise<boolean> {
  return !!(await updateAsMaster(roomId, userId, (m) => { m.jiraConfig = config; }));
}

/** Enregistre le dernier envoi de story points sur Jira (maître uniquement). */
export async function setJiraSync(roomId: string, userId: string, sync: JiraSync): Promise<boolean> {
  return !!(await updateAsMaster(roomId, userId, (m) => { m.jiraSync = sync; }));
}

/** Met à jour uniquement le filtre de statuts du backlog (maître uniquement). */
export async function setGroomingStatuses(roomId: string, userId: string, statuses: string[]): Promise<boolean> {
  return !!(await updateAsMaster(roomId, userId, (m) => {
    if (!m.jiraConfig) return;
    const value = statuses.map((s) => s.trim()).filter(Boolean).join(', ');
    m.jiraConfig.groomingStatus = value || undefined;
  }));
}

export async function getRoomState(roomId: string, requestingUserId?: string): Promise<RoomState | undefined> {
  const room = await getRoom(roomId);
  if (!room) return undefined;
  const k = keys(room.id);

  // Heartbeat du demandeur, s'il fait partie de la room
  if (requestingUserId && room.participants[requestingUserId]) {
    const now = Date.now();
    await kv.hset(k.seen, requestingUserId, String(now));
    room.participants[requestingUserId].lastSeen = now;
    room.participants[requestingUserId].connected = true;
  }

  // Retire les participants absents depuis trop longtemps (jamais le maître)
  const now = Date.now();
  const stale = Object.values(room.participants)
    .filter((p) => now - p.lastSeen > REMOVE_THRESHOLD && p.id !== room.masterId)
    .map((p) => p.id);
  if (stale.length) {
    await Promise.all([kv.hdel(k.participants, ...stale), kv.hdel(k.votes, ...stale), kv.hdel(k.seen, ...stale)]);
    for (const id of stale) {
      delete room.participants[id];
      delete room.votes[id];
    }
  }

  const votes: Record<string, string> = {};
  if (room.revealed) {
    Object.assign(votes, room.votes);
  } else {
    // Votes masqués avant révélation, sauf celui de l'utilisateur qui demande
    for (const uid of Object.keys(room.votes)) {
      votes[uid] = uid === requestingUserId ? room.votes[uid] : '?';
    }
  }

  return {
    id: room.id,
    name: room.name,
    masterId: room.masterId,
    participants: Object.values(room.participants),
    votes,
    currentTicket: room.currentTicket,
    revealed: room.revealed,
    jira: room.jiraConfig
      ? {
          baseUrl: room.jiraConfig.baseUrl,
          email: room.jiraConfig.email,
          storyPointsField: room.jiraConfig.storyPointsField,
          storyPointsFieldName: room.jiraConfig.storyPointsFieldName,
          groomingStatus: room.jiraConfig.groomingStatus,
          projectKey: room.jiraConfig.projectKey,
          groomingSprint: room.jiraConfig.groomingSprint,
        }
      : null,
    jiraSync: room.jiraSync ?? null,
  };
}

export function generateRoomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const nums = '0123456789';
  let id = '';
  for (let i = 0; i < 3; i++) id += chars[Math.floor(Math.random() * chars.length)];
  id += '-';
  for (let i = 0; i < 4; i++) id += nums[Math.floor(Math.random() * nums.length)];
  return id;
}
