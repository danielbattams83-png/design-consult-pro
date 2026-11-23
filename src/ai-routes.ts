import type { Express } from 'express';
import { GoogleGenAI, Type } from '@google/genai';

const MISSING_KEY = 'SITE_MEASURE_KEY is missing in server environment';

function geminiError(err: unknown): string {
  console.error('[Gemini AI Error]', err);
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string' && err.message) {
    return err.message;
  }
  return 'Unknown server error';
}

function stripDataUrl(value: string): string {
  if (!value.startsWith('data:')) return value;
  const marker = ';base64,';
  const markerAt = value.indexOf(marker);
  if (markerAt !== -1) return value.slice(markerAt + marker.length);
  const commaAt = value.indexOf(',');
  return commaAt !== -1 ? value.slice(commaAt + 1) : value;
}


// Lazy Google GenAI Client
let genAiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env['SITE_MEASURE_KEY'] || process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    return null;
  }
  if (!genAiClient) {
    genAiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAiClient;
}


export function registerAiRoutes(app: Express): void {
/**
 * AI Proposal & Material Takeoff Generator API
 */
app.post('/api/ai/generate-brief', async (req, res) => {
  try {
    const projectData = req.body;
    const ai = getGenAI();

    if (!ai) {
      return res.json({ success: false, error: MISSING_KEY });
    }

    const prompt = `You are a licensed Senior Interior Architect and Site Survey Consultant analyzing an on-site field survey and room measurements.
Here is the project data:
${JSON.stringify(projectData, null, 2)}

Provide a comprehensive, high-standard professional design consultation report, material takeoff, and contractor risk analysis.
Return JSON adhering strictly to the schema provided.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            executiveSummary: {
              type: Type.STRING,
              description: 'Clear, elegant executive overview of client vision, lifestyle needs, and architectural opportunities.',
            },
            designConcept: {
              type: Type.STRING,
              description: 'Synthesized design aesthetic, architectural direction, lighting strategy, and texture pairings.',
            },
            paletteSuggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  hex: { type: Type.STRING },
                  role: { type: Type.STRING },
                  finish: { type: Type.STRING },
                },
                required: ['name', 'hex', 'role', 'finish'],
              },
            },
            materialTakeoffs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  room: { type: Type.STRING },
                  item: { type: Type.STRING },
                  estimatedQuantity: { type: Type.STRING },
                  unit: { type: Type.STRING },
                  calculationBasis: { type: Type.STRING },
                  wasteAllowance: { type: Type.STRING },
                },
                required: ['room', 'item', 'estimatedQuantity', 'unit', 'calculationBasis', 'wasteAllowance'],
              },
            },
            contractorRiskAlerts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Specific technical or structural flags based on room squareness, subfloor, plumbing, or lighting.',
            },
            phasePlan: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Actionable steps for closing survey, drafting CAD, and contractor trade bidding.',
            },
          },
          required: [
            'executiveSummary',
            'designConcept',
            'paletteSuggestions',
            'materialTakeoffs',
            'contractorRiskAlerts',
            'phasePlan',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, brief: parsed, isFallback: false });
  } catch (error: unknown) {
    console.error('Error generating AI brief:', error);
    return res.json({ success: false, error: geminiError(error) });
  }
});

/**
 * On-site Quick Q&A Advice API
 */
app.post('/api/ai/consult-qa', async (req, res) => {
  try {
    const { question, context } = req.body;
    const ai = getGenAI();

    if (!ai) {
      return res.json({ success: false, error: MISSING_KEY });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are an expert Interior Architect and Field Superintendent advising a designer on-site.
Context of active project & room measurements:
${JSON.stringify(context || {}, null, 2)}

Question from designer on-site:
"${question}"

Provide concise, precise architectural, building code, clearances (ADA/NKBA), and structural advice in 2-3 short, clear paragraphs with bulleted clearance rules.`,
    });

    return res.json({ success: true, answer: response.text });
  } catch (error: unknown) {
    console.error('Error in consult Q&A:', error);
    return res.json({ success: false, error: geminiError(error) });
  }
});

/**
 * Transcribe Audio Voice Note API
 */
app.post('/api/ai/transcribe-note', async (req, res) => {
  try {
    const { audioBase64, mimeType = 'audio/webm', projectName = '', roomName = '' } = req.body ?? {};
    const ai = getGenAI();
    const cleanBase64 = stripDataUrl(typeof audioBase64 === 'string' ? audioBase64 : '');

    if (!ai) {
      return res.json({ success: false, error: MISSING_KEY });
    }
    if (!cleanBase64) {
      return res.json({ success: false, error: 'No audio or image data was received.' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'audio/webm',
              data: cleanBase64,
            },
          },
          {
            text: `You are an Australian architectural designer's field transcriptionist working on Queensland residential and small-commercial sites.
Project: ${projectName || 'Untitled project'}
Room: ${roomName || 'Unspecified room'}
Transcribe the walkthrough verbatim.
- Keep every spoken dimension. Write millimetres as mm and metres as m (for example "three six five oh" as 3650 mm, "two point four metres" as 2.4 m).
- Preserve any spoken or embedded timestamp tags exactly, including the form [MM:SS - TAG].
- Spell Australian and Queensland construction terms correctly when they are said: soffit, eaves, ridge beam, raked ceiling, nib wall, load-bearing, damp proof course, BAL rating, setback, joinery, wet area, fall, cyclonic tie-down, boundary clearance.
Do not invent measurements, rooms, or site conditions that were not spoken.`,
          },
        ],
      },
    });

    const transcription = (response.text || '').trim();
    if (!transcription) {
      return res.json({ success: false, error: 'Gemini returned an empty transcription.' });
    }
    return res.json({ success: true, transcription });
  } catch (error: unknown) {
    console.error('Error transcribing audio:', error);
    return res.json({ success: false, error: geminiError(error) });
  }
});

/**
 * AI Meeting Summary Generator API
 */
app.post('/api/ai/meeting-summary', async (req, res) => {
  try {
    const { project, notes, voiceTranscripts } = req.body;
    const ai = getGenAI();

    if (!ai) {
      return res.json({ success: false, error: MISSING_KEY });
    }

    const rooms = Array.isArray(project?.rooms) ? project.rooms : [];
    const unit = project?.rooms?.[0]?.dimensions?.unit === 'metric' ? 'metric' : 'imperial';
    const roomSchedule = rooms
      .map((room: {
        name?: string;
        level?: string;
        dimensions?: { ceilingHeightFt?: number; calculatedFloorArea?: number; walls?: { name?: string; lengthFt?: number }[] };
        conditions?: unknown;
        openings?: { type?: string; widthInches?: number; heightInches?: number; wallName?: string }[];
      }) => {
        const walls = (room.dimensions?.walls || [])
          .map((wall) => `${wall.name || 'Wall'}: ${wall.lengthFt}`)
          .join('; ');
        const openings = (room.openings || [])
          .map((opening) => `${opening.type || 'opening'} ${opening.widthInches} x ${opening.heightInches} on ${opening.wallName || 'wall'}`)
          .join('; ');
        return [
          `Room: ${room.name || 'Room'} (${room.level || 'level unknown'})`,
          `Stored unit: ${unit} (metric lengths are mm, metric areas are m², metric ceiling height is mm; imperial lengths are feet)`,
          `Ceiling: ${room.dimensions?.ceilingHeightFt ?? 'unknown'}`,
          `Floor area: ${room.dimensions?.calculatedFloorArea ?? 'unknown'}`,
          `Walls: ${walls || 'none recorded'}`,
          `Openings: ${openings || 'none recorded'}`,
          `Site conditions: ${JSON.stringify(room.conditions || {})}`,
        ].join('\n');
      })
      .join('\n\n');

    const prompt = `You are an Australian architectural designer writing a Concept Design Brief after a Queensland site walkthrough.
Project: ${project?.name || 'Site Project'}
Client: ${project?.clientName || 'Private Client'}
Address: ${project?.siteAddress || 'Site address not recorded'}
Styles: ${(project?.survey?.selectedStyles || []).join(', ') || 'not recorded'}
Client notes: ${project?.survey?.clientGeneralNotes || notes || 'none'}
Action items: ${JSON.stringify(project?.actionItems || [])}

Room schedules, ceiling heights, and site conditions:
${roomSchedule || 'No rooms recorded'}

Field notes:
${notes || 'None'}

Voice transcripts (keep [MM:SS - TAG] markers if present):
${voiceTranscripts?.length ? voiceTranscripts.join('\n') : 'None'}

Write a structured Markdown Concept Design Brief and use these headings exactly:
## Client Brief & Spatial Goals
## Site, Structural & Service Constraints
## Architectural Concept Ideas & Solutions
## Follow-Up & Missing Site Checks

Present dimensions in mm and areas in m². If the stored unit is imperial, convert feet to mm (× 304.8) and square feet to m² (× 0.092903). Use Australian terminology where the notes support it: soffit, eaves, ridge beam, raked ceiling, nib wall, load-bearing, damp proof course, BAL rating, setback, joinery, wet area, fall, cyclonic tie-down, boundary clearance.
Do not invent site facts that are not in the schedules, notes, or transcripts. Put unknowns under Follow-Up & Missing Site Checks.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const summary = (response.text || '').trim();
    if (!summary) {
      return res.json({ success: false, error: 'Gemini returned an empty meeting summary.' });
    }
    return res.json({ success: true, summary });
  } catch (error: unknown) {
    console.error('Error generating meeting summary:', error);
    return res.json({ success: false, error: geminiError(error) });
  }
});

/**
 * AI Photo & Blueprint OCR Extraction API
 */
app.post('/api/ai/extract-ocr', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    const ai = getGenAI();

    const cleanBase64 = stripDataUrl(typeof imageBase64 === 'string' ? imageBase64 : '');
    if (!ai) {
      return res.json({ success: false, error: MISSING_KEY });
    }
    if (!cleanBase64) {
      return res.json({ success: false, error: 'No audio or image data was received.' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType || 'image/jpeg',
              data: cleanBase64,
            },
          },
          {
            text: `Analyze this on-site construction/interior photo or architectural plan sheet.
Extract all visible:
1. Room dimensions, measurements, and structural callouts
2. Electrical panel ratings, breakers, switch types
3. Appliance/HVAC model numbers or mechanical tags
4. Material labels, paint codes, fixture notes
5. Structural condition notes (cracking, moisture stains, out-of-plumb indicators)

Format clearly with bulleted items and high-signal architectural labels.`,
          },
        ],
      },
    });

    const extractedText = (response.text || '').trim();
    if (!extractedText) {
      return res.json({ success: false, error: 'Gemini returned an empty OCR result.' });
    }
    return res.json({
      success: true,
      extractedText,
      tags: ['OCR Extracted', 'Site Scan'],
    });
  } catch (error: unknown) {
    console.error('Error in OCR extraction:', error);
    return res.json({ success: false, error: geminiError(error) });
  }
});

/**
 * On-site photo critique for spatial, daylight, and structural ideas.
 */
app.post('/api/ai/site-photo-critique', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', question = '', roomContext = '' } = req.body ?? {};
    const ai = getGenAI();
    const cleanBase64 = stripDataUrl(typeof imageBase64 === 'string' ? imageBase64 : '');
    if (!ai) {
      return res.json({ success: false, error: MISSING_KEY });
    }
    if (!cleanBase64) {
      return res.json({ success: false, error: 'No audio or image data was received.' });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType || 'image/jpeg', data: cleanBase64 } },
          {
            text: `You are an Australian architectural designer looking at one site photograph.
Room context: ${roomContext || 'Not provided'}
Question: ${question || 'What spatial, daylighting, or structural layout ideas does this photo suggest?'}
Reply in short Markdown with practical observations about space, daylight, structure, and wet-area or setback issues only if the photo supports them.
Do not invent dimensions that are not visible. Flag anything that still needs a tape or laser check.`,
          },
        ],
      },
    });

    const critique = (response.text || '').trim();
    if (!critique) {
      return res.json({ success: false, error: 'Gemini returned an empty photo critique.' });
    }
    return res.json({ success: true, critique });
  } catch (error: unknown) {
    console.error('Error critiquing site photo:', error);
    return res.json({ success: false, error: geminiError(error) });
  }
});

/**
 * Property Details & Cadastral Enrichment API
 */
app.post('/api/ai/fetch-address-details', async (req, res) => {
  try {
    const { address } = req.body;
    const ai = getGenAI();

    if (!ai) {
      return res.json({ success: false, error: MISSING_KEY });
    }
    if (!address) {
      return res.json({ success: false, error: 'A site address is required.' });
    }

    const prompt = `You are a real estate cadastral data and parcel lookup engine.
Given the property address: "${address}"
Extract and estimate plausible, realistic Australian/US property cadastral information, lot/RP details, council zoning class, climate zone, solar orientation benefits, and site constraints.
Return JSON with this schema:
{
  "lotNumber": "string",
  "rpNumber": "string",
  "siteArea": "string",
  "councilZoning": "string",
  "climateZone": "string",
  "solarOrientation": "string",
  "estimatedBuildEra": "string",
  "floodRisk": "string",
  "easements": "string"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({ success: true, details: parsed, isFallback: false });
  } catch (error: unknown) {
    console.error('Error fetching property details:', error);
    return res.json({ success: false, error: geminiError(error) });
  }
});

}
