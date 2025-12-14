'use client';

import React from 'react';

export function PdfPreview({ src, title }: { src: string; title?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <object
        data={src}
        type="application/pdf"
        className="h-[70vh] w-full"
        aria-label={title ?? 'PDF preview'}
      >
        <div className="p-4 text-sm">
          <p className="mb-2">Your browser could not display the PDF preview.</p>
          <a className="underline" href={src} target="_blank" rel="noreferrer">
            Open preview in a new tab
          </a>
        </div>
      </object>
    </div>
  );
}
