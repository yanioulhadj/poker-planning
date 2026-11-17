import { NextResponse } from 'next/server';
import { getRoom } from '@/app/lib/store';
import { searchBacklog } from '@/app/lib/jira';

/** Liste les tickets Jira prêts pour le grooming (réservé aux participants de la room). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const userId = new URL(request.url).searchParams.get('userId');

  const room = await getRoom(roomId);
  if (!room) {
    return NextResponse.json({ error: 'Salle introuvable' }, { status: 404 });
  }
  if (!userId || !room.participants[userId]) {
    return NextResponse.json({ error: 'Accès réservé aux participants de la salle' }, { status: 403 });
  }
  if (!room.jiraConfig) {
    return NextResponse.json({ error: 'Jira non configuré' }, { status: 400 });
  }

  const result = await searchBacklog(room.jiraConfig);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ issues: result.issues });
}
