'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ComicJobResult, TranslationJobResult } from '@/lib/types';
import { cn } from './utils';

export type JobType = 'translate' | 'comic';

export type JobStatusResponse = {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  stage?: string;
  createdAt?: string;
  result?: TranslationJobResult | ComicJobResult | { error?: string; [k: string]: unknown };
  data?: unknown;
};

type LogEntry = {
  at: string;
  level: 'info' | 'error';
  message: string;
};

const nowIso = () => new Date().toISOString();

const defaultStageLabels: Record<JobType, string[]> = {
  translate: ['Upload', 'Analyze', 'Translate', 'Build PDF'],
  comic: ['Ingest', 'Script', 'Draw Panels', 'Build PDF'],
};

const getStageIndex = (type: JobType, s: JobStatusResponse): number => {
  if (s.status === 'completed') return 3;
  if (s.status === 'failed') return Math.min(3, Math.floor((s.progress || 0) / 25));

  if (type === 'translate') {
    if (s.progress < 20) return 0;
    if (s.progress < 50) return 1;
    if (s.progress < 80) return 2;
    return 3;
  }

  if (s.progress < 20) return 0;
  if (s.progress < 40) return 1;
  if (s.progress < 85) return 2;
  return 3;
};

const summarizeUpdate = (type: JobType, s: JobStatusResponse): string => {
  if (type === 'comic' && s.stage) return `${s.status} • ${s.stage} • ${s.progress}%`;
  return `${s.status} • ${s.progress}%`;
};

export function ProgressTracker({
  type,
  jobId,
  onStatus,
}: {
  type: JobType;
  jobId: string;
  onStatus?: (s: JobStatusResponse) => void;
}) {
  const [status, setStatus] = useState<JobStatusResponse | null>(null);
  const [connection, setConnection] = useState<'sse' | 'polling'>('sse');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const statusRef = useRef<JobStatusResponse | null>(null);
  const lastSummaryRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const stages = defaultStageLabels[type];

  useEffect(() => {
    setStatus(null);
    statusRef.current = null;
    setLogs([]);
    lastSummaryRef.current = null;

    const url = `/api/${type}/${jobId}/status`;

    const pushLog = (entry: LogEntry) => {
      setLogs((prev) => {
        const next = [...prev, entry];
        return next.length > 200 ? next.slice(next.length - 200) : next;
      });
    };

    const applyStatus = (s: JobStatusResponse) => {
      statusRef.current = s;
      setStatus(s);
      onStatus?.(s);

      const summary = summarizeUpdate(type, s);
      if (lastSummaryRef.current !== summary) {
        lastSummaryRef.current = summary;
        pushLog({ at: nowIso(), level: 'info', message: summary });
      }

      const error = (s.result as any)?.error;
      if (s.status === 'failed' && typeof error === 'string') {
        pushLog({ at: nowIso(), level: 'error', message: `Failed: ${error}` });
      }
    };

    let pollingInterval: number | null = null;
    const startPolling = () => {
      setConnection('polling');
      const tick = async () => {
        try {
          const res = await fetch(url, { cache: 'no-store' });
          
          if (!res.ok) {
            let errorMessage = `HTTP ${res.status}`;
            try {
              const contentType = res.headers.get('content-type');
              if (contentType && contentType.includes('application/json')) {
                const json = await res.json();
                errorMessage = json?.error || json?.details || errorMessage;
              } else {
                const text = await res.text();
                errorMessage = `HTTP ${res.status}: ${text}`;
              }
            } catch (parseError) {
              console.warn('Failed to parse error response:', parseError);
            }
            pushLog({
              at: nowIso(),
              level: 'error',
              message: `Status check failed: ${errorMessage}`,
            });
            return;
          }

          // Check Content-Type before parsing
          const contentType = res.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            pushLog({
              at: nowIso(),
              level: 'error',
              message: 'Invalid response format from server',
            });
            return;
          }

          const json = (await res.json()) as JobStatusResponse;
          applyStatus(json);
        } catch (err) {
          console.error('Polling error:', err);
          pushLog({
            at: nowIso(),
            level: 'error',
            message: err instanceof Error ? `Polling error: ${err.message}` : 'Polling failed',
          });
        }
      };

      void tick();
      pollingInterval = window.setInterval(tick, 2000);
    };

    const canSse = typeof window !== 'undefined' && 'EventSource' in window;
    if (!canSse) {
      startPolling();
      return () => {
        if (pollingInterval) window.clearInterval(pollingInterval);
      };
    }

    setConnection('sse');
    const es = new EventSource(url);
    eventSourceRef.current = es;

    const onSseStatus = (evt: MessageEvent) => {
      try {
        const parsed = JSON.parse(evt.data) as JobStatusResponse;
        applyStatus(parsed);
      } catch {
        pushLog({ at: nowIso(), level: 'error', message: 'Failed to parse SSE status update.' });
      }
    };

    const onSseComplete = (evt: MessageEvent) => {
      try {
        const parsed = JSON.parse(evt.data) as Partial<JobStatusResponse>;
        pushLog({ at: nowIso(), level: 'info', message: `Stream complete • ${parsed.status ?? ''}`.trim() });
      } finally {
        es.close();
      }
    };

    const onSseErrorEvent = (evt: MessageEvent) => {
      try {
        const parsed = JSON.parse(evt.data) as { error?: string; details?: string };
        pushLog({
          at: nowIso(),
          level: 'error',
          message: parsed.details ? `${parsed.error}: ${parsed.details}` : parsed.error || 'SSE error',
        });
      } catch {
        pushLog({ at: nowIso(), level: 'error', message: 'SSE error' });
      }
    };

    es.addEventListener('status', onSseStatus);
    es.addEventListener('complete', onSseComplete);
    es.addEventListener('error', onSseErrorEvent as any);

    const fallbackTimer = window.setTimeout(() => {
      if (!statusRef.current) {
        pushLog({ at: nowIso(), level: 'info', message: 'Falling back to polling…' });
        try {
          es.close();
        } catch {
          // ignore
        }
        startPolling();
      }
    }, 2500);

    es.onerror = () => {
      // If job is already completed, closing is expected.
      const s = statusRef.current;
      if (s?.status === 'completed' || s?.status === 'failed') {
        es.close();
        return;
      }

      // For transient issues, keep SSE alive. Polling fallback is handled by fallbackTimer.
    };

    return () => {
      window.clearTimeout(fallbackTimer);
      es.close();
      if (pollingInterval) window.clearInterval(pollingInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, type]);

  const activeStage = useMemo(() => {
    if (!status) return 0;
    return getStageIndex(type, status);
  }, [status, type]);

  const errorMessage = (status?.result as any)?.error;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          Job <span className="font-mono text-xs">{jobId}</span> • Connection: {connection.toUpperCase()}
        </div>
        <div className="text-sm text-zinc-600 dark:text-zinc-300">{status ? `${status.progress}%` : '—'}</div>
      </div>

      <div className="h-2 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
        <div
          className={cn(
            'h-full transition-all',
            status?.status === 'failed' ? 'bg-red-500' : 'bg-zinc-900 dark:bg-zinc-100'
          )}
          style={{ width: `${Math.max(0, Math.min(100, status?.progress ?? 0))}%` }}
        />
      </div>

      <ol className="grid gap-2 sm:grid-cols-2">
        {stages.map((label, idx) => {
          const done = status?.status === 'completed' ? true : idx < activeStage;
          const active = status?.status === 'completed' ? false : idx === activeStage;

          return (
            <li
              key={label}
              className={cn(
                'rounded-lg border p-3',
                done
                  ? 'border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950'
                  : active
                    ? 'border-zinc-900 dark:border-zinc-100'
                    : 'border-zinc-200 dark:border-zinc-800'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-zinc-500">{done ? 'Done' : active ? 'In progress' : 'Pending'}</div>
              </div>
              {type === 'comic' && active && status?.stage ? (
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{status.stage}</div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {status?.status === 'failed' && typeof errorMessage === 'string' ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {errorMessage}
        </div>
      ) : null}

      <div className="rounded-lg border border-zinc-200 dark:border-zinc-800">
        <div className="border-b border-zinc-200 px-3 py-2 text-sm font-medium dark:border-zinc-800">
          Live logs
        </div>
        <div className="max-h-52 overflow-auto p-3 font-mono text-xs">
          {logs.length ? (
            <ul className="space-y-1">
              {logs.map((l, idx) => (
                <li key={`${l.at}-${idx}`} className={l.level === 'error' ? 'text-red-700 dark:text-red-300' : ''}>
                  <span className="text-zinc-400">{l.at}</span> {l.message}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-zinc-500">Waiting for updates…</div>
          )}
        </div>
      </div>
    </div>
  );
}
