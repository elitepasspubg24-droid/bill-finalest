import { createServerFn } from "@tanstack/react-start";

export type ExtractedBillItem = {
  raw_name: string;
  qty: number;
  rate: number;
};

export type ExtractedBill = {
  vendor: string | null;
  bill_no: string | null;
  bill_date: string | null;
  items: ExtractedBillItem[];
};

export const extractBillFromImage = createServerFn({ method: "POST" })
  .inputValidator((data: { dataUrl: string; type: "purchase" | "sale" }) => data)
  .handler(async ({ data }): Promise<ExtractedBill> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY missing in environment variables.");

    const matches = data.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) throw new Error("Invalid file format.");
    
    const mimeType = matches[1];
    const base64Data = matches[2];

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: `Extract this ${data.type} steel bill into JSON with keys: vendor, bill_no, bill_date(YYYY-MM-DD), items:[{raw_name, qty, rate}]` },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }],
        generationConfig: { response_mime_type: "application/json" },
      }),
    });

    const result = await response.json();
    const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) throw new Error("AI failed to return a response.");
    
    const parsed = JSON.parse(rawContent.replace(/```json|```/g, "").trim());

    return {
      vendor: parsed.vendor ?? null,
      bill_no: parsed.bill_no ?? null,
      bill_date: parsed.bill_date ?? null,
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  });
