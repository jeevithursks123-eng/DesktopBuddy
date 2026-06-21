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
    const { message, history } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(400).json({ 
        error: "GROQ_API_KEY is not configured on the server. Please add it in your Secrets panel under Settings." 
      });
    }

    // A customized system prompt to keep responses natural, conversational, and voice-friendly.
    const systemPrompt = 
      "You are Aura, an advanced, sleek desktop AI Voice Assistant. " +
      "Provide extremely concise, helpful, and naturally conversational responses (usually 1 to 3 sentences max). " +
      "Since your response will be read aloud using text-to-speech: " +
      "1. Avoid complex markdown, bullet points, headers, or lists. Write in clean, flowing text. " +
      "2. Keep numeric calculations short or spell them out if needed. " +
      "3. Use standard conversational pacing and tone. " +
      "4. Do not use multiple emojis, symbols, or code blocks in the standard conversation, but you may output code if specifically asked.";

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
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
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

    if (!process.env.GEMINI_API_KEY) {
      return res.status(400).json({ 
        error: "GEMINI_API_KEY is not configured on the server. Please add it to your secrets or .env file." 
      });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
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
