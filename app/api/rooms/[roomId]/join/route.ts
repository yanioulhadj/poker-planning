import { NextResponse } from 'next/server';
import { joinRoom } from '@/app/lib/store';
import { Participant } from '@/app/lib/types';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const body = await request.json();
  const { userId, userName, avatar, authType } = body;

  if (!userId || !userName) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }

  const participant: Participant = {
    id: userId,
    name: userName,
    avatar: avatar || undefined,
    authType: authType || 'guest',
    role: 'dev',
    lastSeen: Date.now(),
    connected: true,
  };

  const room = joinRoom(roomId, participant);
  if (!room) {
    return NextResponse.json({ error: 'Salle introuvable' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
