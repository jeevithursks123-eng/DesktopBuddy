/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Mic, MicOff, Play, Pause, RotateCcw, Volume2, VolumeX, Plus, Trash2, 
  Copy, Check, Sparkles, Clock, FileText, Keyboard, AlertTriangle, 
  HelpCircle, CheckSquare, ChevronRight, X, ExternalLink, Search, Loader2, Globe,
  Battery, BatteryCharging, BatteryWarning, MapPin, Share2, Smartphone, Tablet, Monitor, Wifi, WifiOff, Navigation
} from "lucide-react";

interface Note {
  id: string;
  content: string;
  timestamp: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  isCommand?: boolean;
}

export default function App() {
  // Navigation or Tabs - None as per Single-View Constraint!
  // App states
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hello! I am Aura, your voice assistant. Pick a language or voice, or press the Spacebar to speak commands. I support English, Hindi (हिंदी), and Kannada (ಕನ್ನಡ)!" }
  ]);
  const [inputText, setInputText] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("Kore");
  const [apiError, setApiError] = useState<string | null>(null);

  // Device integration states
  const [batteryState, setBatteryState] = useState<{ level: number; charging: boolean } | null>(null);
  const [locationState, setLocationState] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [activeMobileTab, setActiveMobileTab] = useState<"assistant" | "focus" | "search" | "scratchpad">("assistant");

  // Search Engine Widget states
  const [searchEngine, setSearchEngine] = useState<"google" | "duckduckgo">("google");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchAnswer, setSearchAnswer] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  
  // Real-time clocks
  const [localTime, setLocalTime] = useState("");
  const [utcTime, setUtcTime] = useState("");

  // Speech Recognition ref / state
  const [recognitionSupported, setRecognitionSupported] = useState(true);
  const recognitionRef = useRef<any>(null);
  const currentTranscriptRef = useRef("");
  
  // Audio playback ref
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Track consecutive spoken utterances in memory to prevent Garbage Collection couper-off issue
  const activeUtterancesRef = useRef<SpeechSynthesisUtterance[]>([]);
  const currentChunkIndexRef = useRef<number>(0);

  // Desktop Scratchpad state
  const [notes, setNotes] = useState<Note[]>([]);
  const [manualNoteText, setManualNoteText] = useState("");
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const [copiedResponse, setCopiedResponse] = useState(false);

  // Desktop Pomodoro Focus Timer
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerLeft, setTimerLeft] = useState(25 * 60); // 25 mins in sec
  const [timerDuration, setTimerDuration] = useState(25 * 60);

  // Haptic feedback API Integration
  const triggerHaptic = (pattern: number | number[] = 25) => {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        console.warn("Haptic vibrate ignored:", e);
      }
    }
  };

  // Screen Wake Lock API Integration (Prevents standby on mobile/tablet during active voice feedback sessions)
  const wakeLockRef = useRef<any>(null);
  const requestWakeLock = async () => {
    if (typeof window !== "undefined" && "wakeLock" in navigator) {
      try {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      } catch (err) {
        console.warn("Device wake lock request denied:", err);
      }
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      try {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.warn("Wake lock release error:", err);
      }
    }
  };

  // Native Device Share Sheet integration
  const handleDeviceShare = async (title: string, text: string) => {
    triggerHaptic(20);
    if (typeof window !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title,
          text,
        });
      } catch (err) {
        console.log("Share operation closed:", err);
      }
    } else {
      navigator.clipboard.writeText(text);
      setCopiedResponse(true);
      setTimeout(() => setCopiedResponse(false), 2000);
    }
  };

  // Geolocation trigger
  const requestDeviceLocation = () => {
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          setLocationState({ latitude, longitude, accuracy });
        },
        (err) => {
          console.warn("Location query denied or failed:", err);
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 600000 }
      );
    }
  };

  // Setup clocks
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLocalTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setUtcTime(now.toUTCString().substring(17, 25) + " UTC");
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Setup Device Integrations: Battery status, network state, and geolocation triggers
  useEffect(() => {
    // Try to trigger geolocation coords on start
    requestDeviceLocation();

    // Battery levels
    if (typeof window !== "undefined" && "getBattery" in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        const updateBattery = () => {
          setBatteryState({
            level: Math.round(battery.level * 100),
            charging: battery.charging
          });
        };
        updateBattery();
        battery.addEventListener("levelchange", updateBattery);
        battery.addEventListener("chargingchange", updateBattery);
        return () => {
          battery.removeEventListener("levelchange", updateBattery);
          battery.removeEventListener("chargingchange", updateBattery);
        };
      }).catch((e: any) => console.warn("Battery API error:", e));
    }

    // Network connection indicators
    const handleOnline = () => {
      setIsOnline(true);
      triggerHaptic([30, 80]);
    };
    const handleOffline = () => {
      setIsOnline(false);
      triggerHaptic([100, 100]);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Setup Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setRecognitionSupported(false);
      return;
    }

    const rec = new SpeechRecognition();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = selectedLanguage;

    rec.onstart = () => {
      setIsListening(true);
      triggerHaptic([30, 40]);
      requestWakeLock();
      currentTranscriptRef.current = "";
    };

    rec.onresult = (event: any) => {
      let finalTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          currentTranscriptRef.current = event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        currentTranscriptRef.current = finalTranscript;
      }
    };

    rec.onend = () => {
      setIsListening(false);
      releaseWakeLock();
      const textToSubmit = currentTranscriptRef.current.trim();
      if (textToSubmit) {
        handleSendMessage(textToSubmit);
      }
    };

    rec.onerror = (event: any) => {
      console.error("Speech Recognition encounter:", event.error);
      setIsListening(false);
      releaseWakeLock();
      triggerHaptic([100, 50, 100]);
    };

    recognitionRef.current = rec;
  }, []);

  // Sync selectedLanguage with speech recognizer instance
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = selectedLanguage;
    }
  }, [selectedLanguage]);

  // Load Scratchpad values from localStorage
  useEffect(() => {
    const savedNotes = localStorage.getItem("aura_notes");
    if (savedNotes) {
      try {
        setNotes(JSON.parse(savedNotes));
      } catch (err) {
        console.error("Failed to parse saved notes database", err);
      }
    } else {
      // Seed default notes
      const initial: Note[] = [
        { id: "1", content: "Spacebar serves as shortcut to activate/deactivate mic", timestamp: new Date().toLocaleTimeString() },
        { id: "2", content: "Try saying: 'create note buy hardware tools'", timestamp: new Date().toLocaleTimeString() }
      ];
      setNotes(initial);
      localStorage.setItem("aura_notes", JSON.stringify(initial));
    }
  }, []);

  // Pomodoro Focus Timer tick hook
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && timerLeft > 0) {
      interval = setInterval(() => {
        setTimerLeft(prev => prev - 1);
      }, 1000);
    } else if (timerLeft === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      handleVoiceSpeechNotification("Your designated focus session has completed, congratulations!");
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerLeft]);

  // Global Keyboard listener for Spacebar mic toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in form inputs
      if (
        document.activeElement?.tagName === "INPUT" || 
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        toggleMicrophone();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isListening, recognitionSupported]);

  // Handle manual note storage state update
  const saveNotesToStorage = (updatedNotes: Note[]) => {
    setNotes(updatedNotes);
    localStorage.setItem("aura_notes", JSON.stringify(updatedNotes));
  };

  const addScratchnote = (content: string) => {
    const newNote: Note = {
      id: Date.now().toString(),
      content: content.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    saveNotesToStorage([newNote, ...notes]);
  };

  const deleteScratchnote = (id: string) => {
    const filtered = notes.filter(n => n.id !== id);
    saveNotesToStorage(filtered);
  };

  const clearAllNotes = () => {
    saveNotesToStorage([]);
  };

  // Toggle Speech Recognition mic
  const toggleMicrophone = () => {
    if (!recognitionRef.current) {
      if (!recognitionSupported) {
        alert("Speech recognition isn't supported in this browser environment. Please type your prompt.");
      }
      return;
    }

    stopCurrentPlayback();

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setApiError(null);
      try {
        recognitionRef.current.start();
      } catch (err: any) {
        console.error("Mic start failed", err);
      }
    }
  };

  // Stop active text-to-speech output
  const stopCurrentPlayback = () => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    activeUtterancesRef.current = [];
    currentChunkIndexRef.current = 0;
    setIsSpeaking(false);
  };

  // Helper to split long text into clean, individual sentence-level speech-friendly chunks
  const splitTextIntoNaturalChunks = (text: string): string[] => {
    // Strip code blocks, inline code, bold, links, and non-ascii emojis (preserving non-latin text like Kannada/Hindi)
    let clean = text
      .replace(/```[\s\S]*?```/g, "Code block omitted.")
      .replace(/`[\s\S]*?`/g, "")
      .replace(/\*\*|_\*|~~|`/g, "")
      .replace(/\[.*?\]\(.*?\)/g, "")
      .trim();

    if (!clean) {
      return ["Active command completed."];
    }

    // Split on typical sentence boundaries across multiple scripts: . ? ! ; । \n and Kannada full-stops
    const r = /([^.!?;\n।]+[.!?;\n।]*)/g;
    const parts = clean.match(r) || [clean];
    const chunks: string[] = [];
    let currentChunk = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;

      // Handle long clauses without structure by splitting on word boundaries
      if (part.length > 150) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = "";
        }
        const words = part.split(/(\s+)/);
        let temp = "";
        for (const w of words) {
          if ((temp + w).length > 120) {
            if (temp.trim()) {
              chunks.push(temp.trim());
            }
            temp = w;
          } else {
            temp += w;
          }
        }
        if (temp.trim()) {
          currentChunk = temp;
        }
      } else {
        if ((currentChunk + " " + part).length > 150) {
          if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
          }
          currentChunk = part;
        } else {
          currentChunk = currentChunk ? (currentChunk + " " + part) : part;
        }
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.map(c => c.trim()).filter(Boolean);
  };

  // Perform TTS speech synthesis using low-latency native browser Web Speech API with safe recursive sequence playing
  const executeVoiceSynthesis = async (text: string) => {
    try {
      stopCurrentPlayback();
      setIsGeneratingVoice(true);

      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        console.warn("Speech synthesis not supported in this browser context.");
        setIsGeneratingVoice(false);
        return;
      }

      // Generate a sequence of human-rate natural speakable chunks
      const chunks = splitTextIntoNaturalChunks(text);
      if (chunks.length === 0) {
        setIsGeneratingVoice(false);
        return;
      }

      setIsGeneratingVoice(false);
      setIsSpeaking(true);
      triggerHaptic(25);
      requestWakeLock();

      const voices = window.speechSynthesis.getVoices();
      currentChunkIndexRef.current = 0;
      activeUtterancesRef.current = [];

      const speakNextChunk = () => {
        // Stop if user cancelled or we finished all chunks
        if (currentChunkIndexRef.current >= chunks.length) {
          setIsSpeaking(false);
          activeUtterancesRef.current = [];
          releaseWakeLock();
          return;
        }

        const chunkText = chunks[currentChunkIndexRef.current];
        const utterance = new SpeechSynthesisUtterance(chunkText);

        // Check for Kannada/Hindi Unicode character presence in current chunk
        const hasKannada = /[\u0C80-\u0CFF]/.test(chunkText);
        const hasHindi = /[\u0900-\u097F]/.test(chunkText);

        let targetLang = selectedLanguage;
        if (hasKannada) {
          targetLang = "kn-IN";
        } else if (hasHindi) {
          targetLang = "hi-IN";
        }

        utterance.lang = targetLang;

        let selectedVoiceObj = null;

        // 1. High-precision native matching with intelligent fallbacks
        if (hasKannada) {
          // Try searching for any active Kannada local voice
          selectedVoiceObj = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith("kn"));
          if (!selectedVoiceObj) {
            // Crucial fallback: Use English (India) to speak with an easily comprehensible local regional accent
            selectedVoiceObj = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith("en-in"));
          }
          if (!selectedVoiceObj) {
            // Look for any alternate Indian voice fallback
            selectedVoiceObj = voices.find(v => v.lang.toLowerCase().includes("in") || v.name.toLowerCase().includes("india"));
          }
        } else if (hasHindi) {
          // Try searching for any active Hindi local voice
          selectedVoiceObj = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith("hi"));
          if (!selectedVoiceObj) {
            // Crucial fallback: Use English (India)
            selectedVoiceObj = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith("en-in"));
          }
          if (!selectedVoiceObj) {
            selectedVoiceObj = voices.find(v => v.lang.toLowerCase().includes("in") || v.name.toLowerCase().includes("india"));
          }
        }

        // 2. Consistent English voice profiling with adaptive regional tone matching
        if (!selectedVoiceObj) {
          const isIndiaPreset = ["kn-IN", "hi-IN", "en-IN"].includes(selectedLanguage);
          
          // Segment voices into local Indian accented and global English sets
          const enInVoices = voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith("en-in"));
          const baseVoicePool = (isIndiaPreset && enInVoices.length > 0) ? enInVoices : (voices.length > 0 ? voices : []);

          if (selectedVoice === "Zephyr") {
            utterance.rate = 1.15;
            utterance.pitch = 1.25;
            selectedVoiceObj = baseVoicePool.find(
              (v) =>
                v.name.toLowerCase().includes("female") ||
                v.name.toLowerCase().includes("zira") ||
                v.name.toLowerCase().includes("google") ||
                v.name.toLowerCase().includes("samantha") ||
                v.name.toLowerCase().includes("heera") ||
                v.name.toLowerCase().includes("rhea") ||
                v.name.toLowerCase().includes("veena")
            );
          } else if (selectedVoice === "Charon") {
            utterance.rate = 0.85;
            utterance.pitch = 0.70;
            selectedVoiceObj = baseVoicePool.find(
              (v) =>
                v.name.toLowerCase().includes("male") ||
                v.name.toLowerCase().includes("david") ||
                v.name.toLowerCase().includes("hazel") ||
                v.name.toLowerCase().includes("rishi") ||
                v.name.toLowerCase().includes("ravi") ||
                v.name.toLowerCase().includes("google")
            );
          } else if (selectedVoice === "Puck") {
            utterance.rate = 1.25;
            utterance.pitch = 1.15;
            selectedVoiceObj = baseVoicePool.find(
              (v) =>
                v.name.toLowerCase().includes("gb") ||
                v.name.toLowerCase().includes("uk") ||
                v.name.toLowerCase().includes("samantha") ||
                v.name.toLowerCase().includes("rishi") ||
                v.name.toLowerCase().includes("google")
            );
          } else if (selectedVoice === "Fenrir") {
            utterance.rate = 0.95;
            utterance.pitch = 0.85;
            selectedVoiceObj = baseVoicePool.find(
              (v) =>
                v.name.toLowerCase().includes("male") ||
                v.name.toLowerCase().includes("david") ||
                v.name.toLowerCase().includes("google") ||
                v.name.toLowerCase().includes("ravi")
            );
          }

          // Absolute default fallback configuration
          if (!selectedVoiceObj) {
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            if (isIndiaPreset && enInVoices.length > 0) {
              selectedVoiceObj = enInVoices[0];
            } else {
              selectedVoiceObj = voices.find(v => v.lang.toLowerCase().startsWith("en")) || voices[0];
            }
          }
        }

        if (selectedVoiceObj) {
          utterance.voice = selectedVoiceObj;
        }

        // Custom browser handling fallback safety
        if (!utterance.voice && voices.length > 0) {
          const fallbackEn = voices.find((v) => v.lang.toLowerCase().includes("en"));
          if (fallbackEn) {
            utterance.voice = fallbackEn;
          } else {
            utterance.voice = voices[0];
          }
        }

        // Lock reference inside memory to protect from browser background GC
        activeUtterancesRef.current.push(utterance);

        utterance.onend = () => {
          // Relieve reference from memory array
          const idx = activeUtterancesRef.current.indexOf(utterance);
          if (idx !== -1) {
            activeUtterancesRef.current.splice(idx, 1);
          }
          currentChunkIndexRef.current += 1;
          speakNextChunk();
        };

        utterance.onerror = (e) => {
          console.error("Native synthesis error on chunk:", e);
          setIsSpeaking(false);
          activeUtterancesRef.current = [];
          releaseWakeLock();
        };

        window.speechSynthesis.speak(utterance);
      };

      // Play the first chunk
      speakNextChunk();
    } catch (err) {
      console.error("Synthesizer failed to execute:", err);
      setIsGeneratingVoice(false);
      setIsSpeaking(false);
    }
  };

  // Simplified TTS announcer for widgets (runs directly)
  const handleVoiceSpeechNotification = async (text: string) => {
    await executeVoiceSynthesis(text);
  };

  // Run desktop commands parser
  const parseDesktopCommands = (text: string): { matched: boolean; feedback: string; reply: string } | null => {
    const normalized = text.toLowerCase().trim();

    // 1. TIMERS: Match focus, countdown, pomodoro
    if (
      normalized.includes("timer") || 
      normalized.includes("pomodoro") || 
      normalized.includes("countdown") || 
      normalized.includes("focus")
    ) {
      if (
        normalized.includes("start") || 
        normalized.includes("begin") || 
        normalized.includes("run") || 
        normalized.includes("launch")
      ) {
        // Detect numbers in expression
        const numbers = normalized.match(/\d+/);
        const minutes = numbers ? parseInt(numbers[0], 10) : 25;
        
        setTimerDuration(minutes * 60);
        setTimerLeft(minutes * 60);
        setIsTimerRunning(true);

        const announcement = `Launching a ${minutes} minute focus session now.`;
        return {
          matched: true,
          feedback: `Command Executed: Created a ${minutes} minute focus timer.`,
          reply: announcement
        };
      } else if (
        normalized.includes("stop") || 
        normalized.includes("pause") || 
        normalized.includes("freeze")
      ) {
        setIsTimerRunning(false);
        return {
          matched: true,
          feedback: "Command Executed: Paused the focus timer.",
          reply: "I have paused your focus timer session."
        };
      } else if (
        normalized.includes("reset") || 
        normalized.includes("clear")
      ) {
        setIsTimerRunning(false);
        setTimerLeft(25 * 60);
        setTimerDuration(25 * 60);
        return {
          matched: true,
          feedback: "Command Executed: Reset focus timer.",
          reply: "Focus timer has been successfully reset to twenty-five minutes."
        };
      }
    }

    // 2. SCRATCHPAD NOTES: Match note creations
    if (
      normalized.startsWith("create note") || 
      normalized.startsWith("take note") || 
      normalized.startsWith("add note") || 
      normalized.startsWith("write down")
    ) {
      let noteContent = "";
      const prefixes = ["create note", "take note", "add note", "write down"];
      for (const prefix of prefixes) {
        if (normalized.startsWith(prefix)) {
          noteContent = text.substring(prefix.length).trim().replace(/^[:\s,-]+/, "");
          break;
        }
      }

      if (noteContent) {
        addScratchnote(noteContent);
        return {
          matched: true,
          feedback: `Command Executed: Added Note "${noteContent.substring(0, 30)}..."`,
          reply: `I have added "${noteContent.substring(0, 30)}" to your desktop scratchpad.`
        };
      }
    }

    if (
      normalized === "clear notes" || 
      normalized === "delete all notes" || 
      normalized === "empty notes"
    ) {
      clearAllNotes();
      return {
        matched: true,
        feedback: "Command Executed: Cleared scratchpad.",
        reply: "I have emptied all notes from your desktop scratchpad."
      };
    }

    // 3. CLIPBOARD HELPER: Match copy response
    if (
      normalized === "copy response" || 
      normalized === "copy that" || 
      normalized === "copy answer"
    ) {
      const lastAssistantResponse = [...messages]
        .reverse()
        .find(m => m.role === "assistant" && !m.isCommand);

      if (lastAssistantResponse) {
        navigator.clipboard.writeText(lastAssistantResponse.content);
        return {
          matched: true,
          feedback: "Command Executed: Copied last response.",
          reply: "I've successfully copied my last response to your clipboard."
        };
      }
    }

    return null;
  };

  // Master send message flow
  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setApiError(null);
    stopCurrentPlayback();

    // 1. Push user message immediately
    setMessages(prev => [...prev, { role: "user", content: trimmed }]);
    setInputText("");

    // 2. Parse active desktop commands
    const commandResult = parseDesktopCommands(trimmed);
    if (commandResult) {
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: commandResult.feedback,
        isCommand: true 
      }]);
      await executeVoiceSynthesis(commandResult.reply);
      return;
    }

    // 3. Normal AI query routing
    setIsThinking(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          language: selectedLanguage
        })
      });

      const data = await response.json();
      setIsThinking(false);

      if (data.error) {
        setApiError(data.error);
        return;
      }

      if (data.reply) {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
        await executeVoiceSynthesis(data.reply);
      }
    } catch (err: any) {
      console.error("Chat request failed:", err);
      setApiError(err.message || "An unexpected error occurred while communicating with Groq.");
      setIsThinking(false);
    }
  };

  // Execute server-side search querying Google (Gemini Grounding) or DuckDuckGo scraper
  const handleWebSearchExecute = async (queryToSearch?: string) => {
    const q = queryToSearch || searchQuery;
    const trimmed = q.trim();
    if (!trimmed) return;

    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setSearchAnswer(null);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, engine: searchEngine })
      });

      const data = await res.json();
      setIsSearching(false);

      if (data.error) {
        setSearchError(data.error);
        return;
      }

      setSearchAnswer(data.answer);
      setSearchResults(data.results || []);

      // Voice the summary search response aloud
      if (data.answer) {
        await executeVoiceSynthesis(data.answer);
      }
    } catch (err: any) {
      console.error("Web Search failed:", err);
      setSearchError(err.message || "Failed to execute search. Check server connectivity.");
      setIsSearching(false);
    }
  };

  // Test the selected prebuilt voice
  const triggerVoiceTest = async () => {
    if (isSpeaking) {
      stopCurrentPlayback();
      return;
    }
    const sampleText = `Hello. This is the ${selectedVoice} model speaker voice config.`;
    await executeVoiceSynthesis(sampleText);
  };

  // Copy AI response manually
  const copyResponseText = (content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  // Copy unique Note item
  const copyNoteText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNoteId(id);
    setTimeout(() => setCopiedNoteId(null), 2000);
  };

  // Direct widget buttons for presets
  const applyTimerPreset = (minutes: number) => {
    setIsTimerRunning(false);
    setTimerDuration(minutes * 60);
    setTimerLeft(minutes * 60);
  };

  // Render countdown string
  const formatTimerLabel = () => {
    const mins = Math.floor(timerLeft / 60);
    const secs = timerLeft % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate Pomodoro ring progress percent
  const getTimerProgressPercent = () => {
    return ((timerDuration - timerLeft) / timerDuration) * 100;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200 relative overflow-x-hidden">
      
      {/* Symmetrical subtle linear gradient background overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-950/20 via-zinc-950 to-zinc-950 pointer-events-none" />

      {/* Primary Top Header Bar: Responsive layout for Desktop, Tablet, and Mobile */}
      <header className="border-b border-zinc-850 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-8 py-4 flex flex-col xl:flex-row justify-between items-center gap-4 transition-all" id="aura-header">
        
        {/* Nav Logo block with rotated geometry and responsive subtitle */}
        <div className="flex items-center gap-3 w-full xl:w-auto justify-between xl:justify-start">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-sm rotate-45 flex items-center justify-center shadow-lg shadow-indigo-500/10">
              <div className="w-2.5 h-2.5 bg-white rounded-full -rotate-45" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight uppercase text-zinc-100 flex items-center gap-2">
                Aura <span className="text-zinc-500 font-normal tracking-wide normal-case underline decoration-indigo-500 underline-offset-4 pl-1">Assistant</span>
              </h1>
            </div>
          </div>

          {/* Quick Responsive Devicetype Icon Status indicator on header */}
          <div className="flex items-center gap-2 bg-zinc-900/60 px-2.5 py-1 rounded-full border border-zinc-800 text-zinc-400">
            <span className="hidden sm:inline text-[9px] font-mono uppercase tracking-widest">Active Device:</span>
            <span className="xl:hidden">
              <Smartphone className="w-3.5 h-3.5 text-indigo-400 sm:hidden" />
              <Tablet className="w-3.5 h-3.5 text-indigo-400 hidden sm:inline xl:hidden" />
            </span>
            <span className="hidden xl:inline">
              <Monitor className="w-3.5 h-3.5 text-indigo-400" />
            </span>
          </div>
        </div>

        {/* Header Symmetrical Statistics and State with flex-wrap and responsive columns */}
        <div className="flex flex-wrap items-center justify-center xl:justify-end gap-3 sm:gap-6 w-full xl:w-auto text-neutral-100 border-t border-zinc-900 pt-3 xl:pt-0 xl:border-0">
          
          {/* Symmetrical Spec: System Clocks */}
          <div className="flex flex-col items-center sm:items-end bg-zinc-900/30 p-2 sm:p-0 rounded-lg sm:bg-transparent">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest leading-none mb-1">STATION CLOCKS</span>
            <span className="text-xs sm:text-sm font-mono text-zinc-300 flex items-center gap-1.5">
              <span>{localTime}</span>
              <span className="text-zinc-700">|</span>
              <span className="text-zinc-500 text-[11px]">{utcTime}</span>
            </span>
          </div>

          {/* New Device Metric Integration: Battery Status */}
          <div className="flex flex-col items-center sm:items-end border-l border-zinc-900 pl-3 sm:pl-6">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest leading-none mb-1">Power Metric</span>
            <div className="flex items-center gap-1.5">
              {batteryState ? (
                <>
                  <span className="text-xs font-mono text-zinc-300">{batteryState.level}%</span>
                  {batteryState.charging ? (
                    <BatteryCharging className="w-4 h-4 text-emerald-400 animate-pulse" />
                  ) : batteryState.level < 20 ? (
                    <BatteryWarning className="w-4 h-4 text-amber-500 animate-bounce" />
                  ) : (
                    <Battery className="w-4 h-4 text-zinc-400" />
                  )}
                </>
              ) : (
                <span className="text-xs font-mono text-zinc-500">Unconnected</span>
              )}
            </div>
          </div>

          {/* New Device Metric Integration: Geolocation tracker */}
          <div className="flex flex-col items-center sm:items-end border-l border-zinc-900 pl-3 sm:pl-6">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest leading-none mb-1">GPS Coordinates</span>
            <button 
              onClick={() => { triggerHaptic(15); requestDeviceLocation(); }}
              className="flex items-center gap-1 hover:text-indigo-400 transition-colors focus:outline-none"
              title="Click to recalculate GPS position"
            >
              {locationState ? (
                <>
                  <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[10px] font-mono text-zinc-300 truncate max-w-[100px]">
                    {locationState.latitude.toFixed(3)}, {locationState.longitude.toFixed(3)}
                  </span>
                </>
              ) : (
                <>
                  <MapPin className="w-3.5 h-3.5 text-zinc-600 animate-pulse" />
                  <span className="text-[10px] font-mono text-zinc-500">Locating...</span>
                </>
              )}
            </button>
          </div>

          {/* Symmetrical Spec: Input Language */}
          <div className="flex flex-col items-center sm:items-end border-l border-zinc-900 pl-3 sm:pl-6" id="language-selection">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest leading-none mb-1">System Language</span>
            <div className="flex items-center gap-1 mt-0.5">
              <select 
                value={selectedLanguage} 
                onChange={(e) => { triggerHaptic(15); setSelectedLanguage(e.target.value); }}
                className="bg-transparent text-[11px] text-indigo-400 font-semibold focus:outline-none cursor-pointer font-mono"
              >
                <option value="en-US" className="bg-zinc-900 text-zinc-200">English (US)</option>
                <option value="en-IN" className="bg-zinc-900 text-zinc-200">English (India)</option>
                <option value="hi-IN" className="bg-zinc-900 text-zinc-200">Hindi (हिंदी)</option>
                <option value="kn-IN" className="bg-zinc-900 text-zinc-200">Kannada (ಕನ್ನಡ)</option>
              </select>
            </div>
          </div>

          {/* Symmetrical Spec: Voice Speaker */}
          <div className="flex flex-col items-center sm:items-end border-l border-zinc-900 pl-3 sm:pl-6" id="voice-selection">
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest leading-none mb-1">Speaker Voice</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <select 
                value={selectedVoice} 
                onChange={(e) => { triggerHaptic(15); setSelectedVoice(e.target.value); }}
                className="bg-transparent text-[11px] text-indigo-400 font-semibold focus:outline-none cursor-pointer font-mono"
              >
                <option value="Kore" className="bg-zinc-900 text-zinc-200">Kore (Balanced)</option>
                <option value="Zephyr" className="bg-zinc-900 text-zinc-200">Zephyr (Cheerfully)</option>
                <option value="Puck" className="bg-zinc-900 text-zinc-200">Puck (Crisp)</option>
                <option value="Charon" className="bg-zinc-900 text-zinc-200">Charon (Deep)</option>
                <option value="Fenrir" className="bg-zinc-900 text-zinc-200">Fenrir (Warm)</option>
              </select>
              <button 
                onClick={triggerVoiceTest}
                className={`p-0.5 rounded hover:bg-zinc-900 transition-colors ${isSpeaking ? "text-red-400 animate-pulse" : "text-zinc-500 hover:text-white"}`}
                title="Test Speaker Config"
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Symmetrical Spec: Wireless connectivity status indicator */}
          <div className="flex items-center gap-3 border-l border-zinc-900 pl-3 sm:pl-6">
            <div className="flex flex-col items-center sm:items-end mr-0.5">
              <span className="text-[9px] text-zinc-500 uppercase tracking-widest leading-none mb-1">AURANET STATUS</span>
              <span className={`text-xs font-mono font-bold ${isOnline ? "text-indigo-400" : "text-red-400"}`}>
                {isOnline ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
            <div className="relative flex h-3 w-3 justify-center items-center">
              {isOnline ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]"></span>
                </>
              ) : (
                <>
                  <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.6)]"></span>
                </>
              )}
            </div>
          </div>

        </div>
      </header>

      {/* Main Container: Symmetrical Split Grid */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10" id="aura-desktop-grid">
        
        {/* Banner if credentials are unconfigured */}
        {apiError && (
          <div className="lg:col-span-12 p-5 bg-yellow-950/20 border border-yellow-850 rounded-xl flex items-start gap-4 text-yellow-300 shadow-xl" id="aura-api-notifier">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-yellow-500" />
            <div className="text-sm flex-1">
              <span className="font-semibold uppercase tracking-wider text-xs block mb-1">Aura completion warning:</span> {apiError}
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                Please attach <code className="px-1.5 py-0.5 bg-zinc-900/80 rounded font-mono text-indigo-400">GROQ_API_KEY</code> and <code className="px-1.5 py-0.5 bg-zinc-900/80 rounded font-mono text-indigo-400">GEMINI_API_KEY</code> within your Secrets tab.
              </p>
            </div>
            <button onClick={() => setApiError(null)} className="p-1 hover:bg-zinc-900 rounded">
              <X className="w-4 h-4 text-zinc-500 hover:text-white" />
            </button>
          </div>
        )}

        {/* LEFT COLUMN (5 Columns): Elegant Symmetrical Orb Core & Audio Terminal */}
        <section className="lg:col-span-5 flex flex-col gap-8" id="aura-assistant-panel">
          
          {/* Geometric Orb visualization widget card */}
          <div className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-8 flex flex-col items-center justify-between min-h-[380px] relative overflow-hidden group shadow-xl">
            
            <div className="w-full flex justify-between items-center z-10">
              <span className="text-[10px] font-mono tracking-widest text-indigo-400 flex items-center gap-1.5 uppercase">
                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                Geometric Oscillator
              </span>
              <span className="text-zinc-500 font-mono text-[10px] tracking-wide uppercase">
                {isListening ? "MICROPHONE ON" : isThinking ? "PROCESSING" : isGeneratingVoice ? "SYNTHESIZING" : isSpeaking ? "PLAYING AUDIO" : "IDLE STATION"}
              </span>
            </div>

            {/* Concentric Circle Symmetrical Core Rings */}
            <div className="relative py-8 flex items-center justify-center w-full" id="aura-glowing-orb">
              
              {/* Pulsing state ripples backdrops */}
              <AnimatePresence>
                {isListening && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1.6, opacity: [0, 0.35, 0] }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "easeOut" }}
                    className="absolute w-56 h-56 rounded-full bg-rose-500/10 blur-xl pointer-events-none"
                  />
                )}
                {isSpeaking && (
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1.8, opacity: [0, 0.45, 0] }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                    className="absolute w-56 h-56 rounded-full bg-indigo-500/10 blur-xl pointer-events-none"
                  />
                )}
              </AnimatePresence>

              {/* Symmetrical nested rings layout of theme */}
              <div className="w-[280px] h-[280px] min-[360px]:w-[310px] min-[360px]:h-[310px] rounded-full border border-zinc-800/80 flex items-center justify-center relative">
                
                {/* Secondary middle ring */}
                <div className="w-[220px] h-[220px] min-[360px]:w-[250px] min-[360px]:h-[250px] rounded-full border border-zinc-700/60 flex items-center justify-center relative">
                  
                  {/* Third deep indigo shaded ring */}
                  <div className="w-[160px] h-[160px] min-[360px]:w-[190px] min-[360px]:h-[190px] rounded-full border border-indigo-950/80 flex items-center justify-center bg-zinc-950/90 shadow-2xl relative">
                    
                    {/* Interactive Core Mic Activation Circle */}
                    <motion.div
                      animate={
                        isListening
                          ? { scale: [1, 1.12, 1], rotate: 45 }
                          : isThinking
                          ? { scale: [1, 1.05, 1], rotate: -45 }
                          : isGeneratingVoice
                          ? { scale: [1.02, 1.08, 1.02], rotate: 15 }
                          : isSpeaking
                          ? { scale: [1.02, 1.08, 1.02] }
                          : { scale: [1, 1.03, 1] }
                      }
                      transition={
                        isListening
                          ? { repeat: Infinity, duration: 1.5, ease: "easeInOut" }
                          : isThinking
                          ? { repeat: Infinity, duration: 2, ease: "easeInOut" }
                          : isGeneratingVoice
                          ? { repeat: Infinity, duration: 1, ease: "easeInOut" }
                          : isSpeaking
                          ? { repeat: Infinity, duration: 0.8, ease: "easeInOut" }
                          : { repeat: Infinity, duration: 4, ease: "easeInOut" }
                      }
                      className={`w-28 h-28 min-[360px]:w-32 min-[360px]:h-32 rounded-full flex flex-col items-center justify-center cursor-pointer z-10 transition-colors duration-500 shadow-2xl relative ${
                        isListening 
                          ? "bg-rose-950/30 border border-rose-500 shadow-rose-500/10"
                          : isThinking
                          ? "bg-indigo-950/40 border border-indigo-400 shadow-indigo-500/10"
                          : isGeneratingVoice
                          ? "bg-indigo-900/30 border border-indigo-500 shadow-indigo-500/10"
                          : isSpeaking
                          ? "bg-zinc-900 border border-indigo-500/50 shadow-indigo-500/10"
                          : "bg-zinc-900 border border-zinc-800 hover:border-indigo-500/40 hover:bg-zinc-900/80"
                      }`}
                      onClick={toggleMicrophone}
                    >
                      {/* Audio waveform animations inside the inner ring */}
                      {isSpeaking && (
                        <div className="flex items-center gap-1.5 h-10 absolute bottom-3 justify-center w-full">
                          <motion.div animate={{ height: [4, 20, 4] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-0.5 h-4 bg-indigo-500 rounded-full" />
                          <motion.div animate={{ height: [8, 32, 8] }} transition={{ repeat: Infinity, duration: 0.5, delay: 0.1 }} className="w-0.5 h-8 bg-indigo-400 rounded-full" />
                          <motion.div animate={{ height: [6, 24, 6] }} transition={{ repeat: Infinity, duration: 0.7, delay: 0.2 }} className="w-0.5 h-6 bg-indigo-500 rounded-full" />
                        </div>
                      )}

                      {/* Icon inside circle */}
                      <div className="z-10 flex flex-col items-center gap-2">
                        <AnimatePresence mode="wait">
                          {isListening ? (
                            <motion.div
                              key="mic-listening"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                            >
                              <Mic className="w-8 h-8 text-rose-400 animate-pulse" />
                            </motion.div>
                          ) : isGeneratingVoice ? (
                            <motion.div
                              key="mic-generating"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                            >
                              <Sparkles className="w-8 h-8 text-indigo-400 animate-pulse" />
                            </motion.div>
                          ) : isThinking ? (
                            <motion.div
                              key="mic-thinking"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                            >
                              <Sparkles className="w-8 h-8 text-indigo-400 animate-spin" />
                            </motion.div>
                          ) : isSpeaking ? (
                            <motion.div
                              key="mic-speaking"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                              className="mb-4"
                            >
                              <Volume2 className="w-8 h-8 text-indigo-400 animate-bounce" />
                            </motion.div>
                          ) : (
                            <motion.div
                              key="mic-idle"
                              initial={{ opacity: 0, scale: 0.5 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.5 }}
                            >
                              <MicOff className="w-8 h-8 text-zinc-500 group-hover:text-indigo-400 transition-colors" />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                    </motion.div>

                  </div>
                </div>

                {/* Symmetrical Accents on rings matching Geometric Balance guidelines */}
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-[9px] uppercase tracking-wider text-zinc-400 font-mono">
                  {isListening ? "Listening" : isThinking ? "Processing" : isGeneratingVoice ? "Preparing Voice" : isSpeaking ? "Synthesizing" : "Ready State"}
                </div>

                <div className="absolute -bottom-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full text-[9px] uppercase tracking-wider text-indigo-400 font-mono">
                  {isListening ? "Gain Auto" : isSpeaking ? "Voice: active" : "SPACEBAR MIC"}
                </div>

              </div>

            </div>

            {/* Tap Voice command action controller */}
            <div className="w-full flex flex-col items-center gap-3 z-10" id="mic-controls">
              <button
                onClick={toggleMicrophone}
                className={`w-full py-3 rounded-xl font-medium tracking-wider flex items-center justify-center gap-2.5 transition-all outline-none border ${
                  isListening
                    ? "bg-rose-950/80 hover:bg-rose-900/90 text-white border-rose-500/50 shadow-md shadow-rose-500/10"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-500/40 hover:shadow-indigo-500/10 shadow-lg"
                }`}
              >
                {isListening ? (
                  <>
                    <Mic className="w-4 h-4 text-white" />
                    <span className="uppercase text-xs font-mono tracking-widest">TAP TO COMPLETE</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 text-white" />
                    <span className="uppercase text-xs font-mono tracking-widest">START RECORD VOICE</span>
                  </>
                )}
              </button>
              
              <div className="flex justify-between items-center w-full px-1 text-[10px] font-mono text-zinc-500">
                <span>SHORTCUT KEY: SPACEBAR</span>
                {!recognitionSupported && <span className="text-rose-400 font-bold">API NOT SUPPORTED</span>}
              </div>
            </div>
          </div>

          {/* Interactive Console: styled with the Geometric theme highlight block */}
          <div className="flex-1 bg-zinc-900/35 border border-zinc-850 rounded-2xl p-5 flex flex-col h-[340px] shadow-lg" id="aura-terminal">
            <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2 font-mono">
              <span className="w-1 h-3.5 bg-indigo-500" /> Recent Interaction / Console
            </h3>

            {/* Logs transcript viewer list */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 font-sans text-xs scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              {messages.map((msg, i) => (
                <div 
                  key={i} 
                  className={`flex flex-col gap-1 rounded-xl p-3 border transition-colors ${
                    msg.role === "user"
                      ? "bg-zinc-950/80 border-zinc-800 ml-8 text-zinc-200"
                      : msg.isCommand
                      ? "bg-indigo-950/20 border-indigo-900/50 text-indigo-300"
                      : "bg-zinc-900/30 border-zinc-850/60 mr-8 text-zinc-300"
                  }`}
                >
                  <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500">
                    <span className={msg.role === "user" ? "text-indigo-400" : msg.isCommand ? "text-indigo-300 font-bold" : "text-zinc-500"}>
                      {msg.role === "user" ? "USER PROMPT" : msg.isCommand ? "⚡ DESKTOP COMMAND" : "AURA RESPONDENT"}
                    </span>
                    {msg.role === "assistant" && !msg.isCommand && (
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => { triggerHaptic(10); copyResponseText(msg.content); }}
                          className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 focus:outline-none"
                          title="Copy Response Text"
                        >
                          {copiedResponse ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button 
                          onClick={() => { triggerHaptic(15); handleDeviceShare("Aura Response", msg.content); }}
                          className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5 focus:outline-none"
                          title="Share Response via native Sheet"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="whitespace-pre-line leading-relaxed mt-1 text-xs text-zinc-300 font-normal">
                    {msg.content}
                  </p>
                </div>
              ))}
              
              {isThinking && (
                <div className="flex items-center gap-2 bg-zinc-900/20 border border-zinc-850 mr-8 rounded-xl p-3">
                  <span className="text-[10px] font-mono text-zinc-400">Aura is thinking</span>
                  <span className="flex gap-1">
                    <span className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1 h-1 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                </div>
              )}
            </div>

            {/* Custom Input Console placeholder */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage(inputText);
              }} 
              className="mt-3 flex gap-2 border-t border-zinc-800/80 pt-3"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Instruct voice command or ask questions..."
                className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-indigo-500/50 rounded-lg px-3 py-2 text-xs focus:outline-none placeholder:text-zinc-650 text-zinc-200"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-850 active:bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono text-zinc-300 transition-all"
              >
                SUBMIT
              </button>
            </form>
          </div>
        </section>


        {/* RIGHT COLUMN (7 Columns): Widgets & Desktop Productivity Hub */}
        <section className="lg:col-span-7 flex flex-col gap-8" id="aura-widgets-panel">
          
          {/* Bento Widgets Row */}
          <div className="grid grid-cols-1 gap-8">
            
            {/* WIDGET 1: Pomodoro Focus clock styled in Geometric symmetry */}
            <div className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-6 flex flex-col shadow-xl relative overflow-hidden h-[300px]">
              
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 mb-3">
                <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-2 font-mono">
                  <span className="w-1 h-3.5 bg-indigo-500"></span> App Focus Timer
                </h3>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded uppercase ${isTimerRunning ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-zinc-800 text-zinc-400"}`}>
                  {isTimerRunning ? "ACTIVE" : "STANDBY"}
                </span>
              </div>

              {/* Concentric Countdown Circle */}
              <div className="flex-1 flex items-center justify-around py-2">
                
                {/* SVG Progress Circle built inside theme styling */}
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                    <circle
                      cx="72"
                      cy="72"
                      r="62"
                      className="stroke-zinc-850"
                      strokeWidth="5"
                      fill="transparent"
                    />
                    <motion.circle
                      cx="72"
                      cy="72"
                      r="62"
                      className="stroke-indigo-500"
                      strokeWidth="5"
                      fill="transparent"
                      strokeDasharray="390"
                      animate={{ strokeDashoffset: (390 * (100 - getTimerProgressPercent())) / 100 }}
                      transition={{ ease: "linear", duration: 1 }}
                    />
                  </svg>
                  
                  {/* Concentric countdown numbers */}
                  <div className="text-center z-10">
                    <h4 className="text-2xl font-mono font-bold text-zinc-100 tracking-wider font-mono">{formatTimerLabel()}</h4>
                    <p className="text-[9px] font-mono text-zinc-500 mt-0.5 uppercase tracking-wide">
                      {Math.ceil(timerDuration / 60)} MIN CYCLE
                    </p>
                  </div>
                </div>

                {/* Symmetrical clock controller triggers */}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setIsTimerRunning(!isTimerRunning)}
                    className={`p-3 rounded-xl flex items-center justify-center transition-all ${
                      isTimerRunning
                        ? "bg-zinc-800 hover:bg-zinc-750 text-amber-500 border border-zinc-700/60"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white border border-indigo-500"
                    }`}
                    title={isTimerRunning ? "Pause Timer" : "Start timer countdown"}
                  >
                    {isTimerRunning ? <Pause className="w-4 h-4 text-amber-500" /> : <Play className="w-4 h-4 fill-white text-white" />}
                  </button>

                  <button
                    onClick={() => {
                      setIsTimerRunning(false);
                      setTimerLeft(timerDuration);
                    }}
                    className="p-3 rounded-xl bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white transition-all animate-none"
                    title="Reset focus session"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Symmetrical Presets Buttons */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                <button 
                  onClick={() => applyTimerPreset(15)} 
                  className="py-1 px-2.5 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400 hover:text-indigo-400 transition-colors"
                >
                  15m Short
                </button>
                <button 
                  onClick={() => applyTimerPreset(25)} 
                  className="py-1 px-2.5 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400 hover:text-indigo-400 transition-colors"
                >
                  25m Focus
                </button>
                <button 
                  onClick={() => applyTimerPreset(50)} 
                  className="py-1 px-2.5 rounded bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-[10px] font-mono text-zinc-400 hover:text-indigo-400 transition-colors"
                >
                  50m Deep
                </button>
              </div>
            </div>

          </div>

          {/* WIDGET 2: Desktop Search Engine (Google Search Grounding & DuckDuckGo) */}
          <div className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-6 flex flex-col shadow-xl relative overflow-hidden" id="aura-search-widget">
            
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 mb-3">
              <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-2 font-mono">
                <span className="w-1 h-3.5 bg-indigo-505 bg-indigo-500" /> Aura Search Engine
              </h3>
              
              {/* Engine Selector */}
              <div className="flex bg-zinc-950/80 p-0.5 rounded-lg border border-zinc-800 animate-none" id="search-engine-selector">
                <button
                  type="button"
                  onClick={() => setSearchEngine("google")}
                  className={`px-2 py-1 text-[9px] font-mono font-semibold rounded transition-colors ${searchEngine === "google" ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  GOOGLE
                </button>
                <button
                  type="button"
                  onClick={() => setSearchEngine("duckduckgo")}
                  className={`px-2 py-1 text-[9px] font-mono font-semibold rounded transition-colors ${searchEngine === "duckduckgo" ? "bg-indigo-600 text-white shadow" : "text-zinc-400 hover:text-zinc-200"}`}
                >
                  DUCKDUCKGO
                </button>
              </div>
            </div>

            {/* Search Form and Input */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                handleWebSearchExecute();
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search the web using ${searchEngine === "google" ? "Google" : "DuckDuckGo"}...`}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-indigo-500/50 rounded-xl pl-9 pr-3 py-2 text-xs focus:outline-none placeholder:text-zinc-650 text-zinc-200"
                />
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 border border-indigo-500 text-white rounded-xl text-xs font-semibold hover:shadow-indigo-500/10 hover:shadow-lg transition-all flex items-center gap-1.5"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>SEARCHING...</span>
                  </>
                ) : (
                  <span>SEARCH</span>
                )}
              </button>
            </form>

            {/* Dynamic Results Display */}
            <div className="mt-4 flex-1 flex flex-col justify-start min-h-[140px] max-h-[300px] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
              {isSearching && (
                <div className="flex-1 flex flex-col items-center justify-center py-6 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
                  <p className="text-xs text-zinc-400 font-mono">Crawling results using {searchEngine === "google" ? "Google Grounding Network" : "DuckDuckGo Proxy"}...</p>
                </div>
              )}

              {searchError && (
                <div className="p-3 bg-red-950/25 border border-red-900/40 text-red-400 rounded-xl text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-550" />
                  <div>
                    <p className="font-semibold uppercase tracking-wider text-[10px]">Search Operation Exception:</p>
                    <p className="mt-0.5">{searchError}</p>
                  </div>
                </div>
              )}

              {!isSearching && !searchError && !searchAnswer && searchResults.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center py-8 text-center text-zinc-600">
                  <Globe className="w-7 h-7 text-zinc-800 mb-2" />
                  <p className="text-xs">No active search queries executed</p>
                  <p className="text-[10px] text-zinc-600 font-mono mt-1">Submit a search query above to view inline summaries & links</p>
                </div>
              )}

              {/* Show structured summarized answer */}
              {searchAnswer && !isSearching && (
                <div className="mb-4 p-3.5 bg-zinc-950 border border-zinc-850 rounded-xl">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-indigo-400 font-bold block mb-1">Aura Answer Summary</span>
                  <p className="text-xs text-zinc-300 leading-relaxed font-sans">{searchAnswer}</p>
                </div>
              )}

              {/* Show list of crawled URLs */}
              {searchResults.length > 0 && !isSearching && (
                <div className="space-y-2">
                  <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-550 font-semibold block px-1 mb-1">Source Results</span>
                  {searchResults.map((result, idx) => (
                    <a
                      key={idx}
                      href={result.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 bg-zinc-900/35 hover:bg-zinc-900/85 border border-zinc-850/60 hover:border-zinc-800 rounded-xl transition-all"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-200 hover:text-indigo-400 transition-colors truncate">
                          {result.title}
                        </span>
                        <ExternalLink className="w-3 h-3 text-zinc-600 flex-shrink-0" />
                      </div>
                      <span className="text-[10px] text-zinc-500 block truncate mt-0.5 font-mono">
                        {result.url}
                      </span>
                      {result.snippet && result.snippet !== "Verified search source" && (
                        <p className="text-[11px] text-zinc-400 mt-1 lines-clamp-2 leading-relaxed">
                          {result.snippet}
                        </p>
                      )}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* WIDGET 3: Symmetrical Desktop Checklist Scratchpad */}
          <div className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-6 flex flex-col shadow-xl flex-1 min-h-[300px]">
            
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <h3 className="text-sm font-mono text-indigo-400 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                DESKTOP SCRATCHPAD
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-mono text-zinc-500 tracking-wide uppercase">{notes.length} ACTIVE NOTES</span>
                {notes.length > 0 && (
                  <button 
                    onClick={clearAllNotes}
                    className="text-[10px] font-mono font-semibold text-red-400 hover:text-red-300 hover:underline flex items-center"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Quick manual text note checklist form */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (manualNoteText.trim()) {
                  addScratchnote(manualNoteText);
                  setManualNoteText("");
                }
              }} 
              className="flex gap-2 mb-4"
            >
              <input
                type="text"
                value={manualNoteText}
                onChange={(e) => setManualNoteText(e.target.value)}
                placeholder="Insert scratchpad notes or checklist tasks..."
                className="flex-1 bg-zinc-950 border border-zinc-800 focus:border-indigo-500/30 rounded-lg px-3 py-2 text-xs focus:outline-none placeholder:text-zinc-650 text-zinc-200"
              />
              <button
                type="submit"
                className="px-3.5 bg-indigo-900/20 hover:bg-indigo-900/35 border border-indigo-700/30 rounded-lg text-xs font-mono font-medium text-indigo-400 transition-all flex items-center justify-center cursor-pointer"
              >
                <Plus className="w-4 h-4 text-indigo-400" />
              </button>
            </form>

            {/* Notes checklist stack holder */}
            <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[220px] pr-1 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent bg-zinc-950/20 rounded-xl p-3 border border-zinc-850/60">
              {notes.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-zinc-600 font-sans text-xs gap-1.5">
                  <FileText className="w-8 h-8 text-zinc-700 stroke-1" />
                  <p className="font-light">No notes in the scratchpad.</p>
                  <p className="text-zinc-700 text-[10px] font-mono uppercase tracking-wider">Say "create note [your task]" to auto-generate</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {notes.map((note) => (
                    <motion.div
                      key={note.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="p-3 bg-zinc-950 border border-zinc-850 hover:border-zinc-800 rounded-xl flex items-start justify-between gap-3 group relative hover:bg-zinc-900/20 transition-all"
                    >
                      <div className="flex-1 min-w-0 pr-8">
                        <span className="text-[10px] font-mono text-zinc-500">{note.timestamp}</span>
                        <p className="text-xs text-zinc-300 font-normal mt-0.5 leading-relaxed break-words whitespace-pre-line">
                          {note.content}
                        </p>
                      </div>
 
                      {/* Floating actions */}
                      <div className="opacity-35 group-hover:opacity-100 flex items-center gap-1.5 transition-all absolute right-2.5 top-2.5 bg-zinc-950 group-hover:bg-zinc-900 group-hover:z-10 p-0.5 rounded border border-zinc-800">
                        <button
                          onClick={() => { triggerHaptic(10); copyNoteText(note.id, note.content); }}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors focus:outline-none"
                          title="Copy Sticky Content"
                        >
                          {copiedNoteId === note.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => { triggerHaptic(15); handleDeviceShare("Aura Note", note.content); }}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-white transition-colors focus:outline-none"
                          title="Share Note"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { triggerHaptic(20); deleteScratchnote(note.id); }}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-rose-450 transition-colors focus:outline-none"
                          title="Delete note"
                        >
                          <Trash2 className="w-3.5 h-3.5 hover:text-rose-400" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        </section>

      </main>

      {/* Symmetrical Balanced Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 px-8 py-5 text-center text-[10px] tracking-wider font-mono text-zinc-600 flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto w-full gap-4 transition-all">
        <div>
          <span>⌥ SPACEBAR SHORTCUT: ACTIVATE/DEACTIVATE SYSTEM MICROPHONE INPUT</span>
        </div>
        <div className="flex gap-4">
          <span className="flex items-center gap-1.5 bg-zinc-900 px-2 py-1 rounded text-zinc-500 border border-zinc-850">
            COMPLETION: GROQ LLAMA
          </span>
          <span className="flex items-center gap-1.5 bg-zinc-900 px-2 py-1 rounded text-zinc-500 border border-zinc-850">
            TTS: GEMINI VOICE PLUGINS
          </span>
        </div>
      </footer>

    </div>
  );
}
