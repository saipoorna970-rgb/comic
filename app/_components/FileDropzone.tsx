'use client';

import React, { useCallback, useId, useMemo, useState } from 'react';
import { cn, formatBytes } from './utils';

type Props = {
  title: string;
  description?: React.ReactNode;
  file: File | null;
  onFileChange: (file: File | null) => void;
  accept?: string;
  maxBytes?: number;
  disabled?: boolean;
  error?: string | null;
};

export function FileDropzone({
  title,
  description,
  file,
  onFileChange,
  accept,
  maxBytes,
  disabled,
  error,
}: Props) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);

  const counter = useMemo(() => {
    if (!maxBytes) return null;
    const used = file?.size ?? 0;
    return `${formatBytes(used)} / ${formatBytes(maxBytes)}`;
  }, [file?.size, maxBytes]);

  const onPick = useCallback(
    (f: File | null) => {
      onFileChange(f);
    },
    [onFileChange]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      setIsDragging(false);
      const dropped = e.dataTransfer.files?.[0] ?? null;
      onPick(dropped);
    },
    [disabled, onPick]
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      setIsDragging(true);
    },
    [disabled]
  );

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-sm font-medium">{title}</div>
          {description ? (
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{description}</div>
          ) : null}
        </div>
        {counter ? <div className="text-xs text-zinc-500">{counter}</div> : null}
      </div>

      <label
        htmlFor={inputId}
        className={cn(
          'block rounded-lg border border-dashed p-4 transition',
          disabled
            ? 'cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950'
            : 'cursor-pointer border-zinc-300 hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500',
          isDragging ? 'border-zinc-900 dark:border-zinc-200' : '',
          error ? 'border-red-500' : ''
        )}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        <input
          id={inputId}
          type="file"
          className="hidden"
          accept={accept}
          disabled={disabled}
          onChange={(e) => {
            const picked = e.target.files?.[0] ?? null;
            onPick(picked);
          }}
        />

        <div className="flex flex-col gap-1">
          <div className="text-sm">
            {file ? (
              <span className="font-medium">{file.name}</span>
            ) : (
              <span className="font-medium">Drop a file here</span>
            )}
          </div>
          <div className="text-xs text-zinc-600 dark:text-zinc-300">
            {file ? `Size: ${formatBytes(file.size)}` : 'Or click to browse.'}
          </div>
        </div>
      </label>

      {file ? (
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs text-zinc-500">Selected file will be uploaded to the server for processing.</div>
          <button
            type="button"
            className="text-xs font-medium text-zinc-700 underline disabled:text-zinc-400 dark:text-zinc-200"
            disabled={disabled}
            onClick={() => onPick(null)}
          >
            Clear
          </button>
        </div>
      ) : null}

      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </div>
  );
}
