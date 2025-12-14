# Next.js Scaffold Project

This is a scaffolded Next.js 14 project with App Router, TypeScript, TailwindCSS, and core dependencies for AI/PDF processing.

## Getting Started

1.  **Environment Setup**:
    Copy the example environment file and fill in your API keys:
    ```bash
    cp .env.example .env.local
    ```
    Add your OpenAI and Replicate API keys in `.env.local`.

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Run the Development Server**:
    ```bash
    npm run dev
    ```

    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Structure

-   `app/`: Application routes and pages.
    -   `/`: Home page with navigation.
    -   `/translate`: Placeholder for translation functionality.
    -   `/comic`: Placeholder for comic processing functionality.
-   `lib/`: Shared libraries and utilities.
    -   `ai.ts`: OpenAI and Replicate client instances.
    -   `pdf.ts`: PDF processing helpers.
    -   `storage.ts`: Storage provider interface and placeholder.
    -   `store.ts`: Client-side Zustand store for state management.
    -   `jobs.ts`: Server-side in-memory job store.

## Dependencies

-   **Core Framework**: Next.js 14, React 18
-   **Styling**: TailwindCSS
-   **AI**: OpenAI, Replicate
-   **PDF/Image**: pdf-parse, pdf-lib, sharp
-   **Utilities**: franc (language detection), formidable (file uploads), zustand (state management)
-   **Linting/Formatting**: ESLint, Prettier

## Commands

-   `npm run dev`: Start development server.
-   `npm run build`: Build for production.
-   `npm run start`: Start production server.
-   `npm run lint`: Run ESLint.
