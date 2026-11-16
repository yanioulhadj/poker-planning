import { NextResponse } from 'next/server';
import { getRoom, setJiraConfig } from '@/app/lib/store';
import { normalizeJiraConfig, resolveStoryPointsField, testConnection } from '@/app/lib/jira';

/** Enregistre la configuration Jira de la salle (maître uniquement), après test de connexion. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { userId, baseUrl, email, apiToken, storyPointsField } = await request.json();

  const room = getRoom(roomId);
  if (!room) {
    return NextResponse.json({ error: 'Salle introuvable' }, { status: 404 });
  }
  if (room.masterId !== userId) {
    return NextResponse.json({ error: 'Seul le maître de la salle peut configurer Jira' }, { status: 403 });
  }

  const config = normalizeJiraConfig({ baseUrl, email, apiToken, storyPointsField });
  if (!config) {
    return NextResponse.json(
      { error: 'Champs invalides : URL (https://…), email et token API sont requis' },
      { status: 400 }
    );
  }

  const test = await testConnection(config);
  if (!test.success) {
    return NextResponse.json({ error: test.error }, { status: 400 });
  }

  const field = await resolveStoryPointsField(config);
  if (!field.success) {
    return NextResponse.json({ error: field.error }, { status: 400 });
  }

  setJiraConfig(roomId, userId, {
    ...config,
    storyPointsField: field.id,
    storyPointsFieldName: field.name,
  });
  return NextResponse.json({
    success: true,
    displayName: test.displayName,
    storyPointsField: field.id,
    storyPointsFieldName: field.name,
  });
}

/** Supprime la configuration Jira de la salle (maître uniquement). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { userId } = await request.json();

  if (!setJiraConfig(roomId, userId, null)) {
    return NextResponse.json({ error: 'Action non autorisée' }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
