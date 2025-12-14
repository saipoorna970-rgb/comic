import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 gap-8">
      <h1 className="text-4xl font-bold">Project Scaffold</h1>
      <nav className="flex gap-4">
        <Link
          href="/translate"
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
        >
          Go to Translate
        </Link>
        <Link
          href="/comic"
          className="rounded bg-green-500 px-4 py-2 font-bold text-white hover:bg-green-700"
        >
          Go to Comic
        </Link>
      </nav>
    </main>
  );
}
