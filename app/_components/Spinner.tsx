'use client';

import React from 'react';

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-2">
      <div
        className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100"
        aria-hidden
      />
      {label ? <span className="text-sm text-zinc-600 dark:text-zinc-300">{label}</span> : null}
    </div>
  );
}
