'use client';

interface VotingCardProps {
  value: string;
  selected: boolean;
  disabled: boolean;
  onClick: (value: string) => void;
}

export default function VotingCard({ value, selected, disabled, onClick }: VotingCardProps) {
  return (
    <button
      onClick={() => onClick(value)}
      disabled={disabled}
      className={`
        relative flex h-24 w-16 items-center justify-center rounded-xl border-2 text-lg font-bold
        transition-all duration-200 cursor-pointer select-none
        sm:h-28 sm:w-20 sm:text-xl
        ${selected
          ? 'border-indigo-600 bg-indigo-500 text-white shadow-lg shadow-indigo-500/40 ring-4 ring-indigo-200 -translate-y-3 scale-110'
          : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:shadow-md hover:-translate-y-1'
        }
        ${disabled && !selected ? 'opacity-50 cursor-not-allowed hover:translate-y-0 hover:shadow-none' : ''}
      `}
    >
      {value}
      {selected && (
        <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs text-white shadow ring-2 ring-white">
          ✓
        </span>
      )}
    </button>
  );
}
