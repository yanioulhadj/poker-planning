import { Room, RoomState, Participant, DISCONNECT_THRESHOLD, REMOVE_THRESHOLD } from './types';

const rooms = new Map<string, Room>();

export function createRoom(id: string, name: string, master: Participant): Room {
  const room: Room = {
    id,
    name,
    masterId: master.id,
    participants: { [master.id]: master },
    votes: {},
    currentTicket: null,
    revealed: false,
    createdAt: Date.now(),
  };
  rooms.set(id, room);
  return room;
}

export function getRoom(roomId: string): Room | undefined {
  return rooms.get(roomId);
}

export function joinRoom(roomId: string, participant: Participant): Room | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  if (room.participants[participant.id]) {
    room.participants[participant.id].lastSeen = Date.now();
    room.participants[participant.id].connected = true;
    room.participants[participant.id].name = participant.name;
    if (participant.avatar) room.participants[participant.id].avatar = participant.avatar;
  } else {
    room.participants[participant.id] = participant;
  }
  return room;
}

export function submitVote(roomId: string, userId: string, value: string): boolean {
  const room = rooms.get(roomId);
  if (!room || !room.participants[userId] || room.revealed) return false;
  room.votes[userId] = value;
  return true;
}

export function revealVotes(roomId: string, userId: string): boolean {
  const room = rooms.get(roomId);
  if (!room || room.masterId !== userId) return false;
  room.revealed = true;
  return true;
}

export function resetRound(roomId: string, userId: string): boolean {
  const room = rooms.get(roomId);
  if (!room || room.masterId !== userId) return false;
  room.votes = {};
  room.revealed = false;
  return true;
}

export function setTicket(roomId: string, userId: string, url: string, title: string): boolean {
  const room = rooms.get(roomId);
  if (!room || room.masterId !== userId) return false;
  room.currentTicket = { url, title };
  room.votes = {};
  room.revealed = false;
  return true;
}

export function heartbeat(roomId: string, userId: string): void {
  const room = rooms.get(roomId);
  if (!room || !room.participants[userId]) return;
  room.participants[userId].lastSeen = Date.now();
  room.participants[userId].connected = true;
}

export function getRoomState(roomId: string, requestingUserId?: string): RoomState | undefined {
  const room = rooms.get(roomId);
  if (!room) return undefined;

  if (requestingUserId) heartbeat(roomId, requestingUserId);

  const now = Date.now();
  const participantEntries = Object.entries(room.participants);

  for (const [id, p] of participantEntries) {
    if (now - p.lastSeen > REMOVE_THRESHOLD) {
      delete room.participants[id];
      delete room.votes[id];
    } else if (now - p.lastSeen > DISCONNECT_THRESHOLD) {
      p.connected = false;
    }
  }

  const participants = Object.values(room.participants);

  const votes: Record<string, string> = {};
  if (room.revealed) {
    Object.assign(votes, room.votes);
  } else {
    for (const uid of Object.keys(room.votes)) {
      votes[uid] = '?';
    }
  }

  return {
    id: room.id,
    name: room.name,
    masterId: room.masterId,
    participants,
    votes,
    currentTicket: room.currentTicket,
    revealed: room.revealed,
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
