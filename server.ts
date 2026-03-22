import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Request Logger Middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[SERVER] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  // Google OAuth configuration
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/auth/callback`
  );

  // API Routes
  app.get("/api/auth/url", (req, res) => {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
      ],
      prompt: "consent"
    });
    res.json({ url });
  });

  app.get("/auth/callback", async (req, res) => {
    const { code } = req.query;
    try {
      const { tokens } = await oauth2Client.getToken(code as string);
      // In a real app, you'd store tokens securely in Firestore associated with the user.
      // For this demo, we'll send them back to the client to store in session/local storage (not ideal for production).
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', tokens: ${JSON.stringify(tokens)} }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error exchanging code for tokens:", error);
      res.status(500).send("Authentication failed");
    }
  });

  // Proxy for Google Sheets API - Create Spreadsheet
  app.post("/api/sheets/create", async (req, res) => {
    const { tokens, title } = req.body;
    console.log(`[SERVER] /api/sheets/create - Title: ${title}`);
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    try {
      const result = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title },
          sheets: [
            {
              properties: { title: "CashFlow" },
              data: [
                {
                  startRow: 0,
                  startColumn: 0,
                  rowData: [
                    {
                      values: [
                        { userEnteredValue: { stringValue: "Date" } },
                        { userEnteredValue: { stringValue: "Type" } },
                        { userEnteredValue: { stringValue: "Category" } },
                        { userEnteredValue: { stringValue: "Amount" } },
                        { userEnteredValue: { stringValue: "Description" } },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      });
      console.log(`[SERVER] /api/sheets/create - Success: ${result.data.spreadsheetId}`);
      res.json(result.data);
    } catch (error) {
      console.error("[SERVER] Sheets API error (create):", error);
      res.status(500).json({ error: "Failed to create spreadsheet" });
    }
  });

  // Proxy for Google Sheets API - Fetch Data
  app.post("/api/sheets/get", async (req, res) => {
    const { tokens, spreadsheetId, range } = req.body;
    console.log(`[SERVER] /api/sheets/get - ID: ${spreadsheetId}, Range: ${range}`);
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    try {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });
      console.log(`[SERVER] /api/sheets/get - Success: ${result.data.values?.length || 0} rows`);
      res.json(result.data);
    } catch (error: any) {
      console.error("[SERVER] Sheets API error (get):", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({ 
        error: error.response?.data?.error?.message || "Failed to fetch from sheet" 
      });
    }
  });

  // Proxy for Google Sheets API - Append Data
  app.post("/api/sheets/append", async (req, res) => {
    const { tokens, spreadsheetId, range, values } = req.body;
    console.log(`[SERVER] /api/sheets/append - ID: ${spreadsheetId}, Range: ${range}`);
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    try {
      const result = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values },
      });
      console.log(`[SERVER] /api/sheets/append - Success`);
      res.json(result.data);
    } catch (error: any) {
      console.error("[SERVER] Sheets API error (append):", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({ 
        error: error.response?.data?.error?.message || "Failed to append to sheet" 
      });
    }
  });

  // Proxy for Google Sheets API - Batch Update (e.g., to add a sheet)
  app.post("/api/sheets/batchUpdate", async (req, res) => {
    const { tokens, spreadsheetId, requests } = req.body;
    console.log(`[SERVER] /api/sheets/batchUpdate - ID: ${spreadsheetId}`);
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    try {
      const result = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      });
      console.log(`[SERVER] /api/sheets/batchUpdate - Success`);
      res.json(result.data);
    } catch (error: any) {
      console.error("[SERVER] Sheets API error (batchUpdate):", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({ 
        error: error.response?.data?.error?.message || "Failed to update spreadsheet" 
      });
    }
  });

  // Proxy for Google Sheets API - Update Data
  app.put("/api/sheets/update", async (req, res) => {
    const { tokens, spreadsheetId, range, values } = req.body;
    console.log(`[SERVER] /api/sheets/update - ID: ${spreadsheetId}, Range: ${range}`);
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    try {
      const result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: { values },
      });
      console.log(`[SERVER] /api/sheets/update - Success`);
      res.json(result.data);
    } catch (error: any) {
      console.error("[SERVER] Sheets API error (update):", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({ 
        error: error.response?.data?.error?.message || "Failed to update sheet" 
      });
    }
  });

  // Proxy for Google Sheets API - Delete Row
  app.post("/api/sheets/deleteRow", async (req, res) => {
    const { tokens, spreadsheetId, sheetId, rowIndex } = req.body;
    console.log(`[SERVER] /api/sheets/deleteRow - ID: ${spreadsheetId}, Sheet: ${sheetId}, Row: ${rowIndex}`);
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    try {
      const result = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              deleteDimension: {
                range: {
                  sheetId: sheetId || 0,
                  dimension: "ROWS",
                  startIndex: rowIndex,
                  endIndex: rowIndex + 1,
                },
              },
            },
          ],
        },
      });
      console.log(`[SERVER] /api/sheets/deleteRow - Success`);
      res.json(result.data);
    } catch (error: any) {
      console.error("[SERVER] Sheets API error (deleteRow):", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({ 
        error: error.response?.data?.error?.message || "Failed to delete row" 
      });
    }
  });

  // Proxy for Google Sheets API - Get Spreadsheet Metadata
  app.post("/api/sheets/metadata", async (req, res) => {
    const { tokens, spreadsheetId } = req.body;
    console.log(`[SERVER] /api/sheets/metadata - ID: ${spreadsheetId}`);
    oauth2Client.setCredentials(tokens);
    const sheets = google.sheets({ version: "v4", auth: oauth2Client });
    try {
      const result = await sheets.spreadsheets.get({
        spreadsheetId,
      });
      res.json(result.data);
    } catch (error: any) {
      console.error("[SERVER] Sheets API error (metadata):", error.response?.data || error.message);
      res.status(error.response?.status || 500).json({ 
        error: error.response?.data?.error?.message || "Failed to fetch metadata" 
      });
    }
  });

  // Proxy for Google Calendar API
  app.post("/api/calendar/event", async (req, res) => {
    const { tokens, calendarId, event } = req.body;
    console.log(`[SERVER] /api/calendar/event - Calendar: ${calendarId || 'primary'}`);
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    try {
      const result = await calendar.events.insert({
        calendarId: calendarId || "primary",
        requestBody: event,
      });
      console.log(`[SERVER] /api/calendar/event - Success: ${result.data.id}`);
      res.json(result.data);
    } catch (error) {
      console.error("[SERVER] Calendar API error:", error);
      res.status(500).json({ error: "Failed to create calendar event" });
    }
  });

  app.post("/api/calendar/list", async (req, res) => {
    const { tokens, calendarId, timeMin, timeMax } = req.body;
    console.log(`[SERVER] /api/calendar/list - Calendar: ${calendarId || 'primary'}`);
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    try {
      const result = await calendar.events.list({
        calendarId: calendarId || "primary",
        timeMin,
        timeMax,
        singleEvents: true,
      });
      res.json(result.data);
    } catch (error) {
      console.error("[SERVER] Calendar API error (list):", error);
      res.status(500).json({ error: "Failed to list calendar events" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
