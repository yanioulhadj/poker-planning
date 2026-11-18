import { NextResponse } from 'next/server';
import { getRoom, isRoomMaster, setJiraSync } from '@/app/lib/store';
import {
  DEFAULT_TARGET_STATUS,
  extractIssueKey,
  moveIssueToNextSprint,
  transitionIssue,
  updateStoryPoints,
} from '@/app/lib/jira';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { userId, value } = await request.json();

  const room = await getRoom(roomId);
  if (!room) {
    return NextResponse.json({ error: 'Salle introuvable' }, { status: 404 });
  }

  if (!isRoomMaster(room, userId)) {
    return NextResponse.json({ error: 'Seul le maître de la salle peut synchroniser avec Jira' }, { status: 403 });
  }

  const config = room.jiraConfig;
  if (!config) {
    return NextResponse.json(
      { error: 'Jira n\'est pas configuré pour cette salle. Utilisez le bouton « Jira » en haut de la page.' },
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

  // Les story points sont enregistrés : le déplacement de sprint et le changement de statut
  // sont des étapes complémentaires, leurs échecs sont remontés comme avertissements.
  const warnings: string[] = [];

  let sprint: string | undefined;
  if (config.moveToNextSprint !== false) {
    const moved = await moveIssueToNextSprint(config, issueKey);
    if (moved.success) sprint = moved.sprint;
    else warnings.push(`Sprint non modifié : ${moved.error}`);
  }

  let status: string | undefined;
  const targetStatus = config.targetStatus ?? DEFAULT_TARGET_STATUS;
  if (targetStatus) {
    const transitioned = await transitionIssue(config, issueKey, targetStatus);
    if (transitioned.success) status = transitioned.status;
    else warnings.push(`Statut non modifié : ${transitioned.error}`);
  }

  // Mémorise l'envoi dans la room pour que tous les participants le voient
  await setJiraSync(roomId, userId, {
    issueKey,
    points,
    ticketUrl: room.currentTicket.url,
    at: Date.now(),
    ...(status ? { status } : {}),
    ...(sprint ? { sprint } : {}),
  });

  return NextResponse.json({ success: true, issueKey, points, status, sprint, warnings });
}
