import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// API route 1: Chat endpoint using Groq API
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history, language } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    const groqKey = process.env.GROQ_API_KEY || "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";

    let languageDirective = "";
    if (language === "kn-IN") {
      languageDirective = " CRITICAL MANDATE: The current active system language is selected as Kannada. You MUST respond primarily in beautiful, grammatically correct Kannada language (using standard Kannada script, e.g. ಕನ್ನಡ) unless the user explicitly requests you to talk in English or Hindi. You may mix common English terms (code-switch) inside Kannada sentences naturally.";
    } else if (language === "hi-IN") {
      languageDirective = " CRITICAL MANDATE: The current active system language is selected as Hindi. You MUST respond primarily in beautiful, grammatically correct Hindi language (using standard Devanagari script, e.g. हिंदी) unless the user explicitly requests you to talk in English or Kannada. You may mix common English terms (code-switch) inside Hindi sentences naturally.";
    } else if (language === "en-IN") {
      languageDirective = " CRITICAL MANDATE: The system language is Indian English. Respond in fluent English, keeping names and local Indian contexts natural and clear.";
    }

    // A customized system prompt to keep responses natural, conversational, and voice-friendly.
    const systemPrompt = 
      "You are Aura, an advanced, sleek desktop AI Voice Assistant with support for English, Hindi (हिंदी), and Kannada (ಕನ್ನಡ). " +
      "Provide extremely concise, helpful, and naturally conversational responses (usually 1 to 3 sentences max). " +
      "You fully understand Kannada and Hindi. If the user addresses you in Kannada or asks in Kannada, respond naturally and grammatically correctly in Kannada using the standard Kannada script. " +
      "If the user addresses you in Hindi or asks in Hindi, respond naturally and grammatically correctly in Hindi using the standard Devanagari script. " +
      "You can also seamlessly mix English words (code-switching) if appropriate for an natural conversational tone. " +
      "Since your response will be read aloud using text-to-speech: " +
      "1. Avoid complex markdown, bullet points, headers, or lists. Write in clean, flowing text. " +
      "2. Keep numeric calculations short or spell them out if needed. " +
      "3. Use standard conversational pacing and tone in all languages. " +
      "4. Do not use multiple emojis, symbols, or code blocks in the standard conversation, but you may output code if specifically asked." +
      languageDirective;

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []).map((h: any) => ({
        role: h.role === "assistant" ? "assistant" : "user",
        content: h.content || h.message
      })),
      { role: "user", content: message }
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        temperature: 0.7,
        max_tokens: 350
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ 
        error: `Groq API returned an error: ${errText}` 
      });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(500).json({ error: "No response received from Groq." });
    }

    res.json({ reply });
  } catch (err: any) {
    console.error("Error in /api/chat:", err);
    res.status(500).json({ error: err.message || "An error occurred during chat processing." });
  }
});

// API route to proxy search queries to Google (via Gemini grounding) or DuckDuckGo scraper
// Helper to request from DuckDuckGo HTML scrapper
async function scrapeDuckDuckGo(query: string): Promise<any[]> {
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error("DuckDuckGo HTML query blocked or rate limited.");
  }

  const html = await response.text();
  
  // Robustly extract links: Title is block of h2.result__title containing class result__a
  const titleRegex = /<h2 class="result__title">[\s\S]*?<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

  const results: any[] = [];
  const matches = [...html.matchAll(titleRegex)];
  const snippetsMatches = [...html.matchAll(snippetRegex)];

  function decodeDdgUrl(urlStr: string) {
    if (urlStr.includes("uddg=")) {
      try {
        const parts = urlStr.split("uddg=");
        const target = parts[1].split("&")[0];
        return decodeURIComponent(target);
      } catch {
        // ignore
      }
    }
    if (urlStr.startsWith("//")) {
      return "https:" + urlStr;
    }
    return urlStr;
  }

  const stripHtml = (txt: string) => txt.replace(/<[^>]*>/g, "").trim();

  // Map up to 5 results
  for (let i = 0; i < Math.min(matches.length, 5); i++) {
    const rawUrl = matches[i][1];
    const rawTitle = matches[i][2];
    const rawSnippet = snippetsMatches[i] ? snippetsMatches[i][1] : "";

    results.push({
      title: stripHtml(rawTitle) || "Search Result",
      url: decodeDdgUrl(rawUrl),
      snippet: stripHtml(rawSnippet) || "View direct resource result."
    });
  }
  return results;
}

// Helper to call official free DuckDuckGo JSON API
async function fetchDuckDuckGoApi(query: string): Promise<any[]> {
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
    if (!res.ok) return [];
    
    const json: any = await res.json();
    const results: any[] = [];
    
    if (json.AbstractURL) {
      results.push({
        title: json.Heading || "Main Article",
        url: json.AbstractURL,
        snippet: json.AbstractText || json.Abstract || "Information summary from official sources."
      });
    }
    
    if (json.RelatedTopics && Array.isArray(json.RelatedTopics)) {
      for (const topic of json.RelatedTopics) {
        if (topic.FirstURL && topic.Text) {
          results.push({
            title: topic.Text,
            url: topic.FirstURL,
            snippet: topic.Text
          });
        } else if (topic.Topics && Array.isArray(topic.Topics)) {
          for (const sub of topic.Topics) {
            if (sub.FirstURL && sub.Text) {
              results.push({
                title: sub.Text,
                url: sub.FirstURL,
                snippet: sub.Text
              });
            }
          }
        }
      }
    }
    return results;
  } catch (err) {
    console.warn("DDG JSON API fetch exception:", err);
    return [];
  }
}

// Helper to query Wikipedia Opensearch (free and uncapped)
async function fetchWikipediaSearch(query: string): Promise<any[]> {
  try {
    const res = await fetch(`https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=5&namespace=0&format=json`);
    if (!res.ok) return [];
    
    const json: any = await res.json();
    const terms = json[0] || "";
    const titles = json[1] || [];
    const snippets = json[2] || [];
    const urls = json[3] || [];
    
    const results: any[] = [];
    for (let i = 0; i < titles.length; i++) {
      results.push({
        title: titles[i] || "Wikipedia Resource",
        url: urls[i] || "https://en.wikipedia.org",
        snippet: snippets[i] || `View article results on Wikipedia matching ${terms}`
      });
    }
    return results;
  } catch (err) {
    console.warn("Wikipedia Opensearch exception:", err);
    return [];
  }
}

// Generates a neat list of high-quality default resources if all APIs fail
function generateStaticFallbackLinks(query: string): any[] {
  const encoded = encodeURIComponent(query);
  return [
    {
      title: `Search Wikipedia for "${query}"`,
      url: `https://en.wikipedia.org/wiki/Special:Search?search=${encoded}`,
      snippet: "Comprehensive global online encyclopedia resource index."
    },
    {
      title: `Search MDN Web Docs for "${query}"`,
      url: `https://developer.mozilla.org/en-US/search?q=${encoded}`,
      snippet: "Documentation for web platform technologies, HTML, CSS, JavaScript, and APIs."
    },
    {
      title: `Lookup GitHub repositories matching "${query}"`,
      url: `https://github.com/search?q=${encoded}`,
      snippet: "Explore millions of open source code packages, libraries, and project templates."
    },
    {
      title: `Ask StackOverflow community about "${query}"`,
      url: `https://stackoverflow.com/search?q=${encoded}`,
      snippet: "Verify programming queries, exceptions, issues, answers, and error solution summaries."
    }
  ];
}

app.post("/api/search", async (req, res) => {
  try {
    const { query, engine } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: "Query is required." });
    }

    const targetEngine = engine || "google";
    let results: any[] = [];
    let chosenEngine = targetEngine;

    // 1. DUCKDUCKGO FLOW DIRECT ACTION
    if (targetEngine === "duckduckgo") {
      console.log("Direct DuckDuckGo requested. Attempting crawling scraper...");
      try {
        results = await scrapeDuckDuckGo(query);
      } catch (e) {
        console.warn("Direct DDG scraper failed, trying DDG official JSON API...", e);
      }

      if (results.length === 0) {
        console.log("DDG Scraper returned empty. Trying DuckDuckGo official API...");
        results = await fetchDuckDuckGoApi(query);
      }

      if (results.length === 0) {
        console.log("DDG official API returned empty. Trying Wikipedia Opensearch...");
        results = await fetchWikipediaSearch(query);
      }

      if (results.length === 0) {
        console.log("Wikipedia search returned empty. Falling back to static curated educational resources...");
        results = generateStaticFallbackLinks(query);
      }
    }

    // 2. GOOGLE FLOW DIRECT ACTION (or standard fallback if target engine was google)
    if (targetEngine === "google") {
      console.log("Direct Google Search grounding requested...");
      try {
        const geminiKey = process.env.GEMINI_API_KEY || "AIzaSyDjfKpP-6oBTsC7S7Te03CfB_aF1pzEodI";
        const ai = new GoogleGenAI({
          apiKey: geminiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const geminiRes = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: `Provide a highly concise, 2-3 sentence summary answer to this desktop web search request: "${query}"`,
          config: {
            tools: [{ googleSearch: {} }]
          }
        });

        const answer = geminiRes.text || "Your query was processed successfully.";
        const chunks = geminiRes.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

        results = chunks
          .filter((chunk: any) => chunk.web?.uri)
          .map((chunk: any, index: number) => ({
            title: chunk.web?.title || `Google Source [${index + 1}]`,
            url: chunk.web?.uri,
            snippet: "Verified search source"
          }))
          .slice(0, 5);

        if (results.length > 0) {
          return res.json({
            engine: "google",
            answer,
            results
          });
        }
      } catch (googleErr: any) {
        console.warn("Google Grounding failed (quota limits or API error). Falling back to DuckDuckGo/Wikipedia flows:", googleErr);
      }

      // If Google grounding fails or returns empty, execute our alternative sources
      console.log("Google grounding option failed/empty. Trying scraped DDG info...");
      chosenEngine = "duckduckgo";
      try {
        results = await scrapeDuckDuckGo(query);
      } catch (ddgErr) {
        console.warn("Scraped DDG failed on Google fallback:", ddgErr);
      }

      if (results.length === 0) {
        results = await fetchDuckDuckGoApi(query);
      }

      if (results.length === 0) {
        results = await fetchWikipediaSearch(query);
      }

      if (results.length === 0) {
        results = generateStaticFallbackLinks(query);
      }
    }

    // Now, results has items. Let's form the summary answer using standard Gemini model!
    let answer = `Aura retrieved ${results.length} relevant reference resources for your query.`;
    
    try {
      const geminiKey = process.env.GEMINI_API_KEY || "AIzaSyDjfKpP-6oBTsC7S7Te03CfB_aF1pzEodI";
      const ai = new GoogleGenAI({
        apiKey: geminiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
      });

      const summaryText = results.map(r => `Title: ${r.title}\nSnippet: ${r.snippet}`).join("\n\n");
      const summaryRes = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `The user requested info on: "${query}". We found these top resources:\n\n${summaryText}\n\nSummarize a neat, naturally conversational answer to the user query in 2 or 3 clean sentences based directly on these results.`
      });

      if (summaryRes.text) {
        answer = summaryRes.text;
      }
    } catch (modelErr) {
      console.warn("General model-based summary generation failed (quota exhaustion). Generating automated response summary.", modelErr);
      // Fallback summary generation with raw string template
      const topTitle = results[0]?.title || "Reference article";
      answer = `Here are the search sources for "${query}". The first match discusses: ${topTitle}. Please click on any item to read the detailed resources directly in your browser.`;
    }

    return res.json({
      engine: chosenEngine,
      answer,
      results
    });

  } catch (err: any) {
    console.error("Critical error in /api/search overall router:", err);
    res.status(500).json({ error: err.message || "An error occurred during search execution." });
  }
});

// Helper to wrap raw 24000Hz 16-bit linear PCM mono into a standard WAV container
function addWavHeader(pcmBuffer: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  
  // RIFF identifier
  header.write("RIFF", 0);
  // File length - 8
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  // WAVE identifier
  header.write("WAVE", 8);
  // Subchunk1 identifier "fmt "
  header.write("fmt ", 12);
  // Subchunk1 size (16 for PCM)
  header.writeUInt32LE(16, 16);
  // Audio format (1 for uncompressed PCM)
  header.writeUInt16LE(1, 20);
  // Number of channels (1 channel - mono)
  header.writeUInt16LE(1, 22);
  // Sample rate
  header.writeUInt32LE(sampleRate, 24);
  // Byte rate (sampleRate * bitsPerSample/8)
  header.writeUInt32LE(sampleRate * 2, 28);
  // Block align (bitsPerSample/8)
  header.writeUInt16LE(2, 32);
  // Bits per sample
  header.writeUInt16LE(16, 34);
  // Subchunk2 identifier "data"
  header.write("data", 36);
  // Subchunk2 size
  header.writeUInt32LE(pcmBuffer.length, 40);
  
  return Buffer.concat([header, pcmBuffer]);
}

// API route 2: Text-to-Speech endpoint using Gemini TTS
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voiceName } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required for TTS." });
    }

    const geminiKey = process.env.GEMINI_API_KEY || "AIzaSyDjfKpP-6oBTsC7S7Te03CfB_aF1pzEodI";

    const ai = new GoogleGenAI({
      apiKey: geminiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            // Supported Google prebuilt voices: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
            prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' },
          },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    const base64Audio = part?.inlineData?.data;

    if (!base64Audio) {
      return res.status(500).json({ error: "No audio data was generated by the Gemini TTS service." });
    }

    // Wrap raw PCM audio stream into a valid WAV file base64 format (24000Hz mono 16-bit)
    const pcmBuffer = Buffer.from(base64Audio, "base64");
    const wavBuffer = addWavHeader(pcmBuffer, 24000);
    const wavBase64 = wavBuffer.toString("base64");

    res.json({ base64Audio: wavBase64, mimeType: 'audio/wav' });
  } catch (err: any) {
    console.error("Error in /api/tts:", err);
    res.status(500).json({ error: err.message || "An error occurred during voice synthesis." });
  }
});

// Serve frontend assets via Vite middleware in development, or serve built bundle in production.
async function mountVite() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

mountVite().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[Aura Engine] Full-stack server boot-up completed on port ${PORT}`);
  });
});
