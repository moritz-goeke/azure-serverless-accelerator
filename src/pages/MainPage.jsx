import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Select,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import "katex/dist/katex.min.css";
import * as React from "react";
import AiMarkdown from "../components/AiMarkdown";
import {
  ACCENT_TEAL,
  BG_CARD,
  BG_DARK,
  BG_SURFACE,
  BORDER_COLOR,
  PRIMARY_TEAL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  WHITE,
  customScrollBar,
} from "../components/consts";
import { FooterLine } from "../components/Footer";
import NotificationSnackbar from "../components/NotificationSnackbar";
import Typewriter from "../components/Typewriter";

const CONVERSATION_CONTAINER = "Conversations";
const DEFAULT_ASSISTANT_MESSAGE =
  "Guten Tag! Ich bin Ihr medizinischer Dokumentationsassistent. Sie können mir Fragen zu Krankenakten, Diagnosen oder medizinischer Dokumentation stellen.";

// =====================================================================
// >>> NEUES MODELL HINZUFÜGEN? Hier einen neuen Eintrag ergänzen. <<<
// Der "value" muss mit dem Key in der deploymentMap im Backend
// (openai.js + documentStatus.js) übereinstimmen.
// =====================================================================
const MODELS = [
  { value: "gpt5mini", label: "GPT-5 Mini – schnell" },
  { value: "gpt4o", label: "GPT-4o – präzise" },
  // { value: "neuesModell", label: "Neues Modell – Beschreibung" },
];

const POLL_INTERVAL_MS = 5000;

const STEPS = ["Hochladen", "Text extrahieren", "KI-Zusammenfassung", "Fertig"];

const buildDefaultMessages = () => [
  { from: "gpt", message: DEFAULT_ASSISTANT_MESSAGE },
];

const normalizeResponsePayload = (payload) => {
  if (!payload) return null;
  if (typeof payload === "string") {
    try {
      return JSON.parse(payload);
    } catch (error) {
      console.error("Failed to parse response payload", error);
      return null;
    }
  }
  return payload;
};

const sortConversationsByUpdated = (items = []) =>
  [...items].sort((a, b) => {
    const aTime = a?.updatedAt ?? a?.createdAt ?? 0;
    const bTime = b?.updatedAt ?? b?.createdAt ?? 0;
    return bTime - aTime;
  });

const formatConversationTimestamp = (value) => {
  if (!value) return "";
  const numeric = typeof value === "string" ? Number(value) : value;
  const dateValue = Number.isFinite(numeric) ? new Date(numeric) : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(dateValue);
  } catch {
    return dateValue.toLocaleString();
  }
};

const buildDefaultTitle = () => formatConversationTimestamp(Date.now()) || "";

function MainPage() {
  const [selectedModel, setSelectedModel] = React.useState("gpt5mini");
  const [inputText, setInputText] = React.useState("");
  const [chatArray, setChatArray] = React.useState([]);
  const [typewriterIndex, setTypewriterIndex] = React.useState(null);
  const [loadingAnswer, setLoadingAnswer] = React.useState(false);
  const [skipAnimation, setSkipAnimation] = React.useState(false);
  const [writing, setWriting] = React.useState(false);
  const [conversations, setConversations] = React.useState([]);
  const [activeConversationId, setActiveConversationId] = React.useState(null);
  const [titleDraft, setTitleDraft] = React.useState(buildDefaultTitle);
  const [sidebarLoading, setSidebarLoading] = React.useState(true);
  const [sidebarBusy, setSidebarBusy] = React.useState(false);
  const [snackbarOpen, setSnackbarOpen] = React.useState(false);
  const [snackbarMessage, setSnackbarMessage] = React.useState("");
  const [uploadingDoc, setUploadingDoc] = React.useState(false);
  const [docStatus, setDocStatus] = React.useState(null);
  const [docSummary, setDocSummary] = React.useState(null);
  const [docExtractedText, setDocExtractedText] = React.useState(null);
  const [docFileName, setDocFileName] = React.useState(null);
  const [useDocContext, setUseDocContext] = React.useState(true);
  const [dragOver, setDragOver] = React.useState(false);
  const [chatOpen, setChatOpen] = React.useState(false);
  const messagesRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const pollingRef = React.useRef(null);

  const activeStep =
    docStatus === "completed" ? 4
    : docStatus === "summarizing" ? 2
    : docStatus === "analyzing" ? 1
    : uploadingDoc ? 2  // POST now does extract + summarize in one step
    : -1;

  const showSnackbar = React.useCallback((msg) => {
    if (!msg) return;
    setSnackbarMessage(msg);
    setSnackbarOpen(true);
  }, []);

  const stopPolling = React.useCallback(() => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }, []);

  React.useEffect(() => () => stopPolling(), [stopPolling]);

  const pollDocumentStatus = React.useCallback(
    (jobId) => {
      stopPolling();
      setDocStatus("summarizing");
      pollingRef.current = setInterval(async () => {
        try {
          const res = await axios.get(`/api/documentStatus/${jobId}`);
          const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
          setDocStatus(data.status);
          if (data.status === "completed") {
            stopPolling();
            setDocSummary(data.summary || data.extractedText || "Keine Zusammenfassung verfügbar.");
          } else if (data.status === "failed") {
            stopPolling();
            setDocSummary(null);
            showSnackbar(data.error || "Dokumentanalyse fehlgeschlagen.");
          }
        } catch {
          stopPolling();
          setDocStatus("failed");
          showSnackbar("Statusabfrage fehlgeschlagen.");
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling, showSnackbar]
  );

  const handleFileUpload = React.useCallback(
    async (file) => {
      if (!file) return;
      if (file.size > 10 * 1024 * 1024) { showSnackbar("Datei zu groß (max. 10 MB)."); return; }
      setUploadingDoc(true);
      setDocSummary(null);
      setDocExtractedText(null);
      setDocStatus(null);
      setDocFileName(file.name);
      try {
        const base64 = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result.split(",")[1]);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        const res = await axios.post("/api/analyzeDocument", { document: base64, fileName: file.name, model: selectedModel });
        console.log("analyzeDocument raw response:", typeof res.data, res.data);
        // Parse response – handle string, nested body, or direct object
        let data = res.data;
        if (typeof data === "string") {
          try { data = JSON.parse(data); } catch { console.error("Failed to parse response string"); }
        }
        // Azure Functions sometimes wraps response in a body property
        if (data && typeof data.body === "string") {
          try { data = JSON.parse(data.body); } catch { data = data.body; }
        }
        console.log("analyzeDocument parsed data:", data);
        console.log("data.status:", data?.status, "data.summary length:", data?.summary?.length, "data.extractedText length:", data?.extractedText?.length);

        const summary = data?.summary || data?.extractedText || "Keine Zusammenfassung verf\u00fcgbar.";
        if (data?.status === "completed" || data?.summary) {
          // Summary returned directly from POST \u2013 no polling needed
          setDocStatus("completed");
          setDocSummary(summary);
          setDocExtractedText(data?.extractedText || summary);
          showSnackbar("Dokument erfolgreich analysiert.");
        } else if (data?.jobId) {
          // Fallback: poll if still processing
          pollDocumentStatus(data.jobId);
          showSnackbar("Dokument wird verarbeitet\u2026");
        } else {
          // Unexpected response \u2013 still try to show whatever we got
          console.error("Unexpected analyzeDocument response:", data);
          setDocStatus("completed");
          setDocSummary(summary);
          showSnackbar("Antwort erhalten.");
        }

      } catch {
        showSnackbar("Fehler beim Hochladen.");
        setDocStatus("failed");
      } finally { setUploadingDoc(false); }
    },
    [selectedModel, pollDocumentStatus, showSnackbar]
  );

  const handleDrop = React.useCallback((e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer?.files?.[0]; if (f) handleFileUpload(f); }, [handleFileUpload]);
  const handleDragOver = React.useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = React.useCallback(() => setDragOver(false), []);

  const loadConversation = React.useCallback((conversation) => {
    if (!conversation) return;
    const msgs = conversation.messages?.length ? conversation.messages.map((m) => ({ ...m })) : buildDefaultMessages();
    setChatArray(msgs);
    setActiveConversationId(conversation.id);
    setTitleDraft(conversation.title || "");
    setSkipAnimation(false);
    setTypewriterIndex(conversation.messages?.length ? null : 0);
  }, []);

  const upsertConversation = React.useCallback((item) => {
    if (!item?.id) return;
    setConversations((prev) => sortConversationsByUpdated([item, ...prev.filter((c) => c.id !== item.id)]));
  }, []);

  const fetchConversationList = React.useCallback(async () => {
    const response = await axios.post("/api/readItems", { container: CONVERSATION_CONTAINER });
    const sorted = sortConversationsByUpdated(normalizeResponsePayload(response.data) || []);
    setConversations(sorted);
    return sorted;
  }, []);

  const handleCreateConversation = React.useCallback(() => {
    setChatArray(buildDefaultMessages());
    setActiveConversationId(null);
    setTitleDraft(buildDefaultTitle());
    setSkipAnimation(false);
    setTypewriterIndex(0);
  }, []);

  const initializeConversations = React.useCallback(async () => {
    setSidebarLoading(true);
    try {
      const sorted = await fetchConversationList();
      if (sorted.length) loadConversation(sorted[0]); else handleCreateConversation();
    } catch { showSnackbar("Gespräche konnten nicht geladen werden."); } finally { setSidebarLoading(false); }
  }, [fetchConversationList, handleCreateConversation, loadConversation, showSnackbar]);

  React.useEffect(() => { initializeConversations(); }, [initializeConversations]);
  React.useEffect(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight; }, [chatArray, writing, loadingAnswer]);
  React.useEffect(() => { if (!writing && inputRef.current) inputRef.current.focus(); }, [writing, loadingAnswer]);

  const handleSelectConversation = (id) => {
    if (sidebarBusy || !id || id === activeConversationId) return;
    const c = conversations.find((conv) => conv.id === id);
    if (c) loadConversation(c);
  };

  const handleDeleteConversation = async (event, conversationId) => {
    event?.stopPropagation();
    const targetId = conversationId ?? activeConversationId;
    if (!targetId) { handleCreateConversation(); return; }
    setSidebarBusy(true);
    try {
      await axios.post("/api/deleteItem", { container: CONVERSATION_CONTAINER, itemId: targetId });
      let next = null;
      setConversations((prev) => { const f = prev.filter((c) => c.id !== targetId); next = f[0] || null; return f; });
      if (targetId === activeConversationId) { if (next) loadConversation(next); else handleCreateConversation(); }
      showSnackbar("Gespräch gelöscht.");
    } catch { showSnackbar("Löschen fehlgeschlagen."); } finally { setSidebarBusy(false); }
  };

  const handleSaveConversation = React.useCallback(async () => {
    setSidebarBusy(true);
    try {
      const trimmed = titleDraft.trim();
      const payload = { messages: chatArray };
      if (trimmed) payload.title = trimmed;
      if (activeConversationId) {
        const res = await axios.post("/api/updateItem", { container: CONVERSATION_CONTAINER, itemId: activeConversationId, item: payload });
        const u = normalizeResponsePayload(res.data);
        if (u) { upsertConversation(u); setTitleDraft(u.title || trimmed || ""); showSnackbar("Gespeichert."); }
      } else {
        const res = await axios.post("/api/createItem", { container: CONVERSATION_CONTAINER, item: payload });
        const c = normalizeResponsePayload(res.data);
        if (c) { upsertConversation(c); setActiveConversationId(c.id); setTitleDraft(c.title || trimmed || ""); showSnackbar("Gespeichert."); }
      }
    } catch { showSnackbar("Speichern fehlgeschlagen."); } finally { setSidebarBusy(false); }
  }, [activeConversationId, chatArray, titleDraft, upsertConversation, showSnackbar]);

  const sendMessage = async (text) => {
    if (!text?.trim()) return;
    const trimmedText = text.trim();
    const conversation = [...chatArray, { from: "user", message: trimmedText }];
    setChatArray(conversation);
    setInputText("");
    setLoadingAnswer(true);
    setWriting(true);
    try {
      const response = await axios.post("/api/openai", {
        message: trimmedText,
        conversation: JSON.stringify(conversation),
        model: selectedModel,
        ...(useDocContext && docExtractedText ? { documentContext: docExtractedText, documentName: docFileName } : {}),
      });
      let data = response.data;
      if (typeof data === "string") try { data = JSON.parse(data); } catch {}
      const gptContent = data?.choices?.[0]?.message?.content || "(Keine Antwort erhalten)";
      const updated = [...conversation, { from: "gpt", message: gptContent }];
      setChatArray(updated);
      setSkipAnimation(false);
      setTypewriterIndex(updated.length - 1);
    } catch {
      setChatArray((arr) => [...arr, { from: "gpt", message: "Fehler beim Abrufen der Antwort.", error: true }]);
    } finally { setLoadingAnswer(false); setWriting(false); }
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", bgcolor: "#f0f4f8", overflow: "hidden", height: "100vh" }}>
      <NotificationSnackbar open={snackbarOpen} setOpen={setSnackbarOpen} message={snackbarMessage} />

      {/* ─── Header ─── */}
      <Box
        sx={{
          height: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 3,
          bgcolor: WHITE,
          borderBottom: "1px solid #e0e6ec",
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
          <LocalHospitalIcon sx={{ color: PRIMARY_TEAL, fontSize: 28 }} />
          <Typography sx={{ fontFamily: "'Inter',sans-serif", fontSize: 19, fontWeight: 700, color: "#1a2b3c", letterSpacing: -0.3 }}>
            MedDoc
          </Typography>
          <Typography sx={{ fontSize: 13, color: "#7a8da0", ml: 0.5, fontWeight: 400 }}>
            Krankenakten-Zusammenfassung
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography sx={{ fontSize: 12, color: "#7a8da0" }}>Modell</Typography>
          <Select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            size="small"
            sx={{
              fontSize: 13,
              bgcolor: "#f7f9fb",
              ".MuiOutlinedInput-notchedOutline": { borderColor: "#dce3ea" },
              "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: PRIMARY_TEAL },
              minWidth: 170,
              borderRadius: 2,
            }}
          >
            {MODELS.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
          </Select>
        </Box>
      </Box>

      {/* ─── Body ─── */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* ═══ Left: Document Analysis (primary) ═══ */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflowY: "auto",
            p: { xs: 2, md: 4 },
            gap: 3,
            ...customScrollBar("#b0bec5"),
          }}
        >
          {/* Upload */}
          <Box
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            sx={{
              border: `2px dashed ${dragOver ? PRIMARY_TEAL : "#c8d3de"}`,
              borderRadius: 4,
              p: { xs: 4, md: 6 },
              textAlign: "center",
              cursor: "pointer",
              bgcolor: dragOver ? "rgba(0,151,167,0.06)" : WHITE,
              transition: "all 0.2s",
              "&:hover": { borderColor: PRIMARY_TEAL, bgcolor: "rgba(0,151,167,0.03)" },
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept=".pdf"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = ""; }}
            />
            <CloudUploadIcon sx={{ fontSize: 52, color: PRIMARY_TEAL, mb: 1.5 }} />
            <Typography sx={{ fontSize: 18, fontWeight: 600, color: "#1a2b3c", mb: 0.5 }}>
              Krankenakte hochladen
            </Typography>
            <Typography sx={{ fontSize: 13, color: "#7a8da0" }}>
              PDF-Datei per Drag & Drop oder Klick hochladen (max. 10 MB)
            </Typography>
          </Box>

          {/* Stepper Progress */}
          {activeStep >= 0 && (
            <Box sx={{ bgcolor: WHITE, borderRadius: 3, p: 3, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                {docFileName && (
                  <Chip
                    icon={<FolderOpenIcon sx={{ fontSize: 16 }} />}
                    label={docFileName}
                    size="small"
                    sx={{ bgcolor: "#e8f5e9", color: "#2e7d32", fontWeight: 500, fontSize: 12 }}
                  />
                )}
                {docStatus === "failed" && (
                  <Chip
                    icon={<ErrorOutlineIcon sx={{ fontSize: 16 }} />}
                    label="Fehlgeschlagen"
                    size="small"
                    color="error"
                    sx={{ fontWeight: 500, fontSize: 12 }}
                  />
                )}
              </Box>
              <Stepper
                activeStep={docStatus === "failed" ? -1 : activeStep}
                alternativeLabel
                sx={{
                  ".MuiStepIcon-root.Mui-active": { color: PRIMARY_TEAL },
                  ".MuiStepIcon-root.Mui-completed": { color: "#43a047" },
                  ".MuiStepLabel-label": { fontSize: 12, mt: 0.5 },
                }}
              >
                {STEPS.map((label) => (
                  <Step key={label}><StepLabel>{label}</StepLabel></Step>
                ))}
              </Stepper>
              {(docStatus === "analyzing" || docStatus === "summarizing" || uploadingDoc) && (
                <LinearProgress
                  sx={{
                    mt: 2,
                    borderRadius: 2,
                    height: 5,
                    bgcolor: "#e0e6ec",
                    "& .MuiLinearProgress-bar": { bgcolor: docStatus === "summarizing" ? "#42a5f5" : PRIMARY_TEAL },
                  }}
                />
              )}
            </Box>
          )}

          {/* Summary Result */}
          {docSummary && (
            <Box
              sx={{
                bgcolor: WHITE,
                borderRadius: 3,
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                overflow: "hidden",
              }}
            >
              <Box
                sx={{
                  px: 3,
                  py: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  bgcolor: "#e8f5e9",
                  borderBottom: "1px solid #c8e6c9",
                }}
              >
                <CheckCircleOutlineIcon sx={{ color: "#43a047", fontSize: 22 }} />
                <Typography sx={{ fontSize: 15, fontWeight: 600, color: "#1b5e20" }}>
                  Strukturierte Zusammenfassung
                </Typography>
              </Box>
              <Box
                sx={{
                  px: 3,
                  py: 2.5,
                  maxHeight: "55vh",
                  overflowY: "auto",
                  ...customScrollBar("#b0bec5"),
                  color: "#1a2b3c",
                  fontSize: 14,
                  lineHeight: 1.7,
                  "& strong": { color: "#00695c" },
                  "& h1,& h2,& h3": { color: "#1a2b3c", mt: 2, mb: 1 },
                  "& ul,& ol": { pl: 3 },
                }}
              >
                <AiMarkdown>{docSummary}</AiMarkdown>
              </Box>
            </Box>
          )}

          {/* Disclaimer */}
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1.5,
              p: 2,
              borderRadius: 2.5,
              bgcolor: "#fff8e1",
              border: "1px solid #ffe082",
            }}
          >
            <InfoOutlinedIcon sx={{ color: "#f9a825", fontSize: 20, mt: 0.2 }} />
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#5d4037", mb: 0.2 }}>
                Hinweis zur medizinischen Nutzung
              </Typography>
              <Typography sx={{ fontSize: 12, color: "#6d4c41", lineHeight: 1.6 }}>
                KI-generierte Zusammenfassungen dienen ausschließlich der Dokumentationsunterstützung
                und ersetzen keine ärztliche Befundung. Ergebnisse sind stets von Fachpersonal zu prüfen.
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* ═══ Right: Chat + Conversations ═══ */}
        <Box
          sx={{
            width: 420,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            borderLeft: "1px solid #e0e6ec",
            bgcolor: WHITE,
          }}
        >
          {/* Chat Header */}
          <Box
            sx={{
              px: 2,
              py: 1.5,
              borderBottom: "1px solid #e0e6ec",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: "#1a2b3c" }}>
              Medizinischer Assistent
            </Typography>
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Button
                size="small"
                startIcon={<AddCircleOutlineIcon />}
                onClick={handleCreateConversation}
                disabled={sidebarBusy || writing}
                sx={{ textTransform: "none", fontSize: 12, color: PRIMARY_TEAL }}
              >
                Neu
              </Button>
              <Button
                size="small"
                onClick={handleSaveConversation}
                disabled={sidebarBusy || writing || loadingAnswer}
                sx={{ textTransform: "none", fontSize: 12, color: "#7a8da0" }}
              >
                Speichern
              </Button>
            </Box>
          </Box>

          {/* Chat Messages */}
          <Box
            ref={messagesRef}
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              p: 2,
              gap: 1.2,
              ...customScrollBar("#b0bec5"),
              minHeight: 0,
            }}
          >
            <Box sx={{ flex: 1, minHeight: 0 }} />
            {chatArray.map((msg, idx) => (
              <Box
                key={idx}
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: msg.from === "user" ? "flex-end" : "flex-start",
                }}
              >
                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    borderRadius: msg.from === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    bgcolor: msg.from === "user" ? PRIMARY_TEAL : "#f0f4f8",
                    color: msg.from === "user" ? WHITE : "#1a2b3c",
                    maxWidth: "85%",
                    fontSize: 14,
                    lineHeight: 1.55,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                  }}
                >
                  {msg.from === "gpt" && !msg.error && typewriterIndex === idx ? (
                    <Typewriter
                      text={msg.message}
                      delay={10}
                      skipAnimation={skipAnimation}
                      setSkipAnimation={setSkipAnimation}
                      setWriting={setWriting}
                      onComplete={() => setTypewriterIndex(null)}
                    />
                  ) : (
                    <AiMarkdown>{msg.message}</AiMarkdown>
                  )}
                </Box>
              </Box>
            ))}
            {loadingAnswer && (
              <Box sx={{ alignSelf: "flex-start", mt: 0.5 }}>
                <LinearProgress
                  sx={{
                    width: 100,
                    borderRadius: 2,
                    bgcolor: "#e0e6ec",
                    "& .MuiLinearProgress-bar": { bgcolor: PRIMARY_TEAL },
                  }}
                />
              </Box>
            )}
          </Box>

          {/* Chat Input */}
          <Box sx={{ px: 2, py: 1.5, borderTop: "1px solid #e0e6ec" }}>
            {docSummary && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={useDocContext}
                    onChange={(e) => setUseDocContext(e.target.checked)}
                    size="small"
                    sx={{ py: 0, color: PRIMARY_TEAL, "&.Mui-checked": { color: PRIMARY_TEAL } }}
                  />
                }
                label={
                  <Typography sx={{ fontSize: 12, color: "#7a8da0" }}>
                    Dokument „{docFileName}“ als Kontext verwenden
                  </Typography>
                }
                sx={{ mb: 0.5, ml: 0 }}
              />
            )}
            <TextField
              disabled={writing}
              variant="outlined"
              placeholder="Frage eingeben…"
              fullWidth
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(inputText); } }}
              size="small"
              sx={{
                ".MuiOutlinedInput-root": {
                  borderRadius: 3,
                  bgcolor: "#f7f9fb",
                  fontSize: 14,
                  "& fieldset": { borderColor: "#dce3ea" },
                  "&:hover fieldset": { borderColor: PRIMARY_TEAL },
                },
              }}
              slotProps={{
                htmlInput: { ref: inputRef },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      {writing ? (
                        <IconButton size="small" onClick={() => setSkipAnimation(true)}>
                          <StopRoundedIcon sx={{ color: ACCENT_TEAL, fontSize: 20 }} />
                        </IconButton>
                      ) : (
                        <IconButton size="small" onClick={() => sendMessage(inputText)} disabled={writing}>
                          <SendRoundedIcon sx={{ color: PRIMARY_TEAL, fontSize: 20 }} />
                        </IconButton>
                      )}
                    </InputAdornment>
                  ),
                },
              }}
              multiline
              maxRows={3}
              spellCheck={false}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </Box>

          {/* Conversations Accordion */}
          <Accordion
            expanded={chatOpen}
            onChange={(_, v) => setChatOpen(v)}
            disableGutters
            elevation={0}
            sx={{ borderTop: "1px solid #e0e6ec", "&:before": { display: "none" } }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 40, px: 2 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: "#7a8da0", textTransform: "uppercase", letterSpacing: 0.5 }}>
                Gespeicherte Gespräche ({conversations.length})
              </Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0, maxHeight: 220, overflowY: "auto", ...customScrollBar("#b0bec5") }}>
              <TextField
                variant="standard"
                label="Titel"
                size="small"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                disabled={sidebarBusy}
                sx={{ mx: 2, mb: 1, width: "calc(100% - 32px)", ".MuiInput-root": { fontSize: 13 }, ".MuiFormLabel-root": { fontSize: 12 } }}
              />
              {sidebarLoading ? (
                <Typography sx={{ color: "#7a8da0", fontSize: 12, px: 2, py: 1 }}>Laden…</Typography>
              ) : conversations.length ? (
                conversations.map((conv) => {
                  const active = conv.id === activeConversationId;
                  return (
                    <Box
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      sx={{
                        px: 2,
                        py: 0.8,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        bgcolor: active ? "#e3f2fd" : "transparent",
                        borderLeft: active ? `3px solid ${PRIMARY_TEAL}` : "3px solid transparent",
                        "&:hover": { bgcolor: active ? "#e3f2fd" : "#f5f7fa" },
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: active ? 600 : 400, color: "#1a2b3c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {conv.title || "(Ohne Titel)"}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: "#9aa8b4" }}>
                          {formatConversationTimestamp(conv.updatedAt || conv.createdAt)}
                        </Typography>
                      </Box>
                      <IconButton size="small" onClick={(e) => handleDeleteConversation(e, conv.id)} disabled={sidebarBusy} sx={{ color: "#9aa8b4" }}>
                        <DeleteOutlineOutlinedIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </Box>
                  );
                })
              ) : (
                <Typography sx={{ color: "#9aa8b4", fontSize: 12, px: 2, py: 1 }}>Keine Gespräche</Typography>
              )}
            </AccordionDetails>
          </Accordion>

          {sidebarBusy && (
            <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(255,255,255,0.7)", zIndex: 2 }}>
              <CircularProgress size={24} sx={{ color: PRIMARY_TEAL }} />
            </Box>
          )}
        </Box>
      </Box>

      {/* ─── Footer ─── */}
      <Box sx={{ textAlign: "center", py: 0.6, borderTop: "1px solid #e0e6ec", bgcolor: WHITE }}>
        <FooterLine typographySx={{ fontSize: 11, color: "#9aa8b4" }}>
          MedDoc – KI-gestützte Dokumentenanalyse • Azure Serverless
        </FooterLine>
      </Box>
    </Box>
  );
}

export default MainPage;
