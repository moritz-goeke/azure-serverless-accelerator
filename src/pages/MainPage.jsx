import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DescriptionIcon from "@mui/icons-material/Description";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import SummarizeIcon from "@mui/icons-material/Summarize";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Icon,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import "katex/dist/katex.min.css";
import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import AzureLogo from "../assets/azure_logo.png";
import AiMarkdown from "../components/AiMarkdown";
import {
  ACCENT_BLUE,
  ACCENT_TEAL,
  AZURE_FUNCTION_COST_CT_PER_GB_SECOND,
  BG_CARD,
  BG_DARK,
  BG_SURFACE,
  BORDER_COLOR,
  HEADER_GRADIENT,
  LIGHT_BLUE,
  PRIMARY_TEAL,
  TEXT_MUTED,
  TEXT_PRIMARY,
  WHITE,
  costInCentPerInputToken,
  costInCentPerOutputToken,
  customScrollBar,
} from "../components/consts";
import { FooterLine } from "../components/Footer";
import { beautifyCostCentValue } from "../components/helpers";
import NotificationSnackbar from "../components/NotificationSnackbar";
import Typewriter from "../components/Typewriter";

const CONVERSATION_CONTAINER = "Conversations";
const DEFAULT_ASSISTANT_MESSAGE =
  "Willkommen beim MedDoc-Assistenten. Laden Sie eine Krankenakte hoch oder stellen Sie eine medizinische Frage.";

const MODELS = [
  { value: "gpt5mini", label: "GPT-5 Mini (schnell)" },
  { value: "gpt4o", label: "GPT-4o (präzise)" },
];

const POLL_INTERVAL_MS = 3000;

const buildDefaultMessages = () => [
  {
    from: "gpt",
    message: DEFAULT_ASSISTANT_MESSAGE,
  },
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

const sortConversationsByUpdated = (items = []) => {
  return [...items].sort((a, b) => {
    const aTime = a?.updatedAt ?? a?.createdAt ?? 0;
    const bTime = b?.updatedAt ?? b?.createdAt ?? 0;
    return bTime - aTime;
  });
};

const formatConversationTimestamp = (value) => {
  if (!value) return "";
  const numeric = typeof value === "string" ? Number(value) : value;
  const dateValue = Number.isFinite(numeric)
    ? new Date(numeric)
    : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(dateValue);
  } catch (error) {
    console.warn("Falling back to locale string for timestamp", error);
    return dateValue.toLocaleString();
  }
};

const buildDefaultTitle = () => formatConversationTimestamp(Date.now()) || "";

function MainPage() {
  const [selectedModel, setSelectedModel] = React.useState("gpt5mini");
  const [activeTab, setActiveTab] = React.useState(0);
  const [inputText, setInputText] = React.useState("");
  const [chatArray, setChatArray] = React.useState([]);
  const [typewriterIndex, setTypewriterIndex] = React.useState(null);
  const [promptTokens, setPromptTokens] = React.useState(0);
  const [completionTokens, setCompletionTokens] = React.useState(0);
  const [sessionCostConsumption, setSessionCostConsumption] = React.useState(0);
  const [functionExecutionTime, setFunctionExecutionTime] = React.useState(0);
  const [functionComputeCost, setFunctionComputeCost] = React.useState(0);
  const [totalOverallCost, setTotalOverallCost] = React.useState(0);
  const [chartHistory, setChartHistory] = React.useState([]);
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
  const [docJobId, setDocJobId] = React.useState(null);
  const [docStatus, setDocStatus] = React.useState(null);
  const [docSummary, setDocSummary] = React.useState(null);
  const [docFileName, setDocFileName] = React.useState(null);
  const [dragOver, setDragOver] = React.useState(false);
  const messagesRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const fileInputRef = React.useRef(null);
  const pollingRef = React.useRef(null);

  const showSnackbar = React.useCallback((message) => {
    if (!message) return;
    setSnackbarMessage(message);
    setSnackbarOpen(true);
  }, []);

  const stopPolling = React.useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const pollDocumentStatus = React.useCallback(
    (jobId) => {
      stopPolling();
      setDocStatus("analyzing");
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
        } catch (err) {
          console.error("Polling error:", err);
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
      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        showSnackbar("Datei zu groß. Maximal 10 MB.");
        return;
      }
      setUploadingDoc(true);
      setDocSummary(null);
      setDocStatus(null);
      setDocFileName(file.name);
      try {
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res = await axios.post("/api/analyzeDocument", {
          document: base64,
          fileName: file.name,
          model: selectedModel,
        });
        const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
        if (data.jobId) {
          setDocJobId(data.jobId);
          pollDocumentStatus(data.jobId);
          showSnackbar("Dokument wird analysiert...");
        }
      } catch (err) {
        console.error("Upload error:", err);
        showSnackbar("Fehler beim Hochladen des Dokuments.");
        setDocStatus("failed");
      } finally {
        setUploadingDoc(false);
      }
    },
    [selectedModel, pollDocumentStatus, showSnackbar]
  );

  const handleDrop = React.useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleDragOver = React.useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = React.useCallback(() => {
    setDragOver(false);
  }, []);

  const resetSessionStats = React.useCallback(() => {
    setPromptTokens(0);
    setCompletionTokens(0);
    setSessionCostConsumption(0);
    setFunctionExecutionTime(0);
    setFunctionComputeCost(0);
    setTotalOverallCost(0);
    setChartHistory([]);
  }, []);

  const loadConversation = React.useCallback(
    (conversation) => {
      if (!conversation) return;
      const nextMessages =
        conversation.messages && conversation.messages.length
          ? conversation.messages.map((message) => ({ ...message }))
          : buildDefaultMessages();
      setChatArray(nextMessages);
      setActiveConversationId(conversation.id);
      const nextTitle = conversation.title || "";
      setTitleDraft(nextTitle);
      setSkipAnimation(false);
      const hasMessages = conversation?.messages?.length;
      setTypewriterIndex(hasMessages ? null : 0);
      resetSessionStats();
    },
    [resetSessionStats]
  );

  const upsertConversation = React.useCallback((item) => {
    if (!item?.id) return;
    setConversations((prev) => {
      const without = prev.filter((conv) => conv.id !== item.id);
      return sortConversationsByUpdated([item, ...without]);
    });
  }, []);

  const fetchConversationList = React.useCallback(async () => {
    const response = await axios.post("/api/readItems", {
      container: CONVERSATION_CONTAINER,
    });
    const parsed = normalizeResponsePayload(response.data) || [];
    const sorted = sortConversationsByUpdated(parsed);
    setConversations(sorted);
    return sorted;
  }, []);

  const handleCreateConversation = React.useCallback(() => {
    setChatArray(buildDefaultMessages());
    setActiveConversationId(null);
    setTitleDraft(buildDefaultTitle());
    setSkipAnimation(false);
    setTypewriterIndex(0);
    resetSessionStats();
  }, [resetSessionStats]);

  const initializeConversations = React.useCallback(async () => {
    setSidebarLoading(true);
    try {
      const sorted = await fetchConversationList();
      if (sorted.length) {
        loadConversation(sorted[0]);
      } else {
        handleCreateConversation();
      }
    } catch (error) {
      console.error("Failed to load conversations", error);
      showSnackbar("Failed to load conversations. Please try again.");
    } finally {
      setSidebarLoading(false);
    }
  }, [
    fetchConversationList,
    handleCreateConversation,
    loadConversation,
    showSnackbar,
  ]);

  React.useEffect(() => {
    initializeConversations();
  }, [initializeConversations]);

  React.useEffect(() => {
    if (messagesRef.current) {
      try {
        messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
      } catch (error) {
        console.warn("Failed to auto-scroll messages", error);
      }
    }
  }, [chatArray, writing, loadingAnswer]);

  React.useEffect(() => {
    if (!writing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [writing, loadingAnswer]);

  const handleSelectConversation = (conversationId) => {
    if (sidebarBusy) return;
    if (!conversationId || conversationId === activeConversationId) return;
    const conversation = conversations.find(
      (conv) => conv.id === conversationId
    );
    if (conversation) {
      loadConversation(conversation);
    }
  };

  const handleDeleteConversation = async (event, conversationId) => {
    event?.stopPropagation();
    const targetId = conversationId ?? activeConversationId;
    if (!targetId) {
      handleCreateConversation();
      return;
    }
    setSidebarBusy(true);
    try {
      await axios.post("/api/deleteItem", {
        container: CONVERSATION_CONTAINER,
        itemId: targetId,
      });
      let nextConversation = null;
      setConversations((prev) => {
        const filtered = prev.filter((conv) => conv.id !== targetId);
        nextConversation = filtered[0] || null;
        return filtered;
      });
      if (targetId === activeConversationId) {
        if (nextConversation) {
          loadConversation(nextConversation);
        } else {
          handleCreateConversation();
        }
      }
      showSnackbar("Conversation deleted.");
    } catch (error) {
      console.error("Failed to delete conversation", error);
      showSnackbar("Failed to delete conversation.");
    } finally {
      setSidebarBusy(false);
    }
  };

  const handleSaveConversation = React.useCallback(async () => {
    setSidebarBusy(true);
    try {
      const trimmedTitle = titleDraft.trim();
      const itemPayload = { messages: chatArray };
      if (trimmedTitle) {
        itemPayload.title = trimmedTitle;
      }

      if (activeConversationId) {
        const response = await axios.post("/api/updateItem", {
          container: CONVERSATION_CONTAINER,
          itemId: activeConversationId,
          item: itemPayload,
        });
        const updated = normalizeResponsePayload(response.data);
        if (updated) {
          upsertConversation(updated);
          setTitleDraft(updated.title || trimmedTitle || "");
          showSnackbar("Conversation updated.");
        }
      } else {
        const response = await axios.post("/api/createItem", {
          container: CONVERSATION_CONTAINER,
          item: itemPayload,
        });
        const created = normalizeResponsePayload(response.data);
        if (created) {
          upsertConversation(created);
          setActiveConversationId(created.id);
          setTitleDraft(created.title || trimmedTitle || "");
          showSnackbar("Conversation saved.");
        }
      }
    } catch (error) {
      console.error("Failed to save conversation", error);
      showSnackbar("Failed to save conversation.");
    } finally {
      setSidebarBusy(false);
    }
  }, [
    activeConversationId,
    chatArray,
    titleDraft,
    upsertConversation,
    showSnackbar,
  ]);

  const sendMessage = async (text, addToChat = true) => {
    if (!text || !text.trim()) return;
    const trimmedText = text.trim();
    const userMessage = { from: "user", message: trimmedText };
    const conversation = addToChat
      ? [...chatArray, userMessage]
      : [...chatArray];
    setChatArray(conversation);
    setInputText("");
    setLoadingAnswer(true);
    setWriting(true);
    const start = Date.now();
    try {
      const response = await axios.post("/api/openai", {
        message: trimmedText,
        conversation: JSON.stringify(conversation),
        model: selectedModel,
      });
      let data = response.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (parseError) {
          console.warn("Failed to parse OpenAI response", parseError);
        }
      }
      const end = Date.now();
      const execMs = end - start;
      const usage = data?.usage || {};
      const pt = usage.prompt_tokens || 0;
      const ct = usage.completion_tokens || 0;
      const aiCostSingle =
        pt * costInCentPerInputToken[selectedModel] +
        ct * costInCentPerOutputToken[selectedModel];
      const execSeconds = execMs / 1000;
      const funcCostSingle =
        execSeconds * 1 * AZURE_FUNCTION_COST_CT_PER_GB_SECOND;
      const totalSingle = aiCostSingle + funcCostSingle;

      setPromptTokens((p) => p + pt);
      setCompletionTokens((p) => p + ct);
      setSessionCostConsumption((c) => c + aiCostSingle);
      setFunctionExecutionTime((t) => t + execMs);
      setFunctionComputeCost((c) => c + funcCostSingle);
      setTotalOverallCost((c) => c + totalSingle);
      setChartHistory((h) => {
        const next = [
          ...h,
          {
            timestamp: new Date().toISOString(),
            promptTokens: pt,
            completionTokens: ct,
            executionTime: execMs,
            cost: totalSingle,
          },
        ];
        return next.slice(-20);
      });
      const gptContent =
        data?.choices?.[0]?.message?.content || "(no response received)";
      const updatedConversation = [
        ...conversation,
        { from: "gpt", message: gptContent },
      ];
      setChatArray(updatedConversation);
      setSkipAnimation(false);
      setTypewriterIndex(updatedConversation.length - 1);
    } catch (error) {
      console.error("Failed to send message", error);
      setChatArray((arr) => [
        ...arr,
        { from: "gpt", message: "Error fetching the response", error: true },
      ]);
    } finally {
      setLoadingAnswer(false);
      setWriting(false);
    }
  };

  const fontMono = { fontFamily: "'Inter', 'Segoe UI', sans-serif", fontSize: 12, letterSpacing: 0.3 };
  const metricRow = (label, value) => (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Typography sx={{ ...fontMono, color: TEXT_MUTED }}>{label}</Typography>
      <Typography sx={{ ...fontMono, fontWeight: 600, color: TEXT_PRIMARY }}>
        {value}
      </Typography>
    </Box>
  );

  const cumulative = React.useMemo(() => {
    const base = { tokensPrompt: [], tokensCompletion: [], exec: [], cost: [] };
    chartHistory.reduce((acc, entry, idx) => {
      const nextIndex = idx + 1;
      const lastPT = acc.tokensPrompt[acc.tokensPrompt.length - 1]?.value || 0;
      const lastCT =
        acc.tokensCompletion[acc.tokensCompletion.length - 1]?.value || 0;
      const lastExec = acc.exec[acc.exec.length - 1]?.value || 0;
      const lastCost = acc.cost[acc.cost.length - 1]?.value || 0;
      acc.tokensPrompt.push({
        index: nextIndex,
        value: lastPT + entry.promptTokens,
      });
      acc.tokensCompletion.push({
        index: nextIndex,
        value: lastCT + entry.completionTokens,
      });
      acc.exec.push({
        index: nextIndex,
        value: lastExec + entry.executionTime,
      });
      acc.cost.push({ index: nextIndex, value: lastCost + entry.cost });
      return acc;
    }, base);
    return base;
  }, [chartHistory]);

  const chartCard = (title, lines) => (
    <Box
      sx={{
        p: 1.5,
        background: BG_CARD,
        borderRadius: 2,
        border: `1px solid ${BORDER_COLOR}`,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        height: 180,
      }}
    >
      <Typography
        sx={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: PRIMARY_TEAL,
        }}
      >
        {title}
      </Typography>
      <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 0.5 }}>
        {lines.map((l, i) => (
          <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.6 }}>
            <Box
              sx={{
                width: 12,
                height: 8,
                background: l.color,
                borderRadius: 1,
              }}
            />
            <Typography sx={{ ...fontMono, color: TEXT_MUTED, fontSize: 11 }}>
              {l.label || l.name || ""}
            </Typography>
          </Box>
        ))}
      </Box>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={(() => {
            const maxLen = Math.max(...lines.map((l) => l.data?.length || 0));
            const merged = [];
            for (let i = 0; i < maxLen; i++) {
              const point = { index: i + 1 };
              for (let j = 0; j < lines.length; j++) {
                point[`v${j}`] = lines[j].data?.[i]?.value ?? null;
              }
              merged.push(point);
            }
            return merged;
          })()}
          margin={{ top: 5, right: 8, left: -10, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="2 4" stroke="#1e3a50" />
          <XAxis
            dataKey="index"
            stroke="#3d6070"
            tick={{ fontSize: 10 }}
            type="number"
            domain={["dataMin", "dataMax"]}
          />
          <YAxis stroke="#3d6070" tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              background: BG_SURFACE,
              border: `1px solid ${BORDER_COLOR}`,
            }}
          />
          {lines.map((l, i) => (
            <Line
              key={i}
              type="monotone"
              dataKey={`v${i}`}
              stroke={l.color}
              dot={false}
              strokeWidth={2}
              name={l.label || l.name}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );

  const statusLabel = {
    analyzing: "Dokument wird analysiert…",
    summarizing: "KI-Zusammenfassung läuft…",
    completed: "Zusammenfassung abgeschlossen",
    failed: "Fehler bei der Analyse",
  };

  const statusColor = {
    analyzing: "#ffb347",
    summarizing: "#42a5f5",
    completed: "#66bb6a",
    failed: "#ef5350",
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        bgcolor: BG_DARK,
        color: WHITE,
        overflow: "hidden",
        height: "100vh",
      }}
    >
      <NotificationSnackbar
        open={snackbarOpen}
        setOpen={setSnackbarOpen}
        message={snackbarMessage}
      />

      {/* Header */}
      <Box
        sx={{
          height: 64,
          width: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: HEADER_GRADIENT,
          borderBottom: `1px solid ${BORDER_COLOR}`,
          px: 3,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Icon
            sx={{
              height: 40,
              width: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              draggable={false}
              src={AzureLogo}
              alt="Azure"
              style={{ maxHeight: 36, width: "auto", display: "block" }}
            />
          </Icon>
          <LocalHospitalIcon sx={{ color: PRIMARY_TEAL, fontSize: 22 }} />
          <Typography
            sx={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 18,
              fontWeight: 500,
              lineHeight: 1,
              color: TEXT_PRIMARY,
            }}
          >
            MedDoc – Krankenakten-Zusammenfassung
          </Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography sx={{ fontSize: 12, color: TEXT_MUTED }}>KI-Modell:</Typography>
          <Select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            size="small"
            sx={{
              color: TEXT_PRIMARY,
              fontSize: 13,
              ".MuiOutlinedInput-notchedOutline": { borderColor: BORDER_COLOR },
              "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: PRIMARY_TEAL },
              ".MuiSvgIcon-root": { color: TEXT_MUTED },
              minWidth: 160,
            }}
          >
            {MODELS.map((m) => (
              <MenuItem key={m.value} value={m.value}>
                {m.label}
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Box>

      {/* Main Area */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Left Sidebar — Metrics & Charts */}
        <Box
          sx={{
            width: 360,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            p: 2,
            borderRight: `1px solid ${BORDER_COLOR}`,
            bgcolor: BG_CARD,
            minHeight: 0,
          }}
        >
          <Box
            sx={{
              p: 1.5,
              border: `1px solid ${BORDER_COLOR}`,
              borderRadius: 2,
              background: BG_SURFACE,
              display: "flex",
              flexDirection: "column",
              gap: 0.6,
            }}
          >
            {metricRow("Prompt Tokens", promptTokens)}
            {metricRow("Completion Tokens", completionTokens)}
            {metricRow(
              "KI-Kosten (ct)",
              beautifyCostCentValue(sessionCostConsumption)
            )}
            {metricRow("Ausführungszeit (ms)", functionExecutionTime)}
            {metricRow(
              "Funktionskosten (ct)",
              beautifyCostCentValue(functionComputeCost)
            )}
            {metricRow("Gesamt (ct)", beautifyCostCentValue(totalOverallCost))}
          </Box>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              overflowY: "auto",
              flex: 1,
              minHeight: 0,
              pr: 0.5,
              ...customScrollBar(),
            }}
          >
            {chartCard("Tokens", [
              {
                data: cumulative.tokensPrompt,
                color: "#26c6da",
                label: "Prompt",
              },
              {
                data: cumulative.tokensCompletion,
                color: "#66bb6a",
                label: "Completion",
              },
            ])}
            {chartCard("Berechnungszeit (ms)", [
              { data: cumulative.exec, color: "#ffb347", label: "Zeit (ms)" },
            ])}
            {chartCard("Gesamtkosten (ct)", [
              { data: cumulative.cost, color: "#ef5350", label: "Kosten (ct)" },
            ])}
          </Box>
        </Box>

        {/* Center — Tabs: Dokumentenanalyse / Chat */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <Box sx={{ borderBottom: `1px solid ${BORDER_COLOR}`, bgcolor: BG_SURFACE }}>
            <Tabs
              value={activeTab}
              onChange={(_, v) => setActiveTab(v)}
              sx={{
                minHeight: 42,
                ".MuiTab-root": { color: TEXT_MUTED, textTransform: "none", fontWeight: 500, minHeight: 42, fontSize: 14 },
                ".Mui-selected": { color: PRIMARY_TEAL },
                ".MuiTabs-indicator": { backgroundColor: PRIMARY_TEAL },
              }}
            >
              <Tab icon={<DescriptionIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Dokumentenanalyse" />
              <Tab icon={<SummarizeIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="KI-Chat" />
            </Tabs>
          </Box>

          {/* Tab 0: Document Analysis */}
          {activeTab === 0 && (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                p: 3,
                gap: 2.5,
                overflowY: "auto",
                bgcolor: BG_DARK,
                ...customScrollBar(),
              }}
            >
              {/* Upload Area */}
              <Box
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  border: `2px dashed ${dragOver ? PRIMARY_TEAL : BORDER_COLOR}`,
                  borderRadius: 3,
                  p: 5,
                  textAlign: "center",
                  cursor: "pointer",
                  bgcolor: dragOver ? "rgba(0,151,167,0.08)" : BG_CARD,
                  transition: "all 0.2s",
                  "&:hover": { borderColor: PRIMARY_TEAL, bgcolor: "rgba(0,151,167,0.05)" },
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = "";
                  }}
                />
                <CloudUploadIcon sx={{ fontSize: 48, color: PRIMARY_TEAL, mb: 1 }} />
                <Typography sx={{ fontSize: 16, fontWeight: 500, color: TEXT_PRIMARY, mb: 0.5 }}>
                  Krankenakte hochladen
                </Typography>
                <Typography sx={{ fontSize: 13, color: TEXT_MUTED }}>
                  PDF, PNG, JPG, TIFF – Ziehen & Ablegen oder klicken (max. 10 MB)
                </Typography>
              </Box>

              {/* Status */}
              {(uploadingDoc || docStatus) && (
                <Box
                  sx={{
                    p: 2.5,
                    borderRadius: 2,
                    bgcolor: BG_CARD,
                    border: `1px solid ${BORDER_COLOR}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 1.5,
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    {(docStatus === "analyzing" || docStatus === "summarizing" || uploadingDoc) && (
                      <CircularProgress size={20} sx={{ color: statusColor[docStatus] || PRIMARY_TEAL }} />
                    )}
                    <Typography sx={{ fontSize: 14, fontWeight: 500, color: TEXT_PRIMARY }}>
                      {uploadingDoc ? "Wird hochgeladen…" : statusLabel[docStatus] || docStatus}
                    </Typography>
                    {docFileName && (
                      <Chip
                        label={docFileName}
                        size="small"
                        sx={{ bgcolor: BG_SURFACE, color: TEXT_MUTED, fontSize: 12 }}
                      />
                    )}
                  </Box>
                  {(docStatus === "analyzing" || docStatus === "summarizing") && (
                    <LinearProgress
                      variant={docStatus === "summarizing" ? "indeterminate" : "indeterminate"}
                      sx={{
                        backgroundColor: BG_SURFACE,
                        "& .MuiLinearProgress-bar": { backgroundColor: statusColor[docStatus] },
                      }}
                    />
                  )}
                </Box>
              )}

              {/* Summary Result */}
              {docSummary && (
                <Box
                  sx={{
                    p: 3,
                    borderRadius: 2,
                    bgcolor: BG_CARD,
                    border: `1px solid ${BORDER_COLOR}`,
                    maxHeight: "50vh",
                    overflowY: "auto",
                    ...customScrollBar(),
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                    <LocalHospitalIcon sx={{ color: PRIMARY_TEAL, fontSize: 20 }} />
                    <Typography sx={{ fontSize: 15, fontWeight: 600, color: TEXT_PRIMARY }}>
                      Strukturierte Zusammenfassung
                    </Typography>
                  </Box>
                  <Box sx={{ color: TEXT_PRIMARY, "& p": { my: 0.5 }, "& strong": { color: "#4dd0e1" } }}>
                    <AiMarkdown>{docSummary}</AiMarkdown>
                  </Box>
                </Box>
              )}

              {/* Info Banner */}
              <Box
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: "rgba(0,151,167,0.06)",
                  border: `1px solid rgba(0,151,167,0.2)`,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1.5,
                }}
              >
                <LocalHospitalIcon sx={{ color: PRIMARY_TEAL, fontSize: 20, mt: 0.3 }} />
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 600, color: TEXT_PRIMARY, mb: 0.3 }}>
                    Hinweis zur medizinischen Nutzung
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: TEXT_MUTED, lineHeight: 1.6 }}>
                    Dieses Tool dient der Effizienzsteigerung in der Dokumentation.
                    Die KI-generierten Zusammenfassungen ersetzen keine ärztliche Befundung
                    und sollten stets von medizinischem Fachpersonal überprüft werden.
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}

          {/* Tab 1: Chat */}
          {activeTab === 1 && (
            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
                p: 2,
                gap: 1.5,
                bgcolor: BG_DARK,
              }}
            >
              <Box
                ref={messagesRef}
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflowY: "auto",
                  border: `1px solid ${BORDER_COLOR}`,
                  borderRadius: 2,
                  background: BG_CARD,
                  p: 2,
                  ...customScrollBar(),
                  minHeight: 0,
                }}
              >
                <Box sx={{ flex: 1, minHeight: 0 }} />
                {chatArray.map((chatObject, index) => (
                  <Box
                    key={index}
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems:
                        chatObject?.from === "user" ? "flex-end" : "flex-start",
                      mb: 1.4,
                    }}
                  >
                    <Box
                      sx={{
                        px: 2,
                        py: 1,
                        borderRadius: 3,
                        bgcolor:
                          chatObject?.from === "user" ? PRIMARY_TEAL : "#e0f2f1",
                        color:
                          chatObject?.from === "user" ? WHITE : "#102027",
                        boxShadow: 2,
                        maxWidth: "80%",
                      }}
                    >
                      {chatObject?.from === "gpt" &&
                      !chatObject?.error &&
                      typewriterIndex === index ? (
                        <Typewriter
                          text={chatObject.message}
                          delay={10}
                          skipAnimation={skipAnimation}
                          setSkipAnimation={setSkipAnimation}
                          setWriting={setWriting}
                          onComplete={() => setTypewriterIndex(null)}
                        />
                      ) : (
                        <AiMarkdown>{chatObject.message}</AiMarkdown>
                      )}
                    </Box>
                  </Box>
                ))}
                {loadingAnswer && (
                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignSelf: "flex-start",
                      alignItems: "center",
                      mt: 1,
                    }}
                  >
                    <LinearProgress
                      sx={{
                        width: 140,
                        backgroundColor: BG_SURFACE,
                        "& .MuiLinearProgress-bar": {
                          backgroundColor: PRIMARY_TEAL,
                        },
                      }}
                    />
                  </Box>
                )}
              </Box>
              <TextField
                disabled={writing}
                variant="filled"
                placeholder="Medizinische Frage eingeben…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(inputText, true);
                  }
                }}
                size="small"
                sx={{
                  width: 1,
                  ".MuiInputBase-root": {
                    borderRadius: 3,
                    py: 1,
                    px: 2,
                    display: "flex",
                    height: 76,
                    bgcolor: BG_SURFACE,
                    color: WHITE,
                    boxShadow: `inset 0 0 0 1px ${BORDER_COLOR}`,
                  },
                }}
                slotProps={{
                  htmlInput: {
                    ref: inputRef,
                    style: { fontSize: 15, lineHeight: 1.3 },
                  },
                  input: {
                    disableUnderline: true,
                    endAdornment: (
                      <InputAdornment position="end" sx={{ mr: 0.5 }}>
                        {writing ? (
                          <IconButton onClick={() => setSkipAnimation(true)}>
                            <StopRoundedIcon sx={{ color: ACCENT_TEAL }} />
                          </IconButton>
                        ) : (
                          <IconButton
                            onClick={() => sendMessage(inputText, true)}
                            disabled={writing}
                          >
                            <SendRoundedIcon sx={{ color: ACCENT_TEAL }} />
                          </IconButton>
                        )}
                      </InputAdornment>
                    ),
                  },
                }}
                multiline
                maxRows={2}
                spellCheck={false}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />
            </Box>
          )}
        </Box>

        {/* Right Sidebar — Conversations */}
        <Box
          sx={{
            width: 260,
            flexShrink: 0,
            borderLeft: `1px solid ${BORDER_COLOR}`,
            bgcolor: BG_CARD,
            display: "flex",
            flexDirection: "column",
            gap: 1,
            p: 1.5,
            position: "relative",
          }}
        >
          <Typography
            sx={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 12,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              color: TEXT_MUTED,
            }}
          >
            Gespräche
          </Typography>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddCircleOutlineIcon />}
              onClick={handleCreateConversation}
              disabled={sidebarBusy || sidebarLoading || writing}
              sx={{
                textTransform: "none",
                fontWeight: 600,
                bgcolor: PRIMARY_TEAL,
                "&:hover": { bgcolor: "#00838f" },
              }}
            >
              Neues Gespräch
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={handleSaveConversation}
              disabled={
                sidebarBusy || sidebarLoading || writing || loadingAnswer
              }
              sx={{
                textTransform: "none",
                fontWeight: 600,
                borderColor: BORDER_COLOR,
                color: TEXT_MUTED,
                "&:hover": { borderColor: PRIMARY_TEAL },
              }}
            >
              Speichern
            </Button>
          </Box>
          <TextField
            label="Titel"
            variant="filled"
            size="small"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            disabled={sidebarBusy}
            helperText=" "
            sx={{
              ".MuiInputBase-root": {
                borderRadius: 2,
                bgcolor: BG_SURFACE,
                color: WHITE,
                px: 1.2,
              },
              "& .MuiInputBase-root:before": { borderBottom: "none" },
              "& .MuiInputBase-root:after": { borderBottom: "none" },
              ".MuiFormLabel-root": { color: TEXT_MUTED },
            }}
            slotProps={{
              input: {
                disableUnderline: true,
              },
            }}
          />
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 1,
              overflowY: "auto",
              ...customScrollBar(PRIMARY_TEAL),
            }}
          >
            {sidebarLoading ? (
              <Typography sx={{ color: TEXT_MUTED, fontSize: 13 }}>
                Gespräche werden geladen…
              </Typography>
            ) : conversations.length ? (
              conversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId;
                return (
                  <Box
                    key={conversation.id}
                    onClick={() => handleSelectConversation(conversation.id)}
                    sx={{
                      px: 1.2,
                      py: 1,
                      borderRadius: 2,
                      border: isActive
                        ? `1px solid ${PRIMARY_TEAL}`
                        : "1px solid transparent",
                      bgcolor: isActive ? BG_SURFACE : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1,
                    }}
                  >
                    <Box sx={{ minWidth: 0, mr: 0.5 }}>
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: isActive ? 600 : 500,
                          color: WHITE,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {conversation.title || "(Ohne Titel)"}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 11,
                          color: TEXT_MUTED,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatConversationTimestamp(
                          conversation.updatedAt || conversation.createdAt
                        )}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      onClick={(event) =>
                        handleDeleteConversation(event, conversation.id)
                      }
                      disabled={sidebarBusy}
                      sx={{ color: TEXT_MUTED }}
                    >
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Box>
                );
              })
            ) : (
              <Typography sx={{ color: TEXT_MUTED, fontSize: 13 }}>
                Noch keine Gespräche
              </Typography>
            )}
          </Box>
          {sidebarBusy && (
            <Box
              sx={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "rgba(13,27,42,0.8)",
                borderRadius: 0,
                zIndex: 2,
              }}
            >
              <CircularProgress
                size={28}
                thickness={4}
                sx={{ color: PRIMARY_TEAL }}
              />
            </Box>
          )}
        </Box>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          width: 1,
          textAlign: "center",
          py: 0.7,
          borderTop: `1px solid ${BORDER_COLOR}`,
          bgcolor: "#091520",
        }}
      >
        <FooterLine typographySx={{ fontSize: 11, color: TEXT_MUTED }}>
          MedDoc – KI-gestützte Krankenakten-Zusammenfassung • Azure Serverless
        </FooterLine>
      </Box>
    </Box>
  );
}

export default MainPage;
