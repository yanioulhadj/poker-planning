'use client';

import { useState } from 'react';

interface AvatarProps {
  name: string;
  src?: string;
  className?: string;
  fallbackClassName?: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Avatar utilisateur : photo Google si disponible, sinon initiales.
 * `referrerPolicy="no-referrer"` est nécessaire car les images
 * lh3.googleusercontent.com peuvent renvoyer 403 quand un referrer est envoyé.
 */
export default function Avatar({
  name,
  src,
  className = 'h-6 w-6 text-[10px]',
  fallbackClassName = 'bg-indigo-500',
}: AvatarProps) {
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${className} ${fallbackClassName} flex shrink-0 items-center justify-center rounded-full font-bold text-white`}
    >
      {getInitials(name)}
    </div>
  );
}
