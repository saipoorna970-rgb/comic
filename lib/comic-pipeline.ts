import fs from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { getOpenAI, getReplicate } from './ai';
import { extractTextFromPdf } from './pdf';
import { updateJob, getJob } from './jobs';
import type {
  ComicJobData,
  ComicJobResult,
  ComicPanelResult,
  ComicVisualStyle,
} from './types';

const COMIC_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const CLEANUP_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
const MAX_WORDS = 10_000;

type Scene = {
  title?: string;
  visual: string;
  dialogue_telugu: string;
};

interface SceneJSON {
  title?: string;
  visual: string;
  dialogue_telugu: string;
}

export const processComicJob = async (jobId: string): Promise<void> => {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Comic job timeout')), COMIC_TIMEOUT);
  });

  try {
    await Promise.race([processComicJobInternal(jobId), timeoutPromise]);
  } catch (error) {
    console.error('Comic job processing failed:', error);
    updateJob(jobId, {
      status: 'failed',
      progress: 100,
      stage: 'failed',
      result: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
};

const processComicJobInternal = async (jobId: string): Promise<void> => {
  updateJob(jobId, { status: 'processing', progress: 5, stage: 'initializing' });

  const job = getJob(jobId);
  if (!job || job.type !== 'comic') {
    throw new Error('Invalid job');
  }

  const data = job.data as ComicJobData;

  const comicDir = path.join(os.tmpdir(), 'comic', jobId);
  const panelsDir = path.join(comicDir, 'panels');
  const outputDir = path.join(os.tmpdir(), 'outputs');

  await fs.promises.mkdir(panelsDir, { recursive: true });
  await fs.promises.mkdir(outputDir, { recursive: true });

  updateJob(jobId, { progress: 10, stage: 'extracting-text' });

  const storyText = await getStoryText(data);
  const cleanedText = cleanText(storyText);
  const wordCount = countWords(cleanedText);
  if (wordCount > MAX_WORDS) {
    throw new Error(`Story too long. Max ${MAX_WORDS} words.`);
  }

  updateJob(jobId, {
    data: {
      ...data,
      storyText: cleanedText,
    },
  });

  updateJob(jobId, { progress: 20, stage: 'analyzing-story' });
  const { summary } = await analyzeStory(cleanedText, data.panelCount);

  updateJob(jobId, {
    progress: 30,
    stage: 'generating-script',
    result: {
      summary,
      panels: [],
    } satisfies ComicJobResult,
  });

  const { scenes } = await generateScript({
    storyText: cleanedText,
    summary,
    visualStyle: data.visualStyle,
    panelCount: data.panelCount,
  });

  // Draw panels
  updateJob(jobId, { progress: 40, stage: 'drawing-panels' });

  const panels: ComicPanelResult[] = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];

    const panelProgress = 40 + Math.floor(((i + 1) / scenes.length) * 40); // 40 -> 80
    updateJob(jobId, {
      progress: panelProgress,
      stage: `drawing-panels (${i + 1}/${scenes.length})`,
    });

    const imagePrompt = buildImagePrompt(scene.visual, data.visualStyle);

    const {
      finalImagePath,
      replicateUrl,
    } = await generatePanelImage({
      index: i,
      panelsDir,
      imagePrompt,
      dialogueTelugu: scene.dialogue_telugu,
    });

    const panelResult: ComicPanelResult = {
      index: i,
      sceneTitle: scene.title,
      sceneDescription: scene.visual,
      dialogueTelugu: scene.dialogue_telugu,
      imagePrompt,
      replicateImageUrl: replicateUrl,
      previewUrl: `/api/comic/${jobId}/panels/${i}`,
    };

    panels.push(panelResult);

    updateJob(jobId, {
      result: {
        summary,
        panels,
      } satisfies ComicJobResult,
    });

    // Persist a pointer for PDF build
    await fs.promises.writeFile(
      path.join(panelsDir, `panel-${String(i).padStart(3, '0')}.meta.json`),
      JSON.stringify(
        {
          ...panelResult,
          localImagePath: finalImagePath,
        },
        null,
        2
      )
    );
  }

  updateJob(jobId, { progress: 85, stage: 'building-pdf' });

  const pdfPath = await buildComicPdf({
    jobId,
    panelsDir,
    outputDir,
    panelsPerPage: data.panelsPerPage,
    panelCount: panels.length,
  });

  updateJob(jobId, {
    status: 'completed',
    progress: 100,
    stage: 'completed',
    result: {
      previewUrl: `/api/comic/${jobId}/preview`,
      downloadUrl: `/api/comic/${jobId}/download`,
      summary,
      panels,
    } satisfies ComicJobResult,
  });

  scheduleCleanup(jobId, {
    pdfPath,
    comicDir,
    uploadFilePath: data.filePath,
  });
};

const scheduleCleanup = (
  jobId: string,
  opts: { pdfPath: string; comicDir: string; uploadFilePath?: string }
) => {
  setTimeout(async () => {
    try {
      if (opts.uploadFilePath && fs.existsSync(opts.uploadFilePath)) {
        await fs.promises.unlink(opts.uploadFilePath);
      }
      if (fs.existsSync(opts.pdfPath)) {
        await fs.promises.unlink(opts.pdfPath);
      }
      if (fs.existsSync(opts.comicDir)) {
        await fs.promises.rm(opts.comicDir, { recursive: true, force: true });
      }
      console.log(`Cleaned up comic job ${jobId}`);
    } catch (error) {
      console.error(`Cleanup failed for comic job ${jobId}:`, error);
    }
  }, CLEANUP_TIMEOUT);
};

const getStoryText = async (data: ComicJobData): Promise<string> => {
  if (data.storyText && data.storyText.trim().length) return data.storyText;

  if (data.inputType === 'pdf') {
    if (!data.filePath) throw new Error('Missing PDF file');
    const buffer = await fs.promises.readFile(data.filePath);
    return extractTextFromPdf(buffer);
  }

  throw new Error('Missing story text');
};

const cleanText = (text: string) => text.trim().replace(/\s+/g, ' ');

const countWords = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};

const withRetry = async <T>(
  fn: () => Promise<T>,
  opts: { retries: number; baseDelayMs: number }
): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= opts.retries) break;
      const delay = opts.baseDelayMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Operation failed');
};

const analyzeStory = async (
  storyText: string,
  panelCount: number
): Promise<{ summary: string }> => {
  const openai = getOpenAI();

  const prompt = `Analyze the following story and extract the key story beats.

Requirements:
- Return a concise summary in English.
- Include: main characters, setting, central conflict, and a beat-by-beat outline suitable for a ${panelCount}-panel comic.
- Keep it PG-16 / mature but non-explicit.

Story:
${storyText}

Return plain text summary (no markdown).`;

  const completion = await withRetry(
    () =>
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a professional story editor who extracts clear beats for comic adaptation.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 900,
      }),
    { retries: 2, baseDelayMs: 800 }
  );

  const summary = completion.choices[0]?.message?.content?.trim();
  if (!summary) {
    throw new Error('OpenAI returned empty summary for story analysis');
  }
  
  return {
    summary,
  };
};

const generateScript = async (opts: {
  storyText: string;
  summary: string;
  visualStyle: ComicVisualStyle;
  panelCount: number;
}): Promise<{ scenes: Scene[]; warnings?: string[] }> => {
  const openai = getOpenAI();

  const prompt = `Create a comic script from this story.

Constraints:
- Create exactly ${opts.panelCount} scenes/panels.
- Each panel must have:
  1) title (optional)
  2) visual: a vivid visual description for an illustrator (English)
  3) dialogue_telugu: short Telugu dialogue for a speech bubble (max ~20 words), mature but non-explicit.
- Output MUST be valid JSON with this exact shape:
  {"scenes":[{"title":"...","visual":"...","dialogue_telugu":"..."}]}
- No markdown, no code fences.
- Ensure there is NO explicit sexual content.

Story summary:
${opts.summary}

Full story (for nuance):
${opts.storyText}`;

  const completion = await withRetry(
    () =>
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You write clear, cinematic comic scripts with safe mature tone and concise Telugu dialogue.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.6,
        max_tokens: 1400,
      }),
    { retries: 2, baseDelayMs: 1000 }
  );

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('OpenAI returned empty content for script generation');
  }
  
  const parsed = parseJsonFromModel(content) as { scenes?: unknown[] } | null;

  if (!parsed || !Array.isArray(parsed.scenes)) {
    throw new Error('Failed to parse JSON from OpenAI response for script generation');
  }

  const scenes = parsed.scenes
    .filter((s: unknown): s is SceneJSON => {
      const scene = s as SceneJSON;
      return typeof scene?.visual === 'string' && typeof scene?.dialogue_telugu === 'string';
    })
    .slice(0, opts.panelCount)
    .map((s) => ({
      title: typeof s.title === 'string' ? s.title : undefined,
      visual: s.visual.trim(),
      dialogue_telugu: s.dialogue_telugu.trim(),
    }));

  if (scenes.length !== opts.panelCount) {
    throw new Error(`OpenAI returned ${scenes.length} scenes instead of requested ${opts.panelCount} scenes`);
  }

  return { scenes };
};

const parseJsonFromModel = (text: string): unknown => {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) return null;

  try {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  } catch {
    return null;
  }
};

const buildImagePrompt = (sceneVisual: string, style: ComicVisualStyle): string => {
  const stylePrompt: Record<ComicVisualStyle, string> = {
    manga:
      'Japanese manga style, dynamic composition, screentone shading, crisp ink lines, high contrast',
    'indian-comic':
      'Indian comic book art style, vibrant colors, bold outlines, expressive faces, dramatic lighting',
    cinematic:
      'cinematic storyboard frame, realistic lighting, film still composition, high detail, dramatic mood',
    watercolor:
      'watercolor illustration, soft washes, painterly texture, gentle gradients, detailed characters',
    noir:
      'noir comic style, high contrast chiaroscuro, gritty atmosphere, moody shadows, rain and neon',
  };

  return `${stylePrompt[style]}. Single comic panel. 16:9 wide shot. ${sceneVisual}. No text, no captions, no watermarks.`;
};

const generatePanelImage = async (opts: {
  index: number;
  panelsDir: string;
  imagePrompt: string;
  dialogueTelugu: string;
}): Promise<{ finalImagePath: string; replicateUrl: string }> => {
  const replicate = getReplicate();

  const baseName = `panel-${String(opts.index).padStart(3, '0')}`;
  const rawImagePath = path.join(opts.panelsDir, `${baseName}.raw.png`);
  const finalImagePath = path.join(opts.panelsDir, `${baseName}.png`);

  // Always use Replicate FLUX.1 Schnell - no fallbacks allowed
  const output = await withRetry(
    () =>
      replicate.run('black-forest-labs/flux-schnell', {
        input: {
          prompt: opts.imagePrompt,
          aspect_ratio: '16:9',
          output_format: 'png',
          output_quality: 90,
          num_outputs: 1,
        },
      }) as Promise<unknown>,
    { retries: 2, baseDelayMs: 1200 }
  );

  const replicateUrl = normalizeReplicateOutputUrl(output);
  if (!replicateUrl) {
    throw new Error('Replicate returned no image URL');
  }

  const imageBuffer = await downloadToBuffer(replicateUrl);

  // Normalize to 1280x720
  const resized = await sharp(imageBuffer)
    .resize(1280, 720, { fit: 'cover' })
    .png()
    .toBuffer();

  await fs.promises.writeFile(rawImagePath, resized);

  const withBubble = await overlaySpeechBubble(resized, opts.dialogueTelugu);
  await fs.promises.writeFile(finalImagePath, withBubble);

  return { finalImagePath, replicateUrl };
};

const normalizeReplicateOutputUrl = (output: unknown): string | undefined => {
  if (!output) return undefined;
  if (typeof output === 'string') return output;
  if (Array.isArray(output) && typeof output[0] === 'string') return output[0];
  const outObj = output as Record<string, unknown>;
  if (typeof outObj.url === 'string') return outObj.url;
  if (Array.isArray(outObj.output) && typeof outObj.output[0] === 'string') return outObj.output[0];
  return undefined;
};

const downloadToBuffer = async (url: string): Promise<Buffer> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
};

const overlaySpeechBubble = async (imageBuffer: Buffer, dialogueTelugu: string): Promise<Buffer> => {
  const img = sharp(imageBuffer);
  const meta = await img.metadata();
  const width = meta.width ?? 1280;
  const height = meta.height ?? 720;

  const margin = Math.floor(width * 0.04);
  const bubbleWidth = width - margin * 2;
  const bubbleHeight = Math.floor(height * 0.26);
  const bubbleTop = height - bubbleHeight - margin;

  const lines = wrapDialogue(dialogueTelugu, 22);
  const fontSize = Math.max(28, Math.min(44, Math.floor(bubbleHeight / (lines.length + 2))));

  const textYStart = Math.floor(bubbleHeight / 2 - (lines.length * fontSize) / 2 + fontSize * 0.2);

  const tspans = lines
    .map((line, idx) => {
      const dy = idx === 0 ? 0 : fontSize * 1.15;
      const escaped = escapeForSvg(line);
      return `<tspan x="${bubbleWidth / 2}" dy="${dy}">${escaped}</tspan>`;
    })
    .join('');

  const svg = Buffer.from(`
<svg width="${bubbleWidth}" height="${bubbleHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.35)"/>
    </filter>
  </defs>
  <rect x="0" y="0" rx="26" ry="26" width="${bubbleWidth}" height="${bubbleHeight}" fill="white" stroke="black" stroke-width="4" filter="url(#shadow)" />
  <path d="M ${bubbleWidth * 0.22} ${bubbleHeight} C ${bubbleWidth * 0.20} ${bubbleHeight * 0.92}, ${bubbleWidth * 0.19} ${bubbleHeight * 0.84}, ${bubbleWidth * 0.16} ${bubbleHeight * 0.78} C ${bubbleWidth * 0.21} ${bubbleHeight * 0.82}, ${bubbleWidth * 0.27} ${bubbleHeight * 0.84}, ${bubbleWidth * 0.30} ${bubbleHeight * 0.86} Z" fill="white" stroke="black" stroke-width="4"/>
  <text x="${bubbleWidth / 2}" y="${textYStart}" font-size="${fontSize}" text-anchor="middle" font-family="Noto Sans Telugu, sans-serif" fill="black">
    ${tspans}
  </text>
</svg>`);

  return img
    .composite([
      {
        input: svg,
        top: bubbleTop,
        left: margin,
      },
    ])
    .png()
    .toBuffer();
};

const wrapDialogue = (text: string, maxCharsPerLine: number): string[] => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxCharsPerLine) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
};

const escapeForSvg = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const buildComicPdf = async (opts: {
  jobId: string;
  panelsDir: string;
  outputDir: string;
  panelsPerPage: 2 | 4 | 6;
  panelCount: number;
}): Promise<string> => {
  const pdfPath = path.join(opts.outputDir, `${opts.jobId}-comic.pdf`);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // A4 portrait in points
  const pageWidth = 595.28;
  const pageHeight = 841.89;

  const margin = 36;
  const gutter = 14;

  const columns = 2;
  const rows = opts.panelsPerPage / 2;

  const cellWidth = (pageWidth - margin * 2 - gutter) / columns;
  const cellHeight = (pageHeight - margin * 2 - gutter * (rows - 1) - 30) / rows;

  const panelFiles = await listPanelPngs(opts.panelsDir);
  const panelPaths = panelFiles.slice(0, opts.panelCount);

  let pageIndex = 0;
  for (let i = 0; i < panelPaths.length; i += opts.panelsPerPage) {
    pageIndex++;
    const page = pdfDoc.addPage([pageWidth, pageHeight]);

    const batch = panelPaths.slice(i, i + opts.panelsPerPage);
    for (let j = 0; j < batch.length; j++) {
      const col = j % columns;
      const row = Math.floor(j / columns);

      const x = margin + col * (cellWidth + gutter);
      const yTop = pageHeight - margin - row * (cellHeight + gutter);
      const y = yTop - cellHeight;

      const bytes = await fs.promises.readFile(batch[j]);
      const img = await pdfDoc.embedPng(bytes);

      const scale = Math.min(cellWidth / img.width, cellHeight / img.height);
      const drawWidth = img.width * scale;
      const drawHeight = img.height * scale;

      const dx = x + (cellWidth - drawWidth) / 2;
      const dy = y + (cellHeight - drawHeight) / 2;

      page.drawRectangle({
        x,
        y,
        width: cellWidth,
        height: cellHeight,
        borderWidth: 1,
        borderColor: rgb(0, 0, 0),
        color: rgb(1, 1, 1),
        opacity: 0,
      });

      page.drawImage(img, {
        x: dx,
        y: dy,
        width: drawWidth,
        height: drawHeight,
      });
    }

    const pageNumberText = `${pageIndex}`;
    page.drawText(pageNumberText, {
      x: pageWidth - margin - font.widthOfTextAtSize(pageNumberText, 10),
      y: 14,
      size: 10,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  const pdfBytes = await pdfDoc.save();
  await fs.promises.writeFile(pdfPath, pdfBytes);

  return pdfPath;
};

const listPanelPngs = async (panelsDir: string): Promise<string[]> => {
  const entries = await fs.promises.readdir(panelsDir);
  return entries
    .filter((f) => f.endsWith('.png') && !f.endsWith('.raw.png'))
    .sort()
    .map((f) => path.join(panelsDir, f));
};
