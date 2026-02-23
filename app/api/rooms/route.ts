import { NextResponse } from 'next/server';
import { createRoom, generateRoomId } from '@/app/lib/store';
import { Participant } from '@/app/lib/types';

export async function POST(request: Request) {
  const body = await request.json();
  const { roomName, userId, userName, avatar, authType } = body;

  if (!roomName || !userId || !userName) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }

  const roomId = generateRoomId();
  const master: Participant = {
    id: userId,
    name: userName,
    avatar: avatar || undefined,
    authType: authType || 'guest',
    role: 'master',
    lastSeen: Date.now(),
    connected: true,
  };

  createRoom(roomId, roomName, master);

  return NextResponse.json({ roomId });
}
