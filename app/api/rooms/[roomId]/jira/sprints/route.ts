import { NextResponse } from 'next/server';
import { getRoom, isRoomMaster } from '@/app/lib/store';
import { listSprints, normalizeJiraConfig } from '@/app/lib/jira';

/**
 * Liste les sprints actifs et futurs pour choisir le sprint cible (maître uniquement).
 * Utilise les identifiants saisis dans le formulaire ; sans token, reprend celui de la room.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { userId, baseUrl, email, apiToken, projectKey, groomingSprint, groomingStatus } = await request.json();

  const room = await getRoom(roomId);
  if (!room) {
    return NextResponse.json({ error: 'Salle introuvable' }, { status: 404 });
  }
  if (!isRoomMaster(room, userId)) {
    return NextResponse.json({ error: 'Seul le maître de la salle peut configurer Jira' }, { status: 403 });
  }

  const saved = room.jiraConfig;
  const url = (baseUrl || saved?.baseUrl || '').trim().replace(/\/+$/, '');
  const login = (email || saved?.email || '').trim();
  // Le token enregistré n'est réutilisé que pour la même instance et le même compte
  const sameAccount = !!saved && saved.baseUrl === url && saved.email === login;
  const config = normalizeJiraConfig({
    baseUrl: url,
    email: login,
    apiToken: apiToken || (sameAccount ? saved.apiToken : ''),
    projectKey: typeof projectKey === 'string' ? projectKey : saved?.projectKey,
    groomingSprint: typeof groomingSprint === 'string' ? groomingSprint : saved?.groomingSprint,
    groomingStatus: typeof groomingStatus === 'string' ? groomingStatus : saved?.groomingStatus,
  });
  if (!config) {
    return NextResponse.json({ error: 'Renseignez l’URL, l’email et le token pour charger les sprints' }, { status: 400 });
  }

  const result = await listSprints(config);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ sprints: result.sprints });
}
