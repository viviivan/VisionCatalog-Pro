import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function callGeminiWithRetry(
  fn: () => Promise<any>,
  maxRetries = 5,
  initialDelay = 1000
) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes('429') || error?.status === 429;
      if (isRateLimit && retries < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, retries);
        console.warn(`Rate limit hit. Retrying in ${delay}ms...`);
        await sleep(delay);
        retries++;
        continue;
      }
      throw error;
    }
  }
}

export async function analyzeProductImage(
  apiKey: string,
  model: string,
  base64Image: string,
  mimeType: string,
  coreKeyword: string
): Promise<{ description: string; descriptionZh: string }> {
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    Analyze this product image for an e-commerce catalog.
    Core Keyword: ${coreKeyword}
    
    Task:
    Provide a CONCISE but DESCRIPTIVE 2-4 word identifier for the specific product variant shown in the image. 
    Focus on unique visual features like color, pattern, or style to distinguish it from other similar products.
    Example: If the core keyword is "Punch Needle Kit" and the image shows a blue monarch butterfly, the description should be "Blue Monarch Butterfly".
    
    Return the result in JSON format:
    {
      "description": "string (English, e.g., 'Blue Monarch Butterfly')",
      "descriptionZh": "string (Chinese translation, e.g., '蓝色黑脉金斑蝶')"
    }
  `;

  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: prompt }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json"
    }
  });

  const result = JSON.parse(response.text || '{}');
  return {
    description: result.description || 'Product Variant',
    descriptionZh: result.descriptionZh || '产品款式'
  };
}

export async function generateProductImage(
  apiKey: string,
  model: string,
  prompt: string,
  aspectRatio: string
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [{ text: prompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: aspectRatio as any,
        imageSize: "1K"
      }
    }
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  
  throw new Error("No image generated in response");
}
