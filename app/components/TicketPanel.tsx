'use client';

import { useState } from 'react';
import { Ticket } from '@/app/lib/types';

interface TicketPanelProps {
  ticket: Ticket | null;
  isMaster: boolean;
  onSetTicket: (url: string, title: string) => void;
  showIframe: boolean;
  onToggleIframe: () => void;
}

export default function TicketPanel({ ticket, isMaster, onSetTicket, showIframe, onToggleIframe }: TicketPanelProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [editing, setEditing] = useState(false);

  const handleSubmit = () => {
    if (!url.trim()) return;
    onSetTicket(url.trim(), title.trim() || url.trim());
    setUrl('');
    setTitle('');
    setEditing(false);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Ticket actuel</h3>
        {isMaster && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100 cursor-pointer"
          >
            {ticket ? 'Modifier' : 'Ajouter un ticket'}
          </button>
        )}
      </div>

      {editing && isMaster ? (
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Titre du ticket (ex: PROJ-123)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
          />
          <input
            type="url"
            placeholder="URL du ticket Jira"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-600 cursor-pointer"
            >
              Valider
            </button>
            <button
              onClick={() => { setEditing(false); setUrl(''); setTitle(''); }}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 cursor-pointer"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : ticket ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">{ticket.title}</p>
          <div className="flex items-center gap-2">
            <a
              href={ticket.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-indigo-500 underline hover:text-indigo-700"
            >
              Voir le ticket ↗
            </a>
            <button
              onClick={onToggleIframe}
              className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 transition hover:bg-slate-200 cursor-pointer"
            >
              {showIframe ? 'Masquer aperçu' : 'Aperçu'}
            </button>
          </div>
          {showIframe && (
            <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
              <iframe
                src={ticket.url}
                className="h-64 w-full"
                title="Ticket preview"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-slate-400 italic">
          {isMaster ? 'Ajoutez un ticket pour commencer le sizing' : 'Aucun ticket défini pour le moment'}
        </p>
      )}
    </div>
  );
}
