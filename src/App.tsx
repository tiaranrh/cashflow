import React, { useState, useEffect } from 'react';
import { getAuthUrl, GoogleTokens, appendToSheet, createCalendarEvent, listCalendarEvents, getSheetData, batchUpdateSheet, createSpreadsheet, updateSheetRow, deleteSheetRow, getSpreadsheetMetadata } from './services/googleService';
import { getCashflowInsights } from './services/geminiService';
import { PlusCircle, LogOut, LayoutDashboard, Settings, PieChart, Calendar as CalendarIcon, AlertCircle, CheckCircle2, RefreshCw, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, isWithinInterval, subMonths, isAfter } from 'date-fns';

export default function App() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [setupLoading, setSetupLoading] = useState(false);
  const [googleTokens, setGoogleTokens] = useState<GoogleTokens | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<any | null>(null);
  const [cashFlowSheetId, setCashFlowSheetId] = useState<number | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [showCostGuide, setShowCostGuide] = useState(false);
  const [spreadsheetId, setSpreadsheetId] = useState<string>(localStorage.getItem('spreadsheet_id') || '');
  const [calendarId, setCalendarId] = useState<string>(localStorage.getItem('calendar_id') || '');
  const [userEmail, setUserEmail] = useState<string | null>(localStorage.getItem('user_email'));

  useEffect(() => {
    console.log("[APP] Mounting CashFlow Gemini...");
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        console.log("[APP] OAuth Success received");
        const tokens = event.data.tokens;
        setGoogleTokens(tokens);
        localStorage.setItem('google_tokens', JSON.stringify(tokens));
        
        if (tokens.id_token) {
          try {
            const payload = JSON.parse(atob(tokens.id_token.split('.')[1]));
            setUserEmail(payload.email);
            localStorage.setItem('user_email', payload.email);
            console.log("[APP] User email set:", payload.email);
          } catch (e) {
            console.error("[APP] Failed to parse ID token", e);
          }
        }
      }
    };
    window.addEventListener('message', handleMessage);
    
    const savedTokens = localStorage.getItem('google_tokens');
    if (savedTokens) {
      console.log("[APP] Restoring saved Google tokens");
      setGoogleTokens(JSON.parse(savedTokens));
    }
    setLoading(false);

    return () => {
      console.log("[APP] Unmounting...");
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  useEffect(() => {
    if (googleTokens && spreadsheetId) {
      console.log("[APP] Tokens and Spreadsheet ID present, fetching transactions...");
      fetchTransactions();
    } else {
      console.log("[APP] Missing tokens or spreadsheet ID, skipping fetch", { hasTokens: !!googleTokens, spreadsheetId });
    }
  }, [googleTokens, spreadsheetId]);

  const fetchTransactions = async () => {
    if (!googleTokens || !spreadsheetId) return;
    const start = Date.now();
    setLoading(true);
    try {
      console.log("[APP] Fetching transactions from Google Sheets...");
      
      // Fetch metadata to find the sheetId for "CashFlow"
      const metadata = await getSpreadsheetMetadata(googleTokens, spreadsheetId);
      const cashFlowSheet = metadata.sheets.find((s: any) => s.properties.title === 'CashFlow');
      if (cashFlowSheet) {
        setCashFlowSheetId(cashFlowSheet.properties.sheetId);
      }

      let data;
      try {
        data = await getSheetData(googleTokens, spreadsheetId, 'CashFlow!A:E');
      } catch (error: any) {
        // If the spreadsheet itself is not found (404), reset the ID
        if (error.message.includes("not found") || error.message.includes("404")) {
          console.error("[APP] Spreadsheet not found (404). Resetting ID.");
          setSpreadsheetId('');
          localStorage.removeItem('spreadsheet_id');
          alert("Spreadsheet not found. Please check the ID or create a new one.");
          return;
        }

        // If the sheet "CashFlow" doesn't exist (400), create it
        console.log("[APP] 'CashFlow' sheet not found, attempting to create it...");
        await batchUpdateSheet(googleTokens, spreadsheetId, [
          {
            addSheet: {
              properties: {
                title: 'CashFlow'
              }
            }
          }
        ]);
        console.log("[APP] 'CashFlow' sheet created successfully");
        data = await getSheetData(googleTokens, spreadsheetId, 'CashFlow!A:E');
      }
      
      // If the sheet is empty or missing headers, initialize it
      if (!data.values || data.values.length === 0) {
        console.log("[APP] Sheet is empty, initializing headers...");
        const headers = [["Date", "Type", "Category", "Amount", "Description"]];
        await appendToSheet(googleTokens, spreadsheetId, 'CashFlow!A1', headers);
        setTransactions([]);
        console.log("[APP] Headers initialized successfully");
      } else if (data.values) {
        const txs = data.values.map((row: any, index: number) => ({
          rowIndex: index, // Row index in the sheet (0-based)
          date: row[0],
          type: row[1],
          category: row[2],
          amount: parseFloat(row[3]),
          description: row[4]
        })).filter((tx: any, index: number) => index > 0 && tx.date && !isNaN(tx.amount));

        const sixMonthsAgo = subMonths(new Date(), 6);
        const filteredTxs = txs.filter((tx: any) => isAfter(new Date(tx.date), sixMonthsAgo));
        
        setTransactions(filteredTxs);
        console.log(`[APP] Successfully fetched ${filteredTxs.length} transactions in ${Date.now() - start}ms`);
        
        // Automatically generate insights and setup reminders when data is loaded
        if (filteredTxs.length > 0) {
          generateInsights(filteredTxs);
          setupAutomatedReminders(filteredTxs);
        }
      }
    } catch (error) {
      console.error("[APP] Failed to fetch transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGoogle = async () => {
    console.log("[APP] Initiating Google OAuth...");
    const url = await getAuthUrl();
    window.open(url, 'google_oauth', 'width=600,height=700');
  };

  const handleLogout = () => {
    console.log("[APP] Logging out and clearing local storage...");
    localStorage.clear();
    setGoogleTokens(null);
    setTransactions([]);
    setUserEmail(null);
    setSpreadsheetId('');
  };

  const handleCreateSpreadsheet = async () => {
    if (!googleTokens) return;
    setSetupLoading(true);
    try {
      console.log("[APP] Creating new spreadsheet...");
      const data = await createSpreadsheet(googleTokens, "CashFlow Gemini Tracker");
      const newId = data.spreadsheetId;
      setSpreadsheetId(newId);
      localStorage.setItem('spreadsheet_id', newId);
      console.log("[APP] New spreadsheet created:", newId);
    } catch (error) {
      console.error("[APP] Failed to create spreadsheet:", error);
      alert("Failed to create spreadsheet. Please try again.");
    } finally {
      setSetupLoading(false);
    }
  };

  const handleConnectExistingSpreadsheet = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const id = formData.get('spreadsheetId') as string;
    if (id) {
      setSpreadsheetId(id);
      localStorage.setItem('spreadsheet_id', id);
      console.log("[APP] Connected to existing spreadsheet:", id);
    }
  };

  const handleAddTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!googleTokens || !spreadsheetId) return;

    const start = Date.now();
    const formData = new FormData(e.currentTarget);
    const amount = parseFloat(formData.get('amount') as string);
    const type = formData.get('type') as string;
    const category = formData.get('category') as string;
    const description = formData.get('description') as string;
    const date = editingTransaction ? editingTransaction.date : new Date().toISOString();

    try {
      if (editingTransaction) {
        console.log("[APP] Updating existing transaction in Google Sheets...");
        const rowIndex = editingTransaction.rowIndex + 1; // 1-based for range
        await updateSheetRow(googleTokens, spreadsheetId, `CashFlow!A${rowIndex}:E${rowIndex}`, [
          [format(new Date(date), 'yyyy-MM-dd HH:mm:ss'), type, category, amount, description]
        ]);
        console.log("[APP] Transaction updated successfully");
      } else {
        console.log("[APP] Adding new transaction to Google Sheets...");
        await appendToSheet(googleTokens, spreadsheetId, 'CashFlow!A:E', [
          [format(new Date(date), 'yyyy-MM-dd HH:mm:ss'), type, category, amount, description]
        ]);
        console.log("[APP] Transaction added successfully");
      }
      
      console.log(`[APP] Transaction saved successfully in ${Date.now() - start}ms`);
      await fetchTransactions();
      setShowForm(false);
      setEditingTransaction(null);
      e.currentTarget.reset();
    } catch (error) {
      console.error("[APP] Failed to save transaction:", error);
      alert("Failed to save transaction. Please try again.");
    }
  };

  const handleDeleteTransaction = async (rowIndex: number) => {
    if (!googleTokens || !spreadsheetId) return;
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    try {
      console.log("[APP] Deleting transaction from Google Sheets...");
      await deleteSheetRow(googleTokens, spreadsheetId, cashFlowSheetId, rowIndex);
      console.log("[APP] Transaction deleted successfully");
      await fetchTransactions();
    } catch (error) {
      console.error("[APP] Failed to delete transaction:", error);
      alert("Failed to delete transaction. Please try again.");
    }
  };

  const handleEditClick = (tx: any) => {
    setEditingTransaction(tx);
    setShowForm(true);
  };

  const generateInsights = async (txsToUse?: any[]) => {
    const txs = txsToUse || transactions;
    if (!googleTokens || txs.length === 0) return;
    
    const start = Date.now();
    console.log("[APP] Generating Gemini insights...");
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    
    const currentMonthTxs = txs.filter(tx => 
      isWithinInterval(new Date(tx.date), { start: monthStart, end: monthEnd })
    );

    const prevMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const prevMonthEnd = endOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    
    const prevMonthTxs = txs.filter(tx => 
      isWithinInterval(new Date(tx.date), { start: prevMonthStart, end: prevMonthEnd })
    );

    const calcBalance = (txs: any[]) => txs.reduce((acc, tx) => 
      tx.type === 'income' ? acc + tx.amount : acc - tx.amount, 0
    );

    const currentBalance = calcBalance(currentMonthTxs);
    const prevBalance = calcBalance(prevMonthTxs);

    const aiInsight = await getCashflowInsights(currentMonthTxs, prevBalance, currentBalance);
    setInsight(aiInsight);
    console.log(`[APP] Insights generated in ${Date.now() - start}ms`);

    const changePercent = prevBalance !== 0 ? Math.abs((currentBalance - prevBalance) / prevBalance) : 1;
    if (changePercent > 0.2 && googleTokens) {
      console.log("[APP] Significant change detected, checking for duplicate calendar event...");
      setNotifying(true);
      const isIncrease = currentBalance > prevBalance;
      const summary = isIncrease ? '🎉 Cashflow Milestone: Balance Increased!' : '⚠️ Cashflow Alert: Balance Decreased';
      
      try {
        // Check for duplicate milestone today
        const todayStart = new Date();
        todayStart.setHours(0,0,0,0);
        const todayEnd = new Date();
        todayEnd.setHours(23,59,59,999);
        
        const existingEvents = await listCalendarEvents(googleTokens, calendarId, todayStart.toISOString(), todayEnd.toISOString());
        const alreadyHasMilestone = (existingEvents.items || []).some((e: any) => e.summary === summary);

        if (!alreadyHasMilestone) {
          const event = {
            summary,
            description: aiInsight,
            start: { dateTime: new Date().toISOString() },
            end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
          };
          await createCalendarEvent(googleTokens, calendarId, event);
          console.log("[APP] Calendar event created");
        } else {
          console.log("[APP] Milestone event already exists for today, skipping duplicate");
        }
      } catch (error) {
        console.error("[APP] Error checking for duplicate milestone:", error);
      } finally {
        setNotifying(false);
      }
    }
  };

  const setupAutomatedReminders = async (txs: any[]) => {
    if (!googleTokens) return;
    
    console.log("[APP] Setting up automated reminders...");
    setNotifying(true);
    try {
      const now = new Date();
      
      // Fetch existing events for the next 7 days to check for duplicates
      const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const existingEvents = await listCalendarEvents(googleTokens, null, now.toISOString(), timeMax);
      const events = existingEvents.items || [];

      // 1. Daily Reminder at 20:30 UTC+7 (13:30 UTC)
      const dailyReminderTime = new Date();
      dailyReminderTime.setUTCHours(13, 30, 0, 0); // 13:30 UTC is 20:30 UTC+7
      
      if (now > dailyReminderTime) {
        dailyReminderTime.setUTCDate(dailyReminderTime.getUTCDate() + 1);
      }

      const dailySummary = '📝 Fill CashFlow Tracker';
      // Check if reminder exists for this SPECIFIC day
      const hasDailyForTarget = events.some((e: any) => {
        if (e.summary !== dailySummary) return false;
        const eventStart = new Date(e.start.dateTime || e.start.date);
        return eventStart.getUTCDate() === dailyReminderTime.getUTCDate() && 
               eventStart.getUTCMonth() === dailyReminderTime.getUTCMonth();
      });

      if (!hasDailyForTarget) {
        await createCalendarEvent(googleTokens, null, {
          summary: dailySummary,
          description: 'Time to log your expenses and income for today!',
          start: { dateTime: dailyReminderTime.toISOString() },
          end: { dateTime: new Date(dailyReminderTime.getTime() + 30 * 60000).toISOString() },
          reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 10 }] }
        });
      }

      // 2. Sunday Surprise (Weekly Review)
      const nextSunday = new Date();
      const day = nextSunday.getUTCDay();
      const diff = day === 0 ? 0 : 7 - day;
      nextSunday.setUTCDate(nextSunday.getUTCDate() + diff);
      nextSunday.setUTCHours(14, 0, 0, 0); // 21:00 UTC+7 (Sunday Night)

      const sundaySummary = '🎁 Sunday Financial Surprise!';
      // Check if surprise exists for this SPECIFIC Sunday
      const hasSundayForTarget = events.some((e: any) => {
        if (e.summary !== sundaySummary) return false;
        const eventStart = new Date(e.start.dateTime || e.start.date);
        return eventStart.getUTCDate() === nextSunday.getUTCDate() && 
               eventStart.getUTCMonth() === nextSunday.getUTCMonth();
      });

      if (!hasSundayForTarget) {
        console.log("[APP] Generating Sunday Surprise...");
        const totalBalance = txs.reduce((acc, tx) => 
          tx.type === 'income' ? acc + tx.amount : acc - tx.amount, 0
        );
        
        const surprisePrompt = `Write a short, surprising, and very encouraging "appreciation" message for a user's financial progress. 
        Their current total balance is Rp${totalBalance.toLocaleString('id-ID')}. 
        Make it feel like a sudden, delightful surprise notification. Keep it under 100 words.`;
        
        const surpriseMessage = await getCashflowInsights(txs, 0, totalBalance, surprisePrompt);
        
        await createCalendarEvent(googleTokens, null, {
          summary: sundaySummary,
          description: surpriseMessage,
          start: { dateTime: nextSunday.toISOString() },
          end: { dateTime: new Date(nextSunday.getTime() + 60 * 60000).toISOString() },
          colorId: '2' // Sage color
        });
      }

      console.log("[APP] Automated reminders synced successfully");
    } catch (error) {
      console.error("[APP] Failed to setup automated reminders:", error);
    } finally {
      setNotifying(false);
    }
  };

  const totalBalance = transactions.reduce((acc, tx) => 
    tx.type === 'income' ? acc + tx.amount : acc - tx.amount, 0
  );

  if (loading && googleTokens && spreadsheetId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-stone-50 font-sans">
        <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mb-6 shadow-lg animate-pulse">
          <Database className="text-white w-8 h-8" />
        </div>
        <div className="flex items-center gap-3 text-stone-400 font-bold tracking-widest uppercase text-xs">
          <RefreshCw className="w-4 h-4 animate-spin" />
          Syncing with Google Sheets...
        </div>
      </div>
    );
  }

  if (!googleTokens) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-stone-100 font-sans p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-12 rounded-3xl shadow-xl max-w-md w-full text-center border border-stone-200"
        >
          <div className="bg-emerald-500 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-emerald-200">
            <PieChart className="text-white w-8 h-8" />
          </div>
          <h1 className="text-4xl font-bold text-stone-900 mb-4 tracking-tight">CashFlow Gemini</h1>
          <p className="text-stone-500 mb-10 leading-relaxed">Smart personal finance tracking using Google Sheets as your database.</p>
          <button 
            onClick={handleConnectGoogle}
            className="w-full bg-stone-900 text-white py-4 rounded-2xl font-semibold hover:bg-stone-800 transition-all shadow-lg hover:shadow-xl active:scale-95"
          >
            Connect with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 pb-24">
      <header className="sticky top-0 z-40 glass safe-top">
        <div className="max-w-xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center shadow-lg animate-float">
              <PieChart className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold tracking-tight">CashFlow</h1>
              <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Gemini Powered</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {googleTokens && (
              <button 
                onClick={() => setShowCostGuide(!showCostGuide)}
                className="p-2 hover:bg-stone-100 rounded-xl transition-colors text-stone-500"
                title="GCP Cost Guide"
              >
                <Database className="w-5 h-5" />
              </button>
            )}
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-rose-50 rounded-xl transition-colors text-stone-400 hover:text-rose-600"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-6 space-y-8 safe-bottom">
        <AnimatePresence>
          {showCostGuide && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-stone-900 text-white p-6 rounded-3xl shadow-xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-400" /> GCP Cost Monitoring
                </h3>
                <button onClick={() => setShowCostGuide(false)} className="text-stone-400 hover:text-white">✕</button>
              </div>
              <div className="space-y-3 text-sm text-stone-300 leading-relaxed">
                <p>To monitor your personal usage costs in Google Cloud Console:</p>
                <ol className="list-decimal list-inside space-y-2">
                  <li>Go to <a href="https://console.cloud.google.com/billing" target="_blank" className="text-emerald-400 underline">GCP Billing</a></li>
                  <li>Select your project to see real-time cost charts.</li>
                  <li>Set up <b>Budgets &amp; Alerts</b> to get notified if spending exceeds $1.</li>
                  <li>Check <b>API &amp; Services &gt; Dashboard</b> to monitor Gemini &amp; Sheets usage.</li>
                </ol>
                <p className="text-xs bg-stone-800 p-3 rounded-xl border border-stone-700">
                  💡 <b>Pro Tip:</b> This app uses the Gemini Free Tier and standard Google APIs, which are typically free for personal use within limits.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!spreadsheetId ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-12 rounded-[3rem] shadow-xl border border-stone-100 max-w-md mx-auto"
          >
            <div className="w-20 h-20 bg-emerald-500 rounded-[1.5rem] flex items-center justify-center mx-auto mb-8 shadow-lg">
              <Database className="text-white w-10 h-10" />
            </div>
            <h2 className="text-3xl font-bold mb-4 tracking-tight text-center">Setup Spreadsheet</h2>
            <p className="text-stone-500 mb-8 text-center leading-relaxed">
              We need a Google Spreadsheet to store your transactions.
            </p>
            
            <div className="space-y-6">
              <button 
                onClick={handleCreateSpreadsheet}
                disabled={setupLoading}
                className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-bold hover:bg-emerald-600 transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {setupLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <PlusCircle className="w-5 h-5" />}
                Create New Spreadsheet
              </button>

              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-stone-200"></span></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-stone-400 font-bold tracking-widest">Or connect existing</span></div>
              </div>

              <form onSubmit={handleConnectExistingSpreadsheet} className="space-y-3">
                <input 
                  name="spreadsheetId"
                  placeholder="Paste Spreadsheet ID"
                  className="w-full bg-stone-50 border-none rounded-xl p-4 font-medium focus:ring-2 focus:ring-stone-900 transition-all"
                  required
                />
                <button 
                  type="submit"
                  className="w-full bg-stone-900 text-white py-4 rounded-xl font-bold hover:bg-stone-800 transition-all active:scale-95"
                >
                  Connect ID
                </button>
              </form>
            </div>
          </motion.div>
        ) : (
          <>
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-stone-900 text-white p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden"
            >
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-stone-400 text-sm font-medium uppercase tracking-widest">Total Balance (Last 6 Months)</p>
                  <button onClick={fetchTransactions} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <RefreshCw className={`w-4 h-4 text-stone-400 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <h2 className="text-6xl font-light tracking-tighter mb-6">
                  Rp{totalBalance.toLocaleString('id-ID', { minimumFractionDigits: 0 })}
                </h2>
                <div className="flex flex-wrap gap-4">
                  <button 
                    onClick={() => {
                      setEditingTransaction(null);
                      setShowForm(true);
                    }}
                    className="bg-white text-stone-900 px-6 py-3 rounded-full font-bold flex items-center gap-2 hover:bg-stone-100 transition-all active:scale-95"
                  >
                    <PlusCircle className="w-5 h-5" /> Add Transaction
                  </button>
                </div>
              </div>
              <div className="absolute top-[-20%] right-[-10%] w-80 h-80 bg-emerald-500/20 blur-[100px] rounded-full" />
            </motion.div>

            <AnimatePresence>
              {insight && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl relative overflow-hidden"
                >
                  <div className="flex items-start gap-4">
                    <div className="bg-emerald-500 p-2 rounded-xl mt-1">
                      <CheckCircle2 className="text-white w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-emerald-900 mb-1">Gemini Monthly Insight</h3>
                      <p className="text-emerald-800 leading-relaxed">{insight}</p>
                    </div>
                  </div>
                  {notifying && (
                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-600 uppercase tracking-widest">
                      <CalendarIcon className="w-4 h-4" /> Syncing to Google Calendar...
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <h3 className="font-bold text-lg">Recent Activity (6-Month History)</h3>
                <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">{transactions.length} Records</span>
              </div>
              <div className="grid gap-3">
                {transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((tx) => (
                  <motion.div 
                    layout
                    key={tx.rowIndex}
                    className="bg-white p-4 rounded-2xl border border-stone-200 flex items-center justify-between hover:border-stone-300 transition-colors group"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tx.type === 'income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {tx.type === 'income' ? <PlusCircle className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
                      </div>
                      <div>
                        <p className="font-bold text-stone-900">{tx.category || 'Uncategorized'}</p>
                        <p className="text-xs text-stone-400 font-medium">{format(new Date(tx.date), 'MMM dd, yyyy • HH:mm')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className={`font-bold text-lg ${tx.type === 'income' ? 'text-emerald-600' : 'text-stone-900'}`}>
                          {tx.type === 'income' ? '+' : '-'}Rp{tx.amount.toLocaleString('id-ID')}
                        </p>
                        <p className="text-xs text-stone-400 italic">{tx.description}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleEditClick(tx)}
                          className="p-2 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-900 transition-colors"
                          title="Edit"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteTransaction(tx.rowIndex)}
                          className="p-2 hover:bg-rose-50 rounded-lg text-stone-400 hover:text-rose-600 transition-colors"
                          title="Delete"
                        >
                          <LogOut className="w-4 h-4 rotate-90" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
                {transactions.length === 0 && !loading && (
                  <div className="text-center py-20 bg-stone-100/50 rounded-3xl border-2 border-dashed border-stone-200">
                    <p className="text-stone-400 font-medium">No transactions found in the last 6 months.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
              className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl relative z-10 border border-stone-100"
            >
              <h3 className="text-2xl font-bold mb-6 tracking-tight">{editingTransaction ? 'Edit Transaction' : 'New Transaction'}</h3>
              <form onSubmit={handleAddTransaction} className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <label className="relative">
                    <input type="radio" name="type" value="expense" defaultChecked={!editingTransaction || editingTransaction.type === 'expense'} className="peer sr-only" />
                    <div className="p-4 text-center rounded-2xl border-2 border-stone-100 peer-checked:border-stone-900 peer-checked:bg-stone-900 peer-checked:text-white cursor-pointer font-bold transition-all">Expense</div>
                  </label>
                  <label className="relative">
                    <input type="radio" name="type" value="income" defaultChecked={editingTransaction?.type === 'income'} className="peer sr-only" />
                    <div className="p-4 text-center rounded-2xl border-2 border-stone-100 peer-checked:border-emerald-500 peer-checked:bg-emerald-500 peer-checked:text-white cursor-pointer font-bold transition-all">Income</div>
                  </label>
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2 block">Amount</label>
                  <input 
                    required 
                    name="amount" 
                    type="number" 
                    step="0.01"
                    placeholder="0.00"
                    defaultValue={editingTransaction?.amount || ''}
                    className="w-full bg-stone-50 border-none rounded-2xl p-4 text-2xl font-bold focus:ring-2 focus:ring-stone-900 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2 block">Category</label>
                  <input 
                    name="category" 
                    placeholder="e.g. Food, Rent, Salary"
                    defaultValue={editingTransaction?.category || ''}
                    className="w-full bg-stone-50 border-none rounded-2xl p-4 font-medium focus:ring-2 focus:ring-stone-900 transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2 block">Description</label>
                  <textarea 
                    name="description" 
                    placeholder="What was this for?"
                    defaultValue={editingTransaction?.description || ''}
                    className="w-full bg-stone-50 border-none rounded-2xl p-4 font-medium focus:ring-2 focus:ring-stone-900 transition-all h-24 resize-none"
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full bg-stone-900 text-white py-4 rounded-2xl font-bold hover:bg-stone-800 transition-all shadow-lg active:scale-95"
                >
                  {editingTransaction ? 'Update Transaction' : 'Save Transaction'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {googleTokens && spreadsheetId && !showForm && (
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => {
            setEditingTransaction(null);
            setShowForm(true);
          }}
          className="fixed bottom-8 right-8 w-16 h-16 bg-stone-900 text-white rounded-full shadow-2xl flex items-center justify-center z-40 sm:hidden"
        >
          <PlusCircle className="w-8 h-8" />
        </motion.button>
      )}
    </div>
  );
}
