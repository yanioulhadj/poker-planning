import { NextResponse } from 'next/server';
import { setMaster } from '@/app/lib/store';

/** Nomme (master: true) ou retire (master: false) un maître. Réservé aux maîtres. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { userId, targetId, master } = await request.json();

  if (!userId || !targetId || typeof master !== 'boolean') {
    return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
  }

  const result = await setMaster(roomId, userId, targetId, master);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}
