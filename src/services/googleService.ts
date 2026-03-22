export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

export const getAuthUrl = async (): Promise<string> => {
  console.log("[GOOGLE_SERVICE] Fetching Auth URL...");
  const response = await fetch("/api/auth/url");
  const { url } = await response.json();
  console.log("[GOOGLE_SERVICE] Auth URL received");
  return url;
};

export const appendToSheet = async (tokens: GoogleTokens, spreadsheetId: string, range: string, values: any[][]) => {
  console.log("[GOOGLE_SERVICE] Appending to sheet:", spreadsheetId, "range:", range);
  const start = Date.now();
  const response = await fetch("/api/sheets/append", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens, spreadsheetId, range, values }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to append to sheet");
  }
  const data = await response.json();
  console.log(`[GOOGLE_SERVICE] Append complete in ${Date.now() - start}ms`);
  return data;
};

export const getSheetData = async (tokens: GoogleTokens, spreadsheetId: string, range: string) => {
  console.log("[GOOGLE_SERVICE] Fetching sheet data:", spreadsheetId, "range:", range);
  const start = Date.now();
  const response = await fetch("/api/sheets/get", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens, spreadsheetId, range }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to fetch from sheet");
  }
  const data = await response.json();
  console.log(`[GOOGLE_SERVICE] Fetch complete in ${Date.now() - start}ms`);
  return data;
};

export const createSpreadsheet = async (tokens: GoogleTokens, title: string) => {
  console.log("[GOOGLE_SERVICE] Creating spreadsheet with title:", title);
  const start = Date.now();
  const response = await fetch("/api/sheets/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens, title }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to create spreadsheet");
  }
  const data = await response.json();
  console.log(`[GOOGLE_SERVICE] Spreadsheet creation complete in ${Date.now() - start}ms`);
  return data;
};

export const batchUpdateSheet = async (tokens: GoogleTokens, spreadsheetId: string, requests: any[]) => {
  console.log("[GOOGLE_SERVICE] Batch updating sheet:", spreadsheetId);
  const start = Date.now();
  const response = await fetch("/api/sheets/batchUpdate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens, spreadsheetId, requests }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to update spreadsheet");
  }
  const data = await response.json();
  console.log(`[GOOGLE_SERVICE] Batch update complete in ${Date.now() - start}ms`);
  return data;
};

export const updateSheetRow = async (tokens: GoogleTokens, spreadsheetId: string, range: string, values: any[][]) => {
  console.log("[GOOGLE_SERVICE] Updating sheet row:", spreadsheetId, "range:", range);
  const start = Date.now();
  const response = await fetch("/api/sheets/update", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens, spreadsheetId, range, values }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to update sheet row");
  }
  const data = await response.json();
  console.log(`[GOOGLE_SERVICE] Update complete in ${Date.now() - start}ms`);
  return data;
};

export const deleteSheetRow = async (tokens: GoogleTokens, spreadsheetId: string, sheetId: number | null, rowIndex: number) => {
  console.log("[GOOGLE_SERVICE] Deleting sheet row:", spreadsheetId, "sheetId:", sheetId, "rowIndex:", rowIndex);
  const start = Date.now();
  const response = await fetch("/api/sheets/deleteRow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens, spreadsheetId, sheetId, rowIndex }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to delete sheet row");
  }
  const data = await response.json();
  console.log(`[GOOGLE_SERVICE] Delete complete in ${Date.now() - start}ms`);
  return data;
};

export const getSpreadsheetMetadata = async (tokens: GoogleTokens, spreadsheetId: string) => {
  console.log("[GOOGLE_SERVICE] Fetching spreadsheet metadata:", spreadsheetId);
  const start = Date.now();
  const response = await fetch("/api/sheets/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens, spreadsheetId }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to fetch metadata");
  }
  const data = await response.json();
  console.log(`[GOOGLE_SERVICE] Metadata fetch complete in ${Date.now() - start}ms`);
  return data;
};

export const createCalendarEvent = async (tokens: GoogleTokens, calendarId: string | null, event: any) => {
  console.log("[GOOGLE_SERVICE] Creating calendar event in:", calendarId || "primary");
  const start = Date.now();
  const response = await fetch("/api/calendar/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens, calendarId, event }),
  });
  const data = await response.json();
  console.log(`[GOOGLE_SERVICE] Calendar event creation complete in ${Date.now() - start}ms`);
  return data;
};

export const listCalendarEvents = async (tokens: GoogleTokens, calendarId: string | null, timeMin?: string, timeMax?: string) => {
  console.log("[GOOGLE_SERVICE] Listing calendar events in:", calendarId || "primary");
  const start = Date.now();
  const response = await fetch("/api/calendar/list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tokens, calendarId, timeMin, timeMax }),
  });
  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to list calendar events");
  }
  const data = await response.json();
  console.log(`[GOOGLE_SERVICE] Calendar list complete in ${Date.now() - start}ms`);
  return data;
};
