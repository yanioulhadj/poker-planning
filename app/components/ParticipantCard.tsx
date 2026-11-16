'use client';

import { Participant } from '@/app/lib/types';
import Avatar from '@/app/components/Avatar';

interface ParticipantCardProps {
  participant: Participant;
  vote: string | undefined;
  revealed: boolean;
  isMaster: boolean;
}

export default function ParticipantCard({ participant, vote, revealed, isMaster }: ParticipantCardProps) {
  const hasVoted = vote !== undefined;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Card */}
      <div
        className={`
          flex h-20 w-14 items-center justify-center rounded-lg border-2 text-sm font-bold
          transition-all duration-500
          sm:h-24 sm:w-16 sm:text-base
          ${!hasVoted
            ? 'border-dashed border-slate-300 bg-slate-50 text-slate-400'
            : revealed
              ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
              : 'border-emerald-400 bg-emerald-50 text-emerald-600'
          }
        `}
      >
        {!hasVoted ? '—' : revealed ? vote : '✓'}
      </div>

      {/* Avatar + Name */}
      <div className="flex flex-col items-center gap-0.5">
        <Avatar
          name={participant.name}
          src={participant.avatar}
          fallbackClassName={isMaster ? 'bg-amber-500' : 'bg-indigo-500'}
        />
        <span className={`max-w-[72px] truncate text-xs ${!participant.connected ? 'text-slate-400' : 'text-slate-600'}`}>
          {participant.name}
        </span>
        {isMaster && (
          <span className="text-[10px] font-medium text-amber-600">Maître</span>
        )}
      </div>
    </div>
  );
}
