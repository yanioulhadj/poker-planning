import { NextResponse } from 'next/server';
import { getRoom } from '@/app/lib/store';
import { getJiraConfig, extractIssueKey, updateStoryPoints } from '@/app/lib/jira';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { userId, value } = await request.json();

  const room = getRoom(roomId);
  if (!room) {
    return NextResponse.json({ error: 'Salle introuvable' }, { status: 404 });
  }

  if (room.masterId !== userId) {
    return NextResponse.json({ error: 'Seul le maître de la salle peut synchroniser avec Jira' }, { status: 403 });
  }

  const config = getJiraConfig();
  if (!config) {
    return NextResponse.json(
      { error: 'Jira n\'est pas configuré. Ajoutez JIRA_BASE_URL, JIRA_EMAIL et JIRA_API_TOKEN dans vos variables d\'environnement.' },
      { status: 400 }
    );
  }

  if (!room.currentTicket?.url) {
    return NextResponse.json({ error: 'Aucun ticket Jira défini pour cette salle' }, { status: 400 });
  }

  const issueKey = extractIssueKey(room.currentTicket.url);
  if (!issueKey) {
    return NextResponse.json(
      { error: `Impossible d'extraire la clé du ticket depuis : ${room.currentTicket.url}` },
      { status: 400 }
    );
  }

  const points = Number(value);
  if (isNaN(points)) {
    return NextResponse.json(
      { error: `La valeur "${value}" n'est pas un nombre valide pour les story points` },
      { status: 400 }
    );
  }

  const result = await updateStoryPoints(config, issueKey, points);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error || 'Erreur lors de la mise à jour Jira' },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, issueKey, points });
}

export async function GET() {
  const config = getJiraConfig();
  return NextResponse.json({ configured: !!config });
}
