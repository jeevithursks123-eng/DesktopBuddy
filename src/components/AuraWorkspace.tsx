import React, { useState, useEffect } from "react";
import { 
  googleSignIn, 
  googleSignOut, 
  getAccessToken, 
  initAuth 
} from "../firebase";
import { 
  listEmails, 
  getFullEmail, 
  sendEmail, 
  createDraft, 
  saveChatToDrive, 
  loadChatFromDrive,
  EmailMessage,
  searchDriveFiles
} from "../workspace";
import { 
  Mail, LogIn, LogOut, RefreshCw, CloudLightning, 
  CloudRain, Save, Download, FileText, Check, AlertCircle,
  ChevronRight, Sparkles, Send, Trash2, ArrowRightLeft,
  Search, X, ExternalLink
} from "lucide-react";
import { User } from "firebase/auth";

interface AuraWorkspaceProps {
  onSyncNotes: (notes: any[]) => void;
  onSyncMessages: (messages: any[]) => void;
  currentNotes: any[];
  currentMessages: any[];
  onTriggerSpeech: (text: string) => void;
  onAddAssistantMessage: (text: string) => void;
}

export default function AuraWorkspace({
  onSyncNotes,
  onSyncMessages,
  currentNotes,
  currentMessages,
  onTriggerSpeech,
  onAddAssistantMessage
}: AuraWorkspaceProps) {
  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(true);

  // Gmail states
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [isLoadingEmails, setIsLoadingEmails] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [emailQuery, setEmailQuery] = useState("");

  // Drive states
  const [syncStatus, setSyncStatus] = useState<"idle" | "saving" | "restoring" | "saved" | "restored" | "error">("idle");
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // New Draft mail inputs
  const [isComposing, setIsComposing] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [isSendingMail, setIsSendingMail] = useState(false);
  const [mailSentSuccess, setMailSentSuccess] = useState(false);

  // Initialize auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, cachedToken) => {
        setCurrentUser(user);
        setToken(cachedToken);
        setNeedsAuth(false);
      },
      () => {
        setCurrentUser(null);
        setToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync emails on login
  useEffect(() => {
    if (token) {
      handleLoadEmails();
    }
  }, [token]);

  // Auth operations
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setSyncStatus("idle");
    try {
      const result = await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        setToken(result.accessToken);
        setNeedsAuth(false);
        onAddAssistantMessage(`Cloud connected successfully! Welcome ${result.user.displayName || "Explorer"}. I've synchronized your secure sessions.`);
        onTriggerSpeech(`Cloud connected. Welcome back, ${result.user.displayName || "user"}.`);
      }
    } catch (err: any) {
      console.error("Login authorization request failed", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await googleSignOut();
      setCurrentUser(null);
      setToken(null);
      setNeedsAuth(true);
      setEmails([]);
      setSelectedEmail(null);
      onAddAssistantMessage("Aura has been signed out and disconnected from Google Workspace resources safely.");
      onTriggerSpeech("Workspace session disconnected.");
    } catch (err) {
      console.error("Failed to sign out session context", err);
    }
  };

  // Fetch recent emails
  const handleLoadEmails = async () => {
    if (!token) return;
    setIsLoadingEmails(true);
    try {
      const list = await listEmails(token);
      setEmails(list);
    } catch (err) {
      console.error("Unable to load Gmail data", err);
    } finally {
      setIsLoadingEmails(false);
    }
  };

  // Load precise email details
  const handleViewEmail = async (emailId: string) => {
    if (!token) return;
    try {
      setIsLoadingEmails(true);
      const fullMail = await getFullEmail(token, emailId);
      setSelectedEmail(fullMail);
    } catch (err) {
      console.error("Failed to fetch full email body", err);
    } finally {
      setIsLoadingEmails(false);
    }
  };

  // Summarize email using the AI Voice Assistant
  const handleSummarizeEmail = async (email: EmailMessage) => {
    if (!email) return;
    setIsSummarizing(true);
    try {
      const prompt = `Aura, summarize this email content immediately. Subject: ${email.subject}. From: ${email.from}. Content: ${email.body || email.snippet}`;
      onAddAssistantMessage(`Aura, summarizing email from "${email.from}" regarding "${email.subject}"...`);
      
      // Let standard console logic carry the request
      const chatRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt,
          history: currentMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });
      
      const chatData = await chatRes.json();
      if (chatData.reply) {
        onAddAssistantMessage(chatData.reply);
        await onTriggerSpeech(chatData.reply);
      } else {
        onAddAssistantMessage("I encountered an issue processing the synthesis.");
      }
    } catch (err) {
      console.error("Summarizer tool call error:", err);
    } finally {
      setIsSummarizing(false);
    }
  };

  // Send new custom message or draft
  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !composeTo.trim()) return;

    setIsSendingMail(true);
    try {
      await createDraft(token, composeTo, composeSubject, composeBody);
      setMailSentSuccess(true);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      onAddAssistantMessage(`Gmail draft created successfully for "${composeTo}". Check your Google Mail Drafts folder.`);
      onTriggerSpeech("Created draft in your Google Mail folder.");
      setTimeout(() => {
        setMailSentSuccess(false);
        setIsComposing(false);
      }, 2000);
    } catch (err) {
      console.error("Draft compilation aborted", err);
    } finally {
      setIsSendingMail(false);
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !composeTo.trim()) return;

    const confirmed = window.confirm(`Are you sure you want to send this email to ${composeTo}? This will write and transmit message on your behalf.`);
    if (!confirmed) return;

    setIsSendingMail(true);
    try {
      await sendEmail(token, composeTo, composeSubject, composeBody);
      setMailSentSuccess(true);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      onAddAssistantMessage(`Email successfully dispatched to "${composeTo}".`);
      onTriggerSpeech(`Email sent to ${composeTo}.`);
      setTimeout(() => {
        setMailSentSuccess(false);
        setIsComposing(false);
      }, 2000);
    } catch (err) {
      console.error("Transmission failed", err);
    } finally {
      setIsSendingMail(false);
    }
  };

  // Cloud Drive sync actions
  const handleCloudBackup = async () => {
    if (!token) return;
    setSyncStatus("saving");
    try {
      const res = await saveChatToDrive(token, currentMessages, currentNotes);
      if (res.success) {
        setSyncStatus("saved");
        setLastSyncTime(new Date().toLocaleTimeString());
        onAddAssistantMessage("Your chat history and scratchpad notes have been successfully backed up to Aura_Chat_History.json in your Google Drive.");
        onTriggerSpeech("System database backed up to Google Drive successfully.");
        setTimeout(() => setSyncStatus("idle"), 3000);
      }
    } catch (err) {
      console.error("Cloud drive output backup failed", err);
      setSyncStatus("error");
    }
  };

  const handleCloudRestore = async () => {
    if (!token) return;
    const confirmed = window.confirm("Are you sure you want to restore chat and notes from Google Drive? This will overwrite your active desktop session states.");
    if (!confirmed) return;

    setSyncStatus("restoring");
    try {
      const backup = await loadChatFromDrive(token);
      if (backup) {
        if (backup.messages) onSyncMessages(backup.messages);
        if (backup.notes) onSyncNotes(backup.notes);
        setSyncStatus("restored");
        setLastSyncTime(new Date().toLocaleTimeString());
        onAddAssistantMessage("Loaded and synchronized past sessions successfully.");
        onTriggerSpeech("Previous logs restored from cloud.");
        setTimeout(() => setSyncStatus("idle"), 3500);
      } else {
        alert("No previous backup found at 'Aura_Chat_History.json' inside your Google Drive.");
        setSyncStatus("idle");
      }
    } catch (err) {
      console.error("Cloud restore failed", err);
      setSyncStatus("error");
    }
  };

  // Google Sign-In panel (Not Authenticated State)
  if (needsAuth) {
    return (
      <div className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-6 flex flex-col shadow-xl h-[300px] justify-between relative overflow-hidden" id="workspace-login-widget">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <CloudLightning className="w-40 h-40 text-indigo-500" />
        </div>
        
        <div>
          <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5 mb-3">
            <h3 className="text-[10px] text-zinc-500 uppercase tracking-widest flex items-center gap-2 font-mono">
              <span className="w-1 h-3.5 bg-indigo-500"></span> Google Cloud Sync
            </h3>
            <span className="text-[9px] font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">OFFLINE</span>
          </div>
          
          <p className="text-zinc-400 text-xs leading-relaxed mt-2">
            Authenticate using your Google Workspace credentials to enable secure continuous sessions:
          </p>
          <ul className="text-[11px] text-zinc-500 mt-2.5 space-y-1.5 list-inside list-disc">
            <li>Read and summarize emails directly with voice triggers</li>
            <li>Backup and restore secure chat history logs instantly</li>
            <li>Store notes on <span className="font-mono text-[10px] text-zinc-400">Google Drive</span></li>
          </ul>
        </div>

        <div>
          <button 
            type="button"
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-indigo-500/40 hover:bg-zinc-850 text-xs font-semibold text-zinc-200 cursor-pointer active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {isLoggingIn ? (
              <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
            ) : (
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4.5 h-4.5">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
            )}
            <span className="font-mono uppercase tracking-wider">{isLoggingIn ? "Authorizing..." : "Sign in with Google"}</span>
          </button>
        </div>
      </div>
    );
  }

  // Double Grid Layout (Gmail List vs Drive Backups) when Logged In
  return (
    <div className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-6 flex flex-col shadow-xl h-[330px] justify-between relative overflow-hidden" id="workspace-dock">
      
      {/* Header bar with user profile details */}
      <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5 mb-2">
        <div className="flex items-center gap-2">
          {currentUser?.photoURL ? (
            <img src={currentUser.photoURL} alt="user avatar" className="w-5 h-5 rounded-full border border-indigo-500/20" referrerPolicy="no-referrer" />
          ) : (
            <span className="w-5 h-5 bg-indigo-600 rounded-full flex items-center justify-center text-[10px] font-bold text-white uppercase">U</span>
          )}
          <span className="text-xs font-semibold text-zinc-300 font-mono tracking-tight max-w-[120px] truncate">
            {currentUser?.email || "Google Account"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[8px] font-mono bg-indigo-950/40 text-indigo-400 border border-indigo-800/40 px-1.5 py-0.5 rounded">CONNECTED</span>
          <button 
            onClick={handleLogout}
            className="p-1 hover:bg-zinc-850 rounded text-zinc-500 hover:text-rose-400 transition-colors"
            title="Disconnect Google"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main operational panels */}
      <div className="flex-1 min-h-0 flex gap-4 mt-1">
        
        {/* Left Column: Gmail Feed and compose features */}
        <div className="flex-1 flex flex-col min-w-0 pr-1 border-r border-zinc-850/60 font-sans">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono flex items-center gap-1">
              <Mail className="w-3 h-3 text-indigo-400" /> Gmail Workspace
            </span>
            <div className="flex gap-1.5">
              <button 
                onClick={() => setIsComposing(!isComposing)}
                className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 underline"
              >
                {isComposing ? "View Inbox" : "+ Compose"}
              </button>
              <button 
                onClick={handleLoadEmails}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
                title="Refresh mailbox feed"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
            {isComposing ? (
              // Create draft or send form
              <form onSubmit={handleSendEmail} className="space-y-2 text-[11px] p-0.5">
                <input 
                  type="email" 
                  required
                  placeholder="Recipient Email (to)"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded px-2 py-1 focus:outline-none focus:border-indigo-500 text-zinc-300"
                />
                <input 
                  type="text" 
                  placeholder="Subject Header"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded px-2 py-1 focus:outline-none focus:border-indigo-500 text-zinc-300"
                />
                <textarea 
                  required
                  rows={2}
                  placeholder="Write clear body description..."
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-850 rounded px-2 py-1 focus:outline-none focus:border-indigo-500 text-zinc-300 resize-none h-14"
                />
                <div className="flex justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCreateDraft}
                    disabled={isSendingMail || !composeTo}
                    className="flex-1 py-1 rounded bg-zinc-950 text-zinc-400 border border-zinc-850 hover:bg-zinc-900 font-mono text-[9px] uppercase cursor-pointer"
                  >
                    Save Draft
                  </button>
                  <button
                    type="submit"
                    disabled={isSendingMail || !composeTo}
                    className="flex-1 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-[9px] uppercase flex items-center justify-center gap-1 cursor-pointer"
                  >
                    {isSendingMail ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Send Mail
                  </button>
                </div>
              </form>
            ) : isLoadingEmails ? (
              <div className="h-full flex items-center justify-center text-zinc-550 italic text-xs gap-1.5 py-8">
                <RefreshCw className="w-4.5 h-4.5 animate-spin text-zinc-500" />
                <span className="font-mono text-[10px]">fetching user feed...</span>
              </div>
            ) : emails.length === 0 ? (
              <div className="text-zinc-600 text-center py-10 font-sans">
                <p className="text-xs font-light">Inbox mailbox folder empty.</p>
              </div>
            ) : (
              emails.map((mail) => (
                <div 
                  key={mail.id} 
                  onClick={() => handleViewEmail(mail.id)}
                  className={`p-2 bg-zinc-950/45 hover:bg-zinc-900 border border-zinc-850/60 rounded-lg cursor-pointer transition-colors text-left flex flex-col ${selectedEmail?.id === mail.id ? "border-indigo-500 bg-zinc-900" : ""}`}
                >
                  <div className="flex justify-between items-center text-[10px] text-zinc-450 font-mono">
                    <span className="text-indigo-400 font-semibold truncate max-w-[100px]">{mail.from?.split("<")[0].trim() || "Google User"}</span>
                    <span className="text-[8px] text-zinc-600 truncate">{mail.date?.replace(/-\d+/g, "").substring(5, 11) || "today"}</span>
                  </div>
                  <h4 className="text-zinc-200 text-xs font-medium truncate mt-0.5">{mail.subject || "(No Subject)"}</h4>
                  <p className="text-zinc-500 text-[10px] truncate leading-tight mt-0.5">{mail.snippet}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Active Gmail details panel OR Drive Backup Management */}
        <div className="w-[180px] flex flex-col justify-between font-sans pl-1 min-w-0">
          {selectedEmail ? (
            <div className="flex-1 flex flex-col min-h-0 relative">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[9px] font-mono text-indigo-400 tracking-wider">EMAIL SELECTED</span>
                <button onClick={() => setSelectedEmail(null)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5 text-left border border-zinc-850 rounded-lg p-2.5 bg-zinc-950/30 text-[11px] leading-relaxed select-text scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
                <p className="text-zinc-400 font-semibold text-xs truncate">{selectedEmail.subject || "(no subject)"}</p>
                <p className="text-zinc-650 font-mono text-[9px] truncate">FROM: {selectedEmail.from}</p>
                
                <p className="text-zinc-300 whitespace-pre-wrap pt-1 font-light border-t border-zinc-900 text-[10px] text-zinc-400">
                  {selectedEmail.body || selectedEmail.snippet}
                </p>
              </div>

              <button
                onClick={() => handleSummarizeEmail(selectedEmail)}
                disabled={isSummarizing}
                className="w-full mt-2 py-1.5 bg-indigo-900/20 hover:bg-indigo-900/35 border border-indigo-700/30 rounded-lg text-[10px] font-mono text-indigo-400 tracking-wide uppercase flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSummarizing ? (
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                )}
                Aura Summarize
              </button>
            </div>
          ) : (
            // Drive Backup Controller and Status Overview
            <div className="flex-1 flex flex-col justify-between bg-zinc-950/15 p-1 rounded-lg">
              <div>
                <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono flex items-center gap-1">
                  <CloudRain className="w-3.5 h-3.5 text-indigo-400 animate-none" /> Drive Storing
                </span>
                
                <p className="text-zinc-500 text-[10px] leading-relaxed mt-2.5">
                  Secure local chats and scratchpad data onto Google Drive cloud logs:
                </p>
                
                <div className="space-y-1.5 mt-2 bg-zinc-950/40 border border-zinc-900 p-2 rounded-xl text-[10px]">
                  <div className="flex justify-between items-center text-zinc-550">
                    <span>Target Folder:</span>
                    <span className="text-zinc-400 font-mono">My Drive (Root)</span>
                  </div>
                  <div className="flex justify-between items-center text-zinc-550 mt-1">
                    <span>File Name:</span>
                    <span className="text-indigo-400 font-mono">Aura_Chat_History.json</span>
                  </div>
                  {lastSyncTime && (
                    <div className="flex justify-between items-center text-zinc-550 mt-1">
                      <span>Last Sync:</span>
                      <span className="text-emerald-400">{lastSyncTime}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <button
                  onClick={handleCloudBackup}
                  disabled={syncStatus === "saving" || syncStatus === "restoring"}
                  className="w-full py-1.5 bg-zinc-900 hover:bg-zinc-850 active:bg-zinc-900 border border-zinc-800 text-[9px] font-mono uppercase font-semibold text-zinc-300 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer hover:border-indigo-500/20 disabled:opacity-50"
                >
                  {syncStatus === "saving" ? (
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                  ) : syncStatus === "saved" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Save className="w-3.5 h-3.5 text-zinc-505" />
                  )}
                  {syncStatus === "saving" ? "Backup Run..." : syncStatus === "saved" ? "Backup Saved!" : "Backup to Drive"}
                </button>

                <button
                  onClick={handleCloudRestore}
                  disabled={syncStatus === "saving" || syncStatus === "restoring"}
                  className="w-full py-1.5 bg-zinc-900 hover:bg-zinc-850 active:bg-zinc-900 border border-zinc-800 text-[9px] font-mono uppercase font-semibold text-zinc-300 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer hover:border-indigo-500/20 disabled:opacity-50"
                >
                  {syncStatus === "restoring" ? (
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-zinc-505" />
                  )}
                  {syncStatus === "restoring" ? "Restoring..." : "Restore Backup"}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
