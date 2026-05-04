import { Router, type IRouter } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const CROPS = ["Mango", "Dragon Fruit", "Chikoo", "Pomegranate", "Mulberry"] as const;

// POST /api/farms/:id/detect-crop
// Body: { imageBase64: string }  (data URI: "data:image/jpeg;base64,...")
router.post("/farms/:id/detect-crop", async (req, res): Promise<void> => {
  const { imageBase64 } = req.body as { imageBase64?: string };

  if (!imageBase64?.startsWith("data:image/")) {
    res.status(400).json({ error: "imageBase64 must be a valid data URI (data:image/...;base64,...)" });
    return;
  }

  logger.info("Running crop detection from uploaded photo");

  const systemPrompt = `You are an expert Indian horticulturalist specializing in identifying crops from photos.
You ONLY recognize these five crops: Mango, Dragon Fruit, Chikoo (Sapodilla), Pomegranate, Mulberry.
Respond ONLY with a JSON object — no markdown.

Required schema:
{
  "detected": true | false,
  "crop": "Mango" | "Dragon Fruit" | "Chikoo" | "Pomegranate" | "Mulberry" | null,
  "confidence": number between 0.0 and 1.0,
  "reason": "short explanation of visual cues used for identification",
  "visualCues": ["cue1", "cue2", "cue3"],
  "alternativeCrop": "Mango" | "Dragon Fruit" | "Chikoo" | "Pomegranate" | "Mulberry" | null,
  "alternativeConfidence": number between 0.0 and 1.0 | null,
  "cropPhase": "Seedling" | "Vegetative" | "Flowering" | "Fruiting" | "Mature" | "Unknown",
  "visibleCondition": "Healthy" | "Stressed" | "Diseased" | "Unknown",
  "conditionNotes": "brief notes on the visible condition of the plant"
}

If the photo is unclear, not a plant, or not one of the five crops, set detected=false, crop=null, confidence=0.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 512,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Identify the crop in this photo. Respond with JSON only." },
          { type: "image_url", image_url: { url: imageBase64, detail: "high" } },
        ],
      },
    ],
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match ? match[0] : raw);
  } catch {
    res.status(500).json({ error: "Failed to parse AI response", raw });
    return;
  }

  const crop = CROPS.includes(parsed.crop as typeof CROPS[number]) ? parsed.crop : null;
  const altCrop = CROPS.includes(parsed.alternativeCrop as typeof CROPS[number]) ? parsed.alternativeCrop : null;

  res.json({
    detected:              crop !== null,
    crop,
    confidence:            typeof parsed.confidence === "number" ? Math.round(parsed.confidence * 100) / 100 : 0,
    reason:                typeof parsed.reason === "string" ? parsed.reason : "",
    visualCues:            Array.isArray(parsed.visualCues) ? parsed.visualCues : [],
    alternativeCrop:       altCrop ?? null,
    alternativeConfidence: typeof parsed.alternativeConfidence === "number" ? parsed.alternativeConfidence : null,
    cropPhase:             typeof parsed.cropPhase === "string" ? parsed.cropPhase : "Unknown",
    visibleCondition:      typeof parsed.visibleCondition === "string" ? parsed.visibleCondition : "Unknown",
    conditionNotes:        typeof parsed.conditionNotes === "string" ? parsed.conditionNotes : "",
  });
});

export default router;
