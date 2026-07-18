import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // the Anthropic SDK needs Node APIs
export const maxDuration = 60;

// The customer brings their own Anthropic API key (BYO-key), so cost and terms
// sit with them — same model as the Google key. Model is overridable per
// deployment; default to Opus 4.8. For a cheaper draft, set OUTREACH_MODEL to
// claude-haiku-4-5.
const MODEL = process.env.OUTREACH_MODEL || "claude-opus-4-8";

type Lead = {
  company?: string;
  category?: string;
  city?: string;
  country?: string;
  segment?: string;
};
type Profile = { product?: string; sender?: string; tone?: string };

/**
 * POST /api/outreach  body { lead, profile, channel, language }
 *
 * Drafts a short, personalized first-contact message for one lead using the
 * customer's own Anthropic key. Returns { draft }. Nothing is stored — the
 * salesperson reviews, edits, and sends it themselves.
 */
export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set on the server. Add it to enable AI outreach." },
      { status: 400 }
    );
  }

  let body: { lead?: Lead; profile?: Profile; channel?: string; language?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const lead = body.lead ?? {};
  const profile = body.profile ?? {};
  const channel = body.channel === "whatsapp" ? "whatsapp" : "email";
  const language = (body.language || "English").trim();

  if (!profile.product || !profile.product.trim()) {
    return NextResponse.json(
      { error: "Add what you sell (your pitch) first so the draft can be tailored." },
      { status: 400 }
    );
  }

  const system =
    `You write concise, professional B2B cold-outreach messages for a salesperson to send. ` +
    `Write in ${language}. ` +
    (channel === "whatsapp"
      ? `Channel: WhatsApp — 3–4 short sentences, friendly but professional, no subject line. `
      : `Channel: email — a "Subject: ..." line first, then 2–3 short paragraphs. `) +
    `Tone: ${profile.tone || "professional and warm"}. ` +
    `Personalize using only the lead details provided; do not invent facts about them. ` +
    `Keep it under ~120 words with one clear, low-friction call to action (a short reply or call). ` +
    `Return ONLY the message, ready to send — no preamble, no explanation, no notes.`;

  const userContent =
    `Draft outreach to this business:\n` +
    `- Company: ${lead.company || "(unknown)"}\n` +
    (lead.category ? `- Category: ${lead.category}\n` : "") +
    (lead.segment ? `- Segment/tags: ${lead.segment}\n` : "") +
    `- Location: ${[lead.city, lead.country].filter(Boolean).join(", ") || "(unknown)"}\n\n` +
    `From:\n` +
    (profile.sender ? `- Sender: ${profile.sender}\n` : "") +
    `- What we offer / pitch: ${profile.product}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: userContent }],
    });
    const draft = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return NextResponse.json({ draft });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "The Anthropic API key was rejected." }, { status: 400 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited by Anthropic — try again in a moment." }, { status: 429 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not draft the message." },
      { status: 502 }
    );
  }
}
