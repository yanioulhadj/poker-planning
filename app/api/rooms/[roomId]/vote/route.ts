import { NextResponse } from 'next/server';
import { submitVote } from '@/app/lib/store';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { userId, value } = await request.json();

  if (!userId || value === undefined) {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }

  const success = submitVote(roomId, userId, value);
  if (!success) {
    return NextResponse.json({ error: 'Vote impossible' }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
