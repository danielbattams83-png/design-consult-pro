import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import {join} from 'node:path';
import {GoogleGenAI, Type} from '@google/genai';

const AI_OFFLINE = 'Offline or AI unavailable — audio/data saved locally.';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

app.use(express.json({ limit: '30mb' }));

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

/**
 * AI Proposal & Material Takeoff Generator API
 */
app.post('/api/ai/generate-brief', async (req, res) => {
  try {
    const projectData = req.body;
    const ai = getGenAI();

    if (!ai) {
      return res.json({ success: false, error: AI_OFFLINE });
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
    return res.json({ success: false, error: AI_OFFLINE });
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
      return res.json({ success: false, error: AI_OFFLINE });
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
    return res.json({ success: false, error: AI_OFFLINE });
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

    if (!ai || !cleanBase64) {
      return res.json({ success: false, error: AI_OFFLINE });
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
      return res.json({ success: false, error: AI_OFFLINE });
    }
    return res.json({ success: true, transcription });
  } catch (error: unknown) {
    console.error('Error transcribing audio:', error);
    return res.json({ success: false, error: AI_OFFLINE });
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
      return res.json({ success: false, error: AI_OFFLINE });
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
      return res.json({ success: false, error: AI_OFFLINE });
    }
    return res.json({ success: true, summary });
  } catch (error: unknown) {
    console.error('Error generating meeting summary:', error);
    return res.json({ success: false, error: AI_OFFLINE });
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
    if (!ai || !cleanBase64) {
      return res.json({ success: false, error: AI_OFFLINE });
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
      return res.json({ success: false, error: AI_OFFLINE });
    }
    return res.json({
      success: true,
      extractedText,
      tags: ['OCR Extracted', 'Site Scan'],
    });
  } catch (error: unknown) {
    console.error('Error in OCR extraction:', error);
    return res.json({ success: false, error: AI_OFFLINE });
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
    if (!ai || !cleanBase64) {
      return res.json({ success: false, error: AI_OFFLINE });
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
      return res.json({ success: false, error: AI_OFFLINE });
    }
    return res.json({ success: true, critique });
  } catch (error: unknown) {
    console.error('Error critiquing site photo:', error);
    return res.json({ success: false, error: AI_OFFLINE });
  }
});

/**
 * Property Details & Cadastral Enrichment API
 */
app.post('/api/ai/fetch-address-details', async (req, res) => {
  try {
    const { address } = req.body;
    const ai = getGenAI();

    if (!ai || !address) {
      return res.json({ success: false, error: AI_OFFLINE });
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
    return res.json({ success: false, error: AI_OFFLINE });
  }
});

function stripDataUrl(value: string): string {
  if (!value.startsWith('data:')) return value;
  const marker = ';base64,';
  const markerAt = value.indexOf(marker);
  if (markerAt !== -1) return value.slice(markerAt + marker.length);
  const commaAt = value.indexOf(',');
  return commaAt !== -1 ? value.slice(commaAt + 1) : value;
}

function generateFallbackMeetingSummary(project: Record<string, unknown>, notes: string, voiceTranscripts?: string[]) {
  const name = (project?.['name'] as string) || 'On-Site Design Consult';
  const client = (project?.['clientName'] as string) || 'Client';
  const address = (project?.['siteAddress'] as string) || 'Site Location';
  const budget = (project?.['targetBudget'] as number) || 75000;
  
  const transcriptsSection = voiceTranscripts && voiceTranscripts.length > 0
    ? `\n\n#### 🎙️ ON-SITE VOICE TRANSCRIPTS & DICTATIONS\n${voiceTranscripts.map((t, idx) => `- Note ${idx + 1}: "${t}"`).join('\n')}`
    : '';

  const initialNotesSection = notes && notes.trim().length > 0
    ? `\n\n#### 📝 INITIAL FIELD NOTES\n${notes}`
    : '';

  return `### 📋 CLIENT CONSULTATION & WALKTHROUGH SUMMARY
**Project:** ${name}  
**Client:** ${client} | **Address:** ${address}  
**Target Budget Allowance:** $${budget.toLocaleString()}
${initialNotesSection}${transcriptsSection}

---

#### 1. KEY CLIENT OBJECTIVES & LIFESTYLE GOALS
- Prioritize natural daylighting, open architectural flow, and low-maintenance tactile surfaces.
- Client desires clean modern aesthetics (warm minimalist & organic accents) with durable pet/family-friendly performance.
- Seamless spatial connection between living areas and outdoor terrace.

#### 2. SPATIAL & ARCHITECTURAL DIRECTIVES
- Verified room boundaries and ceiling heights; maintain minimum 36" (91cm) clear circulation walkways.
- Maximize ceiling height lines and incorporate concealed LED accent cove lighting.
- Reconfigure doorway cased openings for enhanced sightlines into garden and natural light channels.

#### 3. MATERIAL & FINISH PALETTE
- **Flooring:** 7" wide-plank engineered European white oak with ultra-matte protective finish.
- **Surfaces:** Honed natural travertine and quartzite slab countertops with mitered waterfall edge details.
- **Wall Treatment:** Mineral limewash plaster / low-VOC matte alabaster paint palette.
- **Hardware:** Matte black and brushed warm brass architectural hardware fixtures.

#### 4. CONTRACTOR & STRUCTURAL RISK FLAGS
- Subfloor levelness within standard 3/16" over 10ft tolerance; minor prep required near wet areas.
- Center partition wall requires structural header verification prior to demolition.
- Dedicated 20A branch circuits required for kitchen appliance upgrades.

#### 5. NEXT STEPS & ACTION ITEMS
- [ ] Export 2D CAD room layout measurements to drafting team.
- [ ] Prepare preliminary material sample finish tray (Oak, Travertine, Brass).
- [ ] Generate itemized contractor trade takeoff budget for client sign-off.`;
}

function generateFallbackBrief(project: Record<string, unknown>) {
  const rooms = (project?.['rooms'] as { dimensions?: { calculatedFloorArea?: number; calculatedWallSurface?: number; calculatedPerimeter?: number; unit?: string } }[]) || [];
  const survey = project?.['survey'] as { selectedStyles?: string[] } | undefined;
  const styles = survey?.selectedStyles || ['Modern Organic', 'Warm Minimalist'];
  const totalArea = rooms.reduce((sum: number, r) => sum + (r.dimensions?.calculatedFloorArea || 0), 0);
  const totalPaint = rooms.reduce((sum: number, r) => sum + (r.dimensions?.calculatedWallSurface || 0), 0);
  const unit = rooms[0]?.dimensions?.unit === 'metric' ? 'm²' : 'sq ft';
  const linearUnit = rooms[0]?.dimensions?.unit === 'metric' ? 'linear m' : 'linear ft';

  return {
    executiveSummary: `On-site survey completed for ${(project?.['clientName'] as string) || 'Client'} at ${(project?.['siteAddress'] as string) || 'Site Location'}. The project encompasses ${rooms.length || 1} surveyed zones totaling approximately ${Math.round(totalArea)} ${unit}. Target aesthetic focuses on ${styles.join(' and ')} balancing lifestyle durability with sophisticated architectural flow.`,
    designConcept: `Incorporate natural textures, warm wood tones, and architectural lighting layers. Maximize natural daylight while structuring defined functional zones with high-performance surfaces suitable for daily lifestyle use.`,
    paletteSuggestions: [
      { name: 'Warm Alabaster', hex: '#F8F6F0', role: 'Main Walls & Ceilings', finish: 'Matte / Eggshell' },
      { name: 'Smoked Amber Oak', hex: '#C28448', role: 'Cabinetry & Architectural Trim', finish: 'Satin Poly' },
      { name: 'Deep Slate Charcoal', hex: '#334155', role: 'Metal Accents & Hardware', finish: 'Matte Powdercoat' },
      { name: 'Earthy Travertine', hex: '#E6DCBF', role: 'Flooring / Slab Countertop', finish: 'Honed' },
    ],
    materialTakeoffs: [
      {
        room: 'All Surveyed Rooms',
        item: 'Hardwood / Engineered Plank Flooring',
        estimatedQuantity: `${Math.round(totalArea * 1.1)}`,
        unit: unit,
        calculationBasis: `${Math.round(totalArea)} ${unit} net floor area`,
        wasteAllowance: '10% waste & cut factor included',
      },
      {
        room: 'All Surveyed Rooms',
        item: 'Interior Wall & Ceiling Paint',
        estimatedQuantity: `${Math.max(2, Math.ceil((totalPaint || 400) / 350))}`,
        unit: 'Gallons (2 coats)',
        calculationBasis: `${Math.round(totalPaint || 400)} ${unit} gross wall surface less openings`,
        wasteAllowance: 'Standard 350 sq ft/gal coverage',
      },
      {
        room: 'General Trim',
        item: 'Baseboards & Quarter Round',
        estimatedQuantity: `${Math.round(rooms.reduce((s: number, r) => s + (r.dimensions?.calculatedPerimeter || 0), 0) * 1.08)}`,
        unit: linearUnit,
        calculationBasis: 'Sum of surveyed room wall perimeters',
        wasteAllowance: '8% miter & corner waste',
      },
    ],
    contractorRiskAlerts: [
      'Check for subfloor leveling deviations before specifying large-format porcelain tile or continuous hardwood.',
      'Verify wall diagonal squareness prior to ordering pre-fabricated cabinetry or bespoke built-in millwork.',
      'Inspect breaker panel amperage if adding high-draw induction cooktops or in-floor radiant heating.',
    ],
    phasePlan: [
      'Export and verify 2D field dimension sheets with client & lead trade contractor.',
      'Produce 1/4" scale CAD schematic layouts incorporating verified window sill and door swing clearances.',
      'Order finish samples (flooring, slab, cabinet veneer) for client sign-off in natural room light.',
      'Finalize trade bid package and submit structural/electrical permit applications.',
    ],
  };
}

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

