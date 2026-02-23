import { NextResponse } from 'next/server';
import { resetRound } from '@/app/lib/store';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const { userId } = await request.json();

  const success = resetRound(roomId, userId);
  if (!success) {
    return NextResponse.json({ error: 'Action non autorisée' }, { status: 403 });
  }

  return NextResponse.json({ success: true });
}
