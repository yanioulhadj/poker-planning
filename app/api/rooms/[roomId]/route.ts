import { NextResponse } from 'next/server';
import { getRoomState } from '@/app/lib/store';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId') || undefined;

  const state = getRoomState(roomId, userId);
  if (!state) {
    return NextResponse.json({ error: 'Salle introuvable' }, { status: 404 });
  }

  return NextResponse.json(state);
}
