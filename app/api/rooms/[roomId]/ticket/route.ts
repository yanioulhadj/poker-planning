import { NextResponse } from 'next/server';
import { setTicket } from '@/app/lib/store';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { userId, url, title } = await request.json();

  if (!userId || !url) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }

  const success = setTicket(roomId, userId, url, title || url);
  if (!success) {
    return NextResponse.json({ error: 'Action non autorisée' }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
