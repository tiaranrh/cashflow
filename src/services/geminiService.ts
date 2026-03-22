import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const getCashflowInsights = async (transactions: any[], previousBalance: number, currentBalance: number, customPrompt?: string) => {
  console.log("[GEMINI_SERVICE] Generating insights for", transactions.length, "transactions");
  const start = Date.now();
  const model = "gemini-3-flash-preview";
  const prompt = customPrompt || `
    Analyze the following cashflow data for this month (Currency: IDR - Indonesian Rupiah):
    Transactions: ${JSON.stringify(transactions)}
    Previous Balance: Rp${previousBalance.toLocaleString('id-ID')}
    Current Balance: Rp${currentBalance.toLocaleString('id-ID')}

    Provide a concise insight (max 3 sentences) about the spending habits and balance changes.
    If the balance increased significantly, congratulate the user.
    If it decreased significantly, provide a helpful insight or warning.
    Significant change is more than 20% of previous balance.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    console.log(`[GEMINI_SERVICE] Insights generated in ${Date.now() - start}ms`);
    return response.text;
  } catch (error) {
    console.error("[GEMINI_SERVICE] Gemini API error:", error);
    return "Could not generate insights at this time.";
  }
};
