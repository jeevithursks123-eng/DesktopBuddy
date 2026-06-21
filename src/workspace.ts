// Google Workspace Api Helper Client-side Code

export interface EmailMessage {
  id: string;
  threadId: string;
  snippet: string;
  from?: string;
  subject?: string;
  date?: string;
  body?: string;
}

// Utility to parse mail headers and multipart bodies
function getHeaderValue(headers: { name: string; value: string }[], name: string): string {
  const found = headers?.find(h => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : "";
}

function decodeBase64Safe(base64: string): string {
  try {
    // Replace URL safe characters
    const standardized = base64.replace(/-/g, "+").replace(/_/g, "/");
    return decodeURIComponent(
      atob(standardized)
        .split("")
        .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch (err) {
    return "Failed to parse email content.";
  }
}

// Finds readable message body parsing HTML/Plain recursively
function findEmailBody(part: any): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Safe(part.body.data);
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return decodeBase64Safe(part.body.data);
  }
  if (part.parts) {
    for (const subPart of part.parts) {
      const parsed = findEmailBody(subPart);
      if (parsed) return parsed;
    }
  }
  return "";
}

// Lists user emails
export async function listEmails(accessToken: string): Promise<EmailMessage[]> {
  try {
    const listRes = await fetch(
      "https://gmail.googleapis.com/v1/users/me/messages?maxResults=8&q=category:primary",
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (!listRes.ok) throw new Error("Failed to fetch Gmail list: " + listRes.statusText);
    const listData = await listRes.json();
    if (!listData.messages || listData.messages.length === 0) return [];

    // Fetch individual email metadata/details in parallel
    const detailsPromises = listData.messages.map(async (msg: any) => {
      try {
        const detailRes = await fetch(
          `https://gmail.googleapis.com/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          {
            headers: { Authorization: `Bearer ${accessToken}` }
          }
        );
        if (!detailRes.ok) return { id: msg.id, threadId: msg.threadId, snippet: "Error loading mail content." };
        const detail = await detailRes.json();
        const headers = detail.payload?.headers || [];
        
        return {
          id: msg.id,
          threadId: msg.threadId,
          snippet: detail.snippet || "",
          from: getHeaderValue(headers, "From"),
          subject: getHeaderValue(headers, "Subject"),
          date: getHeaderValue(headers, "Date")
        };
      } catch (err) {
        return { id: msg.id, threadId: msg.threadId, snippet: "Connection timed out." };
      }
    });

    return await Promise.all(detailsPromises);
  } catch (error) {
    console.error("listEmails error:", error);
    throw error;
  }
}

// Fetches complete email fields
export async function getFullEmail(accessToken: string, emailId: string): Promise<EmailMessage> {
  const url = `https://gmail.googleapis.com/v1/users/me/messages/${emailId}?format=full`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`Failed to load email ${emailId}: ` + res.statusText);
  const detail = await res.json();
  const headers = detail.payload?.headers || [];
  
  let bodyContent = detail.snippet || "";
  if (detail.payload) {
    const fullBody = findEmailBody(detail.payload);
    if (fullBody) {
      bodyContent = fullBody;
    }
  }

  return {
    id: detail.id,
    threadId: detail.threadId,
    snippet: detail.snippet || "",
    from: getHeaderValue(headers, "From"),
    subject: getHeaderValue(headers, "Subject"),
    date: getHeaderValue(headers, "Date"),
    body: bodyContent
  };
}

// Sends an email on behalf of the user (requires confirmation in the UI)
export async function sendEmail(
  accessToken: string, 
  to: string, 
  subject: string, 
  body: string
): Promise<any> {
  // Construct RFC 2822 formatting for base64url message
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body
  ];
  const emailRaw = emailLines.join('\r\n');
  const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailRaw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch("https://gmail.googleapis.com/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw: base64EncodedEmail })
  });
  
  if (!res.ok) {
    const errorDetails = await res.text();
    throw new Error("Unable to send mail: " + errorDetails);
  }
  return await res.json();
}

// Saves/creates a draft on behalf of the user
export async function createDraft(
  accessToken: string,
  to: string,
  subject: string,
  body: string
): Promise<any> {
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body
  ];
  const emailRaw = emailLines.join('\r\n');
  const base64EncodedEmail = btoa(unescape(encodeURIComponent(emailRaw)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch("https://gmail.googleapis.com/v1/users/me/drafts", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: { raw: base64EncodedEmail }
    })
  });

  if (!res.ok) {
    const errorDetails = await res.text();
    throw new Error("Unable to create email draft: " + errorDetails);
  }
  return await res.json();
}

// Lists files in Google Drive matching simple prompt
export async function searchDriveFiles(accessToken: string, query?: string): Promise<any[]> {
  let url = "https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType,modifiedTime,size)";
  if (query) {
    const escapedQuery = query.replace(/'/g, "\\'");
    url += `&q=name contains '${escapedQuery}' and trashed = false`;
  } else {
    url += `&q=space = 'drive' and trashed = false`;
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error("Failed to search Drive content: " + res.statusText);
  const data = await res.json();
  return data.files || [];
}

// Saves a state object to Google Drive (creates or updates)
export async function saveChatToDrive(
  accessToken: string, 
  messages: any[], 
  notesList?: any[]
): Promise<{ success: boolean; fileId: string }> {
  try {
    // 1. Search if Aura_Chat_History.json already exists
    const searchUrl = "https://www.googleapis.com/drive/v3/files?q=name='Aura_Chat_History.json' and trashed=false&fields=files(id)";
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!searchRes.ok) throw new Error("Google Drive search error");
    const searchData = await searchRes.json();
    
    const fileContentStruct = {
      savedAt: new Date().toISOString(),
      messages: messages,
      notes: notesList || []
    };

    const jsonString = JSON.stringify(fileContentStruct, null, 2);
    const fileId = searchData.files?.[0]?.id;

    if (fileId) {
      // 2. File exists: perform an UPDATE (PATCH)
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;
      const updateRes = await fetch(updateUrl, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: jsonString
      });
      if (!updateRes.ok) throw new Error("Failed to update file Content in Google Drive");
      return { success: true, fileId };
    } else {
      // 3. File doesn't exist: perform a multipart CREATE (POST)
      const boundary = "------AuraBoundaryBoundary------";
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;
      
      const metadata = {
        name: "Aura_Chat_History.json",
        mimeType: "application/json"
      };

      const multipartBody = 
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        jsonString +
        closeDelimiter;

      const createRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`
          },
          body: multipartBody
        }
      );

      if (!createRes.ok) {
        const errText = await createRes.text();
        throw new Error("Failed to create backup: " + errText);
      }
      
      const createdData = await createRes.json();
      return { success: true, fileId: createdData.id };
    }
  } catch (err: any) {
    console.error("saveChatToDrive exception:", err);
    throw err;
  }
}

// Retrieves previous chat state from Google Drive
export async function loadChatFromDrive(accessToken: string): Promise<any | null> {
  try {
    const searchUrl = "https://www.googleapis.com/drive/v3/files?q=name='Aura_Chat_History.json' and trashed=false&fields=files(id)";
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const fileId = searchData.files?.[0]?.id;
    if (!fileId) return null;

    // Load file content media
    const contentUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const contentRes = await fetch(contentUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!contentRes.ok) return null;
    return await contentRes.json();
  } catch (err) {
    console.error("loadChatFromDrive exception:", err);
    return null;
  }
}
