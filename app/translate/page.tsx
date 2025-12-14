import Link from 'next/link';
import type { Metadata } from 'next';
import { TranslateWorkflowClient } from './TranslateWorkflowClient';

export const metadata: Metadata = {
  title: 'Translate → Telugu',
  description: 'Upload a document and generate a Telugu translation PDF with live progress.',
};

export default function TranslatePage() {
  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm text-zinc-600 dark:text-zinc-300">
              <Link className="underline" href="/">
                Home
              </Link>
              <span className="mx-2">/</span>
              <span>Translate</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Translate a PDF to Telugu</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-300">
              A simple end-to-end workflow: upload → progress updates → preview → download.
            </p>
          </div>
        </header>

        <TranslateWorkflowClient />
      </div>
    </main>
  );
}
