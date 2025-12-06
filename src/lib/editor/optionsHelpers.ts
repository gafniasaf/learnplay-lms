/* eslint-disable @typescript-eslint/no-explicit-any */
import { rewriteText, generateMedia } from '@/lib/api/aiRewrites';

export function buildOptionImagePrompt(course: any, item: any, optionText: string, role: 'correct answer' | 'distractor') {
  const subj = (course as any)?.subject || course?.title || 'General';
  const stemPlain = String((item as any)?.stem?.text || (item as any)?.text || '').replace(/<[^>]*>/g, '').replace(/\[blank\]/gi, '___').slice(0, 140);
  const optionPlain = String(optionText).replace(/<[^>]*>/g, '').slice(0, 100);
  const allOptions = Array.isArray(item?.options) ? item.options.slice(0, 4).map((o: any) => typeof o === 'string' ? o : o?.text || '').filter(Boolean) : [];
  const otherOptions = allOptions.filter(o => o !== optionText).join(', ');
  
  return [
    `Learning visual for ${subj}.`,
    `Question: ${stemPlain}`,
    `This answer choice: ${optionPlain}.`,
    otherOptions ? `Other choices: ${otherOptions}.` : '',
    `Create a simple photo or realistic illustration representing this concept.`,
    `IMPORTANT: Absolutely no text, letters, words, labels, numbers, or written language anywhere in the image.`,
    `No diagrams, charts, or infographics. Just a clean visual representation.`,
    `Original artwork only - no copyrighted characters or brands.`,
    `Colorful, friendly, child-appropriate educational style.`,
  ].filter(Boolean).join(' ');
}

export async function generateOptionImagePrompted(args: { course: any; item: any; optionText: string; isCorrect: boolean; }) {
  const prompt = buildOptionImagePrompt(args.course, args.item, args.optionText, args.isCorrect ? 'correct answer' : 'distractor');
  // Use 16:9 aspect ratio at 1024x576 for faster loading (reduced from 1792x1024)
  const res = await generateMedia({ prompt, kind: 'image', options: { aspectRatio: '16:9', size: '1024x1024', quality: 'standard' } });
  return res as { url: string; alt?: string; width?: number; height?: number };
}

export async function generateAltForOption(args: { course: any; item: any; optionText: string; }) {
  const subj = (args.course as any)?.subject || args.course?.title || 'General';
  const gradeBand = (args.course as any)?.gradeBand || '';
  const stemPlain = String((args.item as any)?.stem?.text || (args.item as any)?.text || '').replace(/<[^>]*>/g,'');
  const guidance = 'Generate a single concise descriptive alt text (<= 100 chars) for the option image in this context. No HTML.';
  const res = await rewriteText({
    segmentType: 'option',
    currentText: String(args.optionText).replace(/<[^>]*>/g,''),
    context: {
      subject: subj,
      difficulty: 'intermediate',
      course: { title: args.course?.title, subject: (args.course as any)?.subject, gradeBand },
      stem: stemPlain,
      guidance,
    },
    candidateCount: 1,
  });
  const html = res.candidates?.[0]?.text || '';
  const generatedAlt = html.replace(/<[^>]*>/g,'').trim().slice(0, 120);
  return generatedAlt;
}
