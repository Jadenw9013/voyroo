import { MAX_SPEECH_TEXT } from "@/domain/readAloud";
import { jsonError, rateLimit, readJson, requireSession } from "@/server/http";

export const maxDuration = 60;
const MAX_WAV_BYTES = 4_000_000;
const unavailable = () => jsonError(503, "The assistant voice is unavailable.");

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  const auth = await requireSession(request, tripId);
  if (!auth.ok) return auth.res;
  const parsed = await readJson(request, MAX_SPEECH_TEXT * 6 + 32);
  if (!parsed.ok) return parsed.res;
  const text = typeof parsed.body.text === "string" ? parsed.body.text.trim() : "";
  if (!text || text.length > MAX_SPEECH_TEXT) return jsonError(400, "Choose a short answer to read aloud.");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return unavailable();
  const limited = await rateLimit(request, "assistant-speech", 20, 3600);
  if (limited) return limited;

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]),
      body: JSON.stringify({
        model: "gemini-3.8-flash-tts",
        store: false,
        input: [{
          type: "user_input",
          content: [{
            type: "text", text,
            annotations: [{ type: "speech_metadata", style: "Warm, conversational travel guide. Speak clearly at a relaxed pace with natural pauses." }],
          }],
        }],
        response_format: { type: "audio", mime_type: "audio/wav" },
        generation_config: { speech_config: [{ voice: "Sulafat" }] },
      }),
    });
    if (!response.ok) return unavailable();
    const result: { steps?: { type: string; content?: { type: string; data?: string }[] }[] } = await response.json();
    const encoded = result.steps?.findLast((step) => step.type === "model_output")
      ?.content?.findLast((part) => part.type === "audio")?.data;
    if (typeof encoded !== "string" || encoded.length > Math.ceil(MAX_WAV_BYTES / 3) * 4) return unavailable();
    const wav = Buffer.from(encoded, "base64");
    if (wav.length <= 44 || wav.length > MAX_WAV_BYTES || wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") return unavailable();
    return new Response(new Uint8Array(wav), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, no-store" } });
  } catch {
    return unavailable();
  }
}
