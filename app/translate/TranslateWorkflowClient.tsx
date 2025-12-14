'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileDropzone } from '@/app/_components/FileDropzone';
import { PdfPreview } from '@/app/_components/PdfPreview';
import { ProgressTracker, type JobStatusResponse } from '@/app/_components/ProgressTracker';
import { Spinner } from '@/app/_components/Spinner';
import { formatBytes } from '@/app/_components/utils';
import type { TranslationJobResult } from '@/lib/types';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ACCEPTED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

const acceptAttr = 'application/pdf,image/jpeg,image/png,image/gif,image/webp';

export function TranslateWorkflowClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);

  useEffect(() => {
    const fromQuery = searchParams.get('job');
    if (fromQuery && fromQuery !== jobId) {
      setJobId(fromQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const validateSelectedFile = (f: File): string | null => {
    if (f.size > MAX_FILE_SIZE) return `File too large. Max ${formatBytes(MAX_FILE_SIZE)}.`;
    if (!ACCEPTED_TYPES.includes(f.type as (typeof ACCEPTED_TYPES)[number])) {
      return 'Unsupported file type. Upload a PDF or an image (JPEG/PNG/GIF/WebP).';
    }
    return null;
  };

  const fileError = file ? validateSelectedFile(file) : null;

  const canSubmit = !submitting && !jobId && !fileError && !!file;

  const startOver = () => {
    setJobId(null);
    setJobStatus(null);
    setSubmitError(null);
    setSubmitting(false);
    router.replace('/translate');
  };

  const onSubmit = async () => {
    setFormError(null);
    setSubmitError(null);

    if (!file) {
      setFormError('Please select a file to translate.');
      return;
    }

    const err = validateSelectedFile(file);
    if (err) {
      setFormError(err);
      return;
    }

    setSubmitting(true);
    try {
      const body = new FormData();
      body.append('file', file);

      const res = await fetch('/api/translate', { method: 'POST', body });
      const json = (await res.json()) as any;

      if (!res.ok) {
        setSubmitError(json?.error || json?.details || 'Upload failed');
        setSubmitting(false);
        return;
      }

      const newJobId = String(json.jobId);
      setJobId(newJobId);
      setSubmitting(false);
      router.replace(`/translate?job=${encodeURIComponent(newJobId)}`);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Upload failed');
      setSubmitting(false);
    }
  };

  const result = jobStatus?.result as TranslationJobResult | undefined;
  const previewUrl = result?.previewUrl || (jobId ? `/api/translate/${jobId}/preview` : undefined);
  const downloadUrl = result?.downloadUrl || (jobId ? `/api/translate/${jobId}/download` : undefined);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-xl font-semibold">Upload & translate to Telugu</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Upload a PDF (recommended) or a supported image. We’ll analyze the content, translate it, and generate a
          translated PDF you can preview and download.
        </p>

        <div className="mt-6 space-y-5">
          <FileDropzone
            title="Document"
            description={
              <>
                Max {formatBytes(MAX_FILE_SIZE)}. Accepted: PDF, JPEG, PNG, GIF, WebP.
              </>
            }
            file={file}
            onFileChange={(f) => {
              setFile(f);
              setFormError(null);
              setSubmitError(null);
            }}
            accept={acceptAttr}
            maxBytes={MAX_FILE_SIZE}
            disabled={submitting || !!jobId}
            error={formError || (file ? fileError : null)}
          />

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
              {submitting ? <Spinner label="Uploading…" /> : 'Start translation'}
            </button>

            {jobId ? (
              <button
                type="button"
                onClick={startOver}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-950"
              >
                New translation
              </button>
            ) : null}
          </div>

          {jobId ? (
            <div className="text-xs text-zinc-500">
              Keep this tab open while processing. You can also bookmark the URL to come back to this job.
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-6">
        {jobId ? (
          <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <h2 className="text-lg font-semibold">Progress</h2>
            <div className="mt-4">
              <ProgressTracker type="translate" jobId={jobId} onStatus={setJobStatus} />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
            Submit a document to see processing progress, preview, and download links.
          </div>
        )}

        {jobStatus?.status === 'completed' && previewUrl ? (
          <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Preview</h2>
              <div className="flex items-center gap-2">
                {downloadUrl ? (
                  <a
                    className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-white"
                    href={downloadUrl}
                  >
                    Download PDF
                  </a>
                ) : null}
              </div>
            </div>

            <div className="mt-4">
              <PdfPreview key={jobId} src={previewUrl} title="Translated PDF preview" />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <div className="text-xs text-zinc-500">Detected language</div>
                <div className="font-medium">{result?.language || '—'}</div>
              </div>
              <div className="rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800">
                <div className="text-xs text-zinc-500">Approx. words</div>
                <div className="font-medium">{typeof result?.wordCount === 'number' ? result.wordCount : '—'}</div>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
