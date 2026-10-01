import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // the Anthropic SDK needs Node APIs
export const maxDuration = 60; // web search + reasoning can take a few seconds

// Customer brings their own Anthropic key (BYO-key), same as outreach. Default to
// the cheapest model (Haiku 4.5) so an assessment costs a fraction of a cent;
// overridable per deployment via ASSESS_MODEL. Haiku 4.5 supports the basic
// web_search tool variant (the dynamic-filtering variant needs a bigger model).
const MODEL = process.env.ASSESS_MODEL || "claude-haiku-4-5";

type Verdict = "fit" | "maybe" | "no";

/**
 * POST /api/prospects/assess
 *   body { company, category?, city?, country?, website?, product?, keywords? }
 *
 * Uses Claude with web search to research a company and judge whether it's a
 * good prospect — even when its own website blocks automated reads, because web
 * search uses directories / listings / news rather than the blocked page.
 * Returns { verdict, score, summary }. Nothing is stored; the user decides.
 */
export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server. Add it to enable AI assess." },
      { status: 400 }
    );
  }

  let body: {
    company?: string;
    category?: string;
    city?: string;
    country?: string;
    website?: string;
    product?: string;
    keywords?: string[];
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const company = (body.company ?? "").trim();
  if (!company) {
    return NextResponse.json({ error: "Company name is required to research." }, { status: 400 });
  }
  const where = [body.city, body.country].filter(Boolean).join(", ");
  const product = (body.product ?? "").trim();
  const keywords = (body.keywords ?? []).filter(Boolean).join(", ");

  const system =
    `You are a B2B sales-research assistant. Decide whether a business is a good PROSPECT ` +
    `for the seller — i.e. it would buy, resell, distribute, install, or specify the seller's product. ` +
    `Use web search to find what the company actually does (their site may block direct reading, so ` +
    `rely on directories, listings, social pages and news). Do NOT invent facts; if you can't find ` +
    `enough, say so and score low-to-mid. ` +
    `Respond with ONLY a JSON object, no other text, in exactly this shape: ` +
    `{"verdict": "fit" | "maybe" | "no", "score": <integer 0-100>, "summary": "<one or two sentences on what they do and why they do/don't fit>"}.`;

  const sellerLine = product
    ? `The seller offers: ${product}.`
    : `The seller sells ${keywords || "fire-rated / steel / security doors"} and wants buyers, resellers, distributors, contractors or specifiers of such products.`;

  const userContent =
    `${sellerLine}\n\n` +
    `Assess this business as a prospect:\n` +
    `- Company: ${company}\n` +
    (body.category ? `- Google category: ${body.category}\n` : "") +
    (where ? `- Location: ${where}\n` : "") +
    (body.website ? `- Website: ${body.website}\n` : "") +
    (keywords ? `- Seller's target keywords: ${keywords}\n` : "") +
    `\nResearch them, then return the JSON verdict.`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: userContent }],
      // Server-side web search, bounded so cost stays small and predictable.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const match = text.match(/\{[\s\S]*\}/);
    let verdict: Verdict = "maybe";
    let score = 50;
    let summary = text.trim().slice(0, 400);
    if (match) {
      try {
        const p = JSON.parse(match[0]) as { verdict?: string; score?: number; summary?: string };
        if (p.verdict === "fit" || p.verdict === "maybe" || p.verdict === "no") verdict = p.verdict;
        if (typeof p.score === "number" && isFinite(p.score)) score = Math.max(0, Math.min(100, Math.round(p.score)));
        if (typeof p.summary === "string" && p.summary.trim()) summary = p.summary.trim();
      } catch {
        // fall through with defaults + raw text summary
      }
    }

    return NextResponse.json({ verdict, score, summary });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "The Anthropic API key was rejected." }, { status: 400 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited by Anthropic — try again in a moment." }, { status: 429 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not assess this lead." },
      { status: 502 }
    );
  }
}
