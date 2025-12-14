'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileDropzone } from '@/app/_components/FileDropzone';
import { PdfPreview } from '@/app/_components/PdfPreview';
import { ProgressTracker, type JobStatusResponse } from '@/app/_components/ProgressTracker';
import { Spinner } from '@/app/_components/Spinner';
import { formatBytes } from '@/app/_components/utils';
import type { ComicJobResult, ComicVisualStyle } from '@/lib/types';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_WORDS = 10_000;

const styles: Array<{ value: ComicVisualStyle; label: string; description: string }> = [
  { value: 'manga', label: 'Manga', description: 'Crisp ink lines + screentone shading.' },
  { value: 'indian-comic', label: 'Indian comic', description: 'Vibrant colors + bold outlines.' },
  { value: 'cinematic', label: 'Cinematic', description: 'Film-still framing + realistic lighting.' },
  { value: 'watercolor', label: 'Watercolor', description: 'Soft washes + painterly texture.' },
  { value: 'noir', label: 'Noir', description: 'High contrast, moody shadows.' },
];

const countWords = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};

export function ComicWorkflowClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');

  const [visualStyle, setVisualStyle] = useState<ComicVisualStyle>('manga');
  const [panelCount, setPanelCount] = useState(6);
  const [panelsPerPage, setPanelsPerPage] = useState<2 | 4 | 6>(4);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);

  useEffect(() => {
    const fromQuery = searchParams.get('job');
    if (fromQuery && fromQuery !== jobId) setJobId(fromQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const wordCount = useMemo(() => countWords(text), [text]);
  const hasText = text.trim().length > 0;
  const wordCountOverLimit = hasText && wordCount > MAX_WORDS;

  const rawFileError = file
    ? (() => {
        if (file.size > MAX_FILE_SIZE) return `File too large. Max ${formatBytes(MAX_FILE_SIZE)}.`;
        if (!['application/pdf', 'text/plain'].includes(file.type)) {
          return 'Unsupported file type. Upload a PDF (or a .txt) or paste text.';
        }
        return null;
      })()
    : null;

  const fileError = hasText ? null : rawFileError;
  const hasInput = hasText || !!file;

  const canSubmit = !submitting && !jobId && hasInput && !wordCountOverLimit && !fileError;

  const validate = (): string | null => {
    if (!hasInput) return 'Provide either story text or a PDF file.';
    if (wordCountOverLimit) return `Text too long. Max ${MAX_WORDS.toLocaleString()} words.`;
    if (fileError) return fileError;
    if (panelCount < 4 || panelCount > 8) return 'Panel count must be between 4 and 8.';
    if (![2, 4, 6].includes(panelsPerPage)) return 'Panels per page must be 2, 4, or 6.';
    return null;
  };

  const startOver = () => {
    setJobId(null);
    setJobStatus(null);
    setSubmitError(null);
    setFormError(null);
    setSubmitting(false);
    router.replace('/comic');
  };

  const onSubmit = async () => {
    setFormError(null);
    setSubmitError(null);

    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }

    setSubmitting(true);

    try {
      const body = new FormData();
      body.append('visualStyle', visualStyle);
      body.append('panelCount', String(panelCount));
      body.append('panelsPerPage', String(panelsPerPage));

      if (hasText) {
        body.append('text', text);
      } else if (file) {
        body.append('file', file);
      }

      const res = await fetch('/api/comic', { method: 'POST', body });

      // Log response for debugging
      console.log('Upload response status:', res.status);
      console.log('Response headers:', Object.fromEntries(res.headers.entries()));

      // Check if response is OK before parsing JSON
      if (!res.ok) {
        let errorMessage = 'Upload failed';
        let errorDetails = '';

        try {
          const contentType = res.headers.get('content-type');
          console.log('Content-Type:', contentType);

          if (contentType && contentType.includes('application/json')) {
            const json = (await res.json()) as { error?: string; details?: string };
            console.log('Error response JSON:', json);
            errorMessage = json?.error || errorMessage;
            errorDetails = json?.details || '';
          } else {
            const text = await res.text();
            console.log('Error response text:', text);
            errorMessage = `Server error (${res.status}): ${text}`;
          }
        } catch (parseError) {
          console.error('Failed to parse error response:', parseError);
          errorMessage = `Server error (${res.status}): Failed to parse response`;
        }

        setSubmitError(errorDetails ? `${errorMessage}: ${errorDetails}` : errorMessage);
        setSubmitting(false);
        return;
      }

      // Parse successful response
      let json: { jobId?: unknown };
      try {
        const contentType = res.headers.get('content-type');
        console.log('Success Content-Type:', contentType);

        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Response is not JSON');
        }

        json = await res.json();
        console.log('Success response JSON:', json);
      } catch (parseError) {
        console.error('Failed to parse success response:', parseError);
        setSubmitError('Invalid response format from server');
        setSubmitting(false);
        return;
      }

      // Validate response structure
      if (!json.jobId) {
        setSubmitError('Invalid response: missing jobId');
        setSubmitting(false);
        return;
      }

      const newJobId = String(json.jobId);
      setJobId(newJobId);
      setSubmitting(false);
      router.replace(`/comic?job=${encodeURIComponent(newJobId)}`);
    } catch (e) {
      console.error('Upload failed:', e);
      let errorMessage = 'Network error: ';
      
      if (e instanceof TypeError && e.message.includes('fetch')) {
        errorMessage += 'Failed to connect to server. Please check your internet connection.';
      } else if (e instanceof Error) {
        errorMessage += e.message;
      } else {
        errorMessage += 'Unknown error occurred';
      }

      setSubmitError(errorMessage);
      setSubmitting(false);
    }
  };

  const result = jobStatus?.result as ComicJobResult | undefined;
  const previewUrl = result?.previewUrl || (jobId ? `/api/comic/${jobId}/preview` : undefined);
  const downloadUrl = result?.downloadUrl || (jobId ? `/api/comic/${jobId}/download` : undefined);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-xl font-semibold">Turn a story into a Telugu comic PDF</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Paste a short story (or upload a PDF). We’ll break it into panels, generate images, and assemble a printable
          comic.
        </p>

        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <div className="font-semibold">Mature content policy</div>
          <div className="mt-1">
            You may use mature themes (PG‑16). Do not submit explicit sexual content, sexual violence, or illegal
            material. Generated output may be moderated or sanitized.
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Story text (optional)</div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                  If both text and a file are provided, text is used.
                </div>
              </div>
              <div className="text-xs text-zinc-500">
                {wordCount.toLocaleString()} / {MAX_WORDS.toLocaleString()} words
              </div>
            </div>

            <textarea
              value={text}
              disabled={submitting || !!jobId}
              onChange={(e) => {
                setText(e.target.value);
                setFormError(null);
                setSubmitError(null);
              }}
              rows={7}
              className="w-full rounded-lg border border-zinc-300 bg-transparent p-3 text-sm outline-none focus:border-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:focus:border-zinc-100"
              placeholder="Paste your story here…"
            />
            {wordCountOverLimit ? (
              <div className="text-sm text-red-600">
                Text is over the limit ({MAX_WORDS.toLocaleString()} words). Please shorten it or upload a smaller PDF.
              </div>
            ) : null}
          </div>

          <FileDropzone
            title="Or upload a PDF"
            description={
              <>
                Max {formatBytes(MAX_FILE_SIZE)}. PDF recommended. (.txt also works.)
              </>
            }
            file={file}
            onFileChange={(f) => {
              setFile(f);
              setFormError(null);
              setSubmitError(null);
            }}
            accept="application/pdf,text/plain"
            maxBytes={MAX_FILE_SIZE}
            disabled={submitting || !!jobId}
            error={fileError}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <div className="text-sm font-medium">Visual style</div>
              <select
                value={visualStyle}
                disabled={submitting || !!jobId}
                onChange={(e) => setVisualStyle(e.target.value as ComicVisualStyle)}
                className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 text-sm outline-none focus:border-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:focus:border-zinc-100"
              >
                {styles.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <div className="text-xs text-zinc-500">
                {styles.find((s) => s.value === visualStyle)?.description}
              </div>
            </label>

            <label className="space-y-1">
              <div className="text-sm font-medium">Panels per page</div>
              <select
                value={panelsPerPage}
                disabled={submitting || !!jobId}
                onChange={(e) => setPanelsPerPage(Number(e.target.value) as 2 | 4 | 6)}
                className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 text-sm outline-none focus:border-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:focus:border-zinc-100"
              >
                {[2, 4, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-sm font-medium">Total panels</div>
              <input
                type="number"
                min={4}
                max={8}
                value={panelCount}
                disabled={submitting || !!jobId}
                onChange={(e) => setPanelCount(Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-300 bg-transparent p-2 text-sm outline-none focus:border-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:focus:border-zinc-100"
              />
              <div className="text-xs text-zinc-500">4–8 panels works best for speed and coherence.</div>
            </label>
          </div>

          {formError ? <div className="text-sm text-red-600">{formError}</div> : null}

          {submitError ? (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
              {submitError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canSubmit}
              onClick={onSubmit}
              className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-zinc-100 dark:text-zinc-950 dark:disabled:bg-zinc-700"
            >
              {submitting ? <Spinner label="Submitting…" /> : 'Generate comic'}
            </button>

            {jobId ? (
              <button
                type="button"
                onClick={startOver}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-950"
              >
                New comic
              </button>
            ) : null}
          </div>

          {jobId ? (
            <div className="text-xs text-zinc-500">
              Keep this tab open. While panels are being generated, you’ll see incremental updates and previews.
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-6">
        {jobId ? (
          <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <h2 className="text-lg font-semibold">Progress</h2>
            <div className="mt-4">
              <ProgressTracker type="comic" jobId={jobId} onStatus={setJobStatus} />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
            Submit a story to see progress, panel previews, and the generated PDF.
          </div>
        )}

        {result?.panels?.length ? (
          <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <h2 className="text-lg font-semibold">Panel previews</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {result.panels.map((p) => (
                <a
                  key={p.index}
                  href={p.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
                  title={p.sceneTitle || `Panel ${p.index + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.previewUrl}
                    alt={p.sceneTitle || `Panel ${p.index + 1}`}
                    className="h-32 w-full object-cover transition group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {jobStatus?.status === 'completed' && previewUrl ? (
          <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Comic PDF</h2>
              {downloadUrl ? (
                <a
                  className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                  href={downloadUrl}
                >
                  Download PDF
                </a>
              ) : null}
            </div>

            {result?.summary ? (
              <div className="mt-4 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <div className="text-xs font-semibold text-zinc-500">Summary</div>
                <div className="mt-1 text-zinc-800 dark:text-zinc-100">{result.summary}</div>
              </div>
            ) : null}

            <div className="mt-4">
              <PdfPreview key={jobId} src={previewUrl} title="Comic PDF preview" />
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
