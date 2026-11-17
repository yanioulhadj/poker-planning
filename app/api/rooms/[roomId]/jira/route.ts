import { NextResponse } from 'next/server';
import { getRoom, setGroomingStatuses, setJiraConfig } from '@/app/lib/store';
import { normalizeJiraConfig, resolveStoryPointsField, testConnection } from '@/app/lib/jira';

/** Enregistre la configuration Jira de la salle (maître uniquement), après test de connexion. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { userId, baseUrl, email, apiToken, storyPointsField, groomingStatus, projectKey, groomingSprint } = await request.json();

  const room = await getRoom(roomId);
  if (!room) {
    return NextResponse.json({ error: 'Salle introuvable' }, { status: 404 });
  }
  if (room.masterId !== userId) {
    return NextResponse.json({ error: 'Seul le maître de la salle peut configurer Jira' }, { status: 403 });
  }

  if (!groomingSprint?.trim() && !groomingStatus?.trim()) {
    return NextResponse.json(
      { error: 'Indiquez au moins un sprint ou un statut pour lister les tickets à groomer' },
      { status: 400 }
    );
  }

  const config = normalizeJiraConfig({ baseUrl, email, apiToken, storyPointsField, groomingStatus, projectKey, groomingSprint });
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

  await setJiraConfig(roomId, userId, {
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

/** Met à jour le filtre de statuts du backlog (maître uniquement). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { userId, groomingStatuses } = await request.json();

  if (!Array.isArray(groomingStatuses) || groomingStatuses.some((s) => typeof s !== 'string')) {
    return NextResponse.json({ error: 'Liste de statuts invalide' }, { status: 400 });
  }
  const room = await getRoom(roomId);
  if (!room?.jiraConfig) {
    return NextResponse.json({ error: 'Jira non configuré' }, { status: 400 });
  }
  if (!room.jiraConfig.groomingSprint && groomingStatuses.length === 0) {
    return NextResponse.json({ error: 'Sans sprint, au moins un statut est requis' }, { status: 400 });
  }
  if (!(await setGroomingStatuses(roomId, userId, groomingStatuses))) {
    return NextResponse.json({ error: 'Action non autorisée' }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}

/** Supprime la configuration Jira de la salle (maître uniquement). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { userId } = await request.json();

  if (!(await setJiraConfig(roomId, userId, null))) {
    return NextResponse.json({ error: 'Action non autorisée' }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
