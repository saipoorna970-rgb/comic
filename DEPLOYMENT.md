# Deployment Guide for TeluguTransComic on Vercel

This guide outlines the steps to deploy the TeluguTransComic application to Vercel.

## Prerequisites

- A [Vercel](https://vercel.com/) account
- A [GitHub](https://github.com/) account
- OpenAI API Key (`OPENAI_API_KEY`)
- Replicate API Token (`REPLICATE_API_TOKEN`)

## 1. Vercel Project Setup

1.  **Login to Vercel**: Go to [vercel.com](https://vercel.com) and log in.
2.  **Import Project**:
    - Click "Add New..." > "Project".
    - Select your GitHub repository (`TeluguTransComic`).
    - Click "Import".

## 2. Environment Variables

You must configure the following environment variables in the Vercel project settings for the application to function correctly.

1.  In the "Configure Project" screen (or later in Settings > Environment Variables):
2.  Add the following variables:

    | Variable Name | Description | Example Value |
    | :--- | :--- | :--- |
    | `OPENAI_API_KEY` | Your OpenAI API Key for translation and script generation | `sk-proj-...` |
    | `REPLICATE_API_TOKEN` | Your Replicate API Token for image generation | `r8_...` |

3.  Ensure these variables are available for **Production**, **Preview**, and **Development** environments (selected by default).

## 3. Deployment Configuration

The project is configured for Vercel with the following settings:

- **Framework Preset**: Next.js
- **Root Directory**: `.` (default)
- **Build Command**: `npm run build` (or `next build`)
- **Output Directory**: `.next` (default)
- **Install Command**: `npm install` (default)
- **Node.js Version**: 18.x or 20.x (Specified in `package.json` as `>=18.17.0`)

## 4. File Storage and Limitations

### Temporary Storage
The application uses the `/tmp` directory for processing file uploads and generating PDFs. Vercel Serverless Functions allow writing to `/tmp`, but with specific caveats:

- **Ephemeral**: Files in `/tmp` are not persistent. They may disappear between function invocations.
- **Size Limit**: The `/tmp` directory has a size limit (typically 512MB to 2GB depending on the plan).
- **Cleanup**: The application implements a cleanup mechanism, but on Vercel, this relies on the function instance staying alive or subsequent requests triggering cleanup. Since instances are ephemeral, long-term cleanup guarantees are limited.

### Upload Limits
**Important**: Vercel Serverless Functions have a strict **Request Body Limit of 4.5 MB**.

- **Small Files**: Files under 4.5 MB will upload and process correctly.
- **Large Files**: Uploads larger than 4.5 MB sent directly to the API routes will fail with a `413 Payload Too Large` error (or similar network error) before reaching the application logic.

**Workaround for Large Files (>4.5 MB)**:
To support larger files (up to 100MB) in a production Vercel environment, the architecture would need to be modified to use:
1.  **Client-side uploads** to object storage (like AWS S3 or Vercel Blob).
2.  Pass the file URL to the API instead of the file content.

The current implementation uses standard multipart form uploads which are subject to Vercel's body size limits.

### Execution Timeout
Vercel Serverless Functions have execution timeouts:
- **Hobby Plan**: 10 seconds (default), up to 60 seconds.
- **Pro Plan**: 15 seconds (default), up to 300 seconds (5 minutes).

**Impact**:
- **Translation**: Long PDF translations might exceed the timeout. The application chunks text, but processing a large PDF synchronously might time out.
- **Comic Generation**: Generating images with Replicate is asynchronous (we wait for the result), but if it takes too long, the Vercel function might time out.

**Recommendation**:
For best results on Vercel, use the Pro plan and configure the function timeout to the maximum allowed (300 seconds) in `vercel.json` or Project Settings.

## 5. Deployment Verification

After deployment:

1.  **Visit the URL**: Open the deployed Vercel URL (e.g., `https://telugu-trans-comic.vercel.app`).
2.  **Check API**:
    - Upload a small PDF (e.g., < 1MB) to the translation endpoint.
    - Verify the job is created and status updates are received.
3.  **Check Logs**:
    - Go to Vercel Dashboard > Project > Logs.
    - Monitor for any `ERROR` logs during processing.

## 6. Known Issues & Workarounds

- **"File too large"**: If you encounter this on Vercel for files > 4.5MB, it is due to the platform limit. Run the application locally or deploy to a VPS/Container service (like Railway, Render, or Docker) to bypass this limit.
- **"Task timed out"**: If a job fails with a timeout, try processing a smaller file or splitting the PDF into smaller pages.

## 7. Local Development

To run locally (where these limits do not apply):

```bash
npm install
npm run dev
```

Ensure `.env` contains your API keys.
