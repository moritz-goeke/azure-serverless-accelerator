import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import FavoriteIcon from "@mui/icons-material/Favorite";
import SpaIcon from "@mui/icons-material/Spa";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Select,
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
import AiMarkdown from "../components/AiMarkdown";
import {
  ACCENT_WARM,
  AZURE_FUNCTION_COST_CT_PER_GB_SECOND,
  BG_CARD,
  BG_WARM,
  BORDER_SOFT,
  PRIMARY,
  PRIMARY_DARK,
  PRIMARY_LIGHT,
  TEXT_DARK,
  TEXT_MUTED,
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
  "Hallo! Ich bin dein Wellbeing-Assistent. Ich bin hier, um dich zu unterstützen – ob bei Stress, Prüfungsangst oder wenn du einfach jemanden zum Reden brauchst. Wie kann ich dir heute helfen?";

const MODEL_OPTIONS = [
  { value: "gpt5mini", label: "GPT-5 Mini", description: "Schnell & effizient" },
  { value: "gpt4o", label: "GPT-4o", description: "Ausführlich & empathisch" },
];

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
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(dateValue);
  } catch (error) {
    console.warn("Falling back to locale string for timestamp", error);
    return dateValue.toLocaleString();
  }
};

const buildDefaultTitle = () => formatConversationTimestamp(Date.now()) || "";

const fontMain = { fontFamily: "'Nunito', sans-serif" };

function MainPage() {
  const [selectedModel, setSelectedModel] = React.useState("gpt5mini");
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
  const [showStats, setShowStats] = React.useState(false);
  const messagesRef = React.useRef(null);
  const inputRef = React.useRef(null);

  const showSnackbar = React.useCallback((message) => {
    if (!message) return;
    setSnackbarMessage(message);
    setSnackbarOpen(true);
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
      showSnackbar("Gespräche konnten nicht geladen werden.");
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
      showSnackbar("Gespräch gelöscht.");
    } catch (error) {
      console.error("Failed to delete conversation", error);
      showSnackbar("Gespräch konnte nicht gelöscht werden.");
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
          showSnackbar("Gespräch aktualisiert.");
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
          showSnackbar("Gespräch gespeichert.");
        }
      }
    } catch (error) {
      console.error("Failed to save conversation", error);
      showSnackbar("Gespräch konnte nicht gespeichert werden.");
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
        data?.choices?.[0]?.message?.content || "(Keine Antwort erhalten)";
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
        { from: "gpt", message: "Fehler beim Abrufen der Antwort.", error: true },
      ]);
    } finally {
      setLoadingAnswer(false);
      setWriting(false);
    }
  };

  const fontMono = { ...fontMain, fontSize: 12, letterSpacing: 0.3 };
  const metricRow = (label, value) => (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Typography sx={{ ...fontMono, color: TEXT_MUTED }}>{label}</Typography>
      <Typography sx={{ ...fontMono, fontWeight: 700, color: TEXT_DARK }}>
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
        borderRadius: 3,
        border: `1px solid ${BORDER_SOFT}`,
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        height: 160,
      }}
    >
      <Typography
        sx={{
          ...fontMain,
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.8,
          color: PRIMARY,
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
            <Typography sx={{ ...fontMono, color: TEXT_MUTED, fontSize: 10 }}>
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
          <CartesianGrid strokeDasharray="2 4" stroke={BORDER_SOFT} />
          <XAxis
            dataKey="index"
            stroke={TEXT_MUTED}
            tick={{ fontSize: 10 }}
            type="number"
            domain={["dataMin", "dataMax"]}
          />
          <YAxis stroke={TEXT_MUTED} tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              background: BG_CARD,
              border: `1px solid ${BORDER_SOFT}`,
              borderRadius: 8,
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

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        bgcolor: BG_WARM,
        color: TEXT_DARK,
        overflow: "hidden",
        height: "100vh",
        ...fontMain,
      }}
    >
      <NotificationSnackbar
        open={snackbarOpen}
        setOpen={setSnackbarOpen}
        message={snackbarMessage}
      />

      {/* ─── Header ─── */}
      <Box
        sx={{
          height: 68,
          width: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 3,
          background: `linear-gradient(135deg, ${PRIMARY_DARK} 0%, ${PRIMARY} 60%, ${PRIMARY_LIGHT} 100%)`,
          boxShadow: "0 2px 12px rgba(91,138,114,0.25)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <SpaIcon sx={{ color: "#fff", fontSize: 30, opacity: 0.9 }} />
          <Box>
            <Typography
              sx={{
                ...fontMain,
                fontSize: 19,
                fontWeight: 700,
                color: "#fff",
                lineHeight: 1.2,
                letterSpacing: 0.3,
              }}
            >
              Uni Wellbeing
            </Typography>
            <Typography
              sx={{
                ...fontMain,
                fontSize: 11,
                color: "rgba(255,255,255,0.75)",
                lineHeight: 1,
                letterSpacing: 0.2,
              }}
            >
              Dein Raum für mentale Gesundheit
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Select
            size="small"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            sx={{
              ...fontMain,
              fontSize: 13,
              color: "#fff",
              minWidth: 160,
              ".MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(255,255,255,0.35)",
                borderRadius: 2,
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(255,255,255,0.6)",
              },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: "#fff",
              },
              ".MuiSvgIcon-root": { color: "#fff" },
            }}
          >
            {MODEL_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                <Box>
                  <Typography sx={{ ...fontMain, fontSize: 13, fontWeight: 600 }}>
                    {opt.label}
                  </Typography>
                  <Typography sx={{ ...fontMain, fontSize: 10, color: TEXT_MUTED }}>
                    {opt.description}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
          <Button
            variant="text"
            size="small"
            onClick={() => setShowStats((s) => !s)}
            sx={{
              ...fontMain,
              textTransform: "none",
              color: "rgba(255,255,255,0.8)",
              fontSize: 12,
              "&:hover": { color: "#fff", bgcolor: "rgba(255,255,255,0.1)" },
            }}
          >
            {showStats ? "Statistiken ausblenden" : "Statistiken"}
          </Button>
        </Box>
      </Box>

      {/* ─── Main content ─── */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* ─── Sidebar: Conversations ─── */}
        <Box
          sx={{
            width: 280,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            p: 2,
            borderRight: `1px solid ${BORDER_SOFT}`,
            bgcolor: BG_CARD,
            minHeight: 0,
          }}
        >
          <Typography
            sx={{
              ...fontMain,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
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
                ...fontMain,
                textTransform: "none",
                fontWeight: 700,
                fontSize: 12,
                bgcolor: PRIMARY,
                borderRadius: 2,
                boxShadow: "none",
                "&:hover": { bgcolor: PRIMARY_DARK, boxShadow: "none" },
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
                ...fontMain,
                textTransform: "none",
                fontWeight: 700,
                fontSize: 12,
                borderColor: PRIMARY,
                color: PRIMARY,
                borderRadius: 2,
                "&:hover": { borderColor: PRIMARY_DARK, color: PRIMARY_DARK },
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
            sx={{
              ".MuiInputBase-root": {
                borderRadius: 2,
                bgcolor: BG_WARM,
                color: TEXT_DARK,
                px: 1.2,
                ...fontMain,
              },
              "& .MuiInputBase-root:before": { borderBottom: "none" },
              "& .MuiInputBase-root:after": { borderBottom: "none" },
              ".MuiFormLabel-root": { color: TEXT_MUTED, ...fontMain },
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
              gap: 0.8,
              overflowY: "auto",
              ...customScrollBar(PRIMARY_LIGHT),
            }}
          >
            {sidebarLoading ? (
              <Typography sx={{ color: TEXT_MUTED, fontSize: 13, ...fontMain }}>
                Gespräche werden geladen...
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
                      borderRadius: 2.5,
                      border: isActive
                        ? `2px solid ${PRIMARY}`
                        : `1px solid ${BORDER_SOFT}`,
                      bgcolor: isActive ? `${PRIMARY}10` : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1,
                      transition: "all 0.15s ease",
                      "&:hover": {
                        bgcolor: `${PRIMARY}08`,
                      },
                    }}
                  >
                    <Box sx={{ minWidth: 0, mr: 0.5 }}>
                      <Typography
                        sx={{
                          fontSize: 13,
                          fontWeight: isActive ? 700 : 500,
                          color: TEXT_DARK,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          ...fontMain,
                        }}
                      >
                        {conversation.title || "(Ohne Titel)"}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 10,
                          color: TEXT_MUTED,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          ...fontMain,
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
              <Typography sx={{ color: TEXT_MUTED, fontSize: 13, ...fontMain }}>
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
                bgcolor: "rgba(250,247,242,0.85)",
                zIndex: 2,
              }}
            >
              <CircularProgress
                size={28}
                thickness={4}
                sx={{ color: PRIMARY }}
              />
            </Box>
          )}
        </Box>

        {/* ─── Chat area ─── */}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
            p: 2.5,
            gap: 1.5,
          }}
        >
          {/* Wellbeing info bar */}
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
              px: 2,
              py: 1.2,
              borderRadius: 3,
              bgcolor: `${PRIMARY_LIGHT}18`,
              border: `1px solid ${PRIMARY_LIGHT}40`,
            }}
          >
            <FavoriteIcon sx={{ color: ACCENT_WARM, fontSize: 18 }} />
            <Typography sx={{ ...fontMain, fontSize: 12, color: TEXT_DARK, lineHeight: 1.4 }}>
              Vertraulich &amp; sicher. Bei akuten Krisen wende dich an die
              Telefonseelsorge: <strong>0800 111 0 111</strong> (kostenlos, 24/7)
              oder an die psychologische Beratung deiner Hochschule.
            </Typography>
          </Box>

          {/* Messages container */}
          <Box
            ref={messagesRef}
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              borderRadius: 4,
              background: BG_CARD,
              border: `1px solid ${BORDER_SOFT}`,
              boxShadow: "0 1px 8px rgba(0,0,0,0.04)",
              p: 2.5,
              ...customScrollBar(PRIMARY_LIGHT),
              minHeight: 0,
            }}
          >
            <Box sx={{ flex: 1, minHeight: 0 }} />
            {chatArray.map((chatObject, index) => {
              const isUser = chatObject?.from === "user";
              return (
                <Box
                  key={index}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isUser ? "flex-end" : "flex-start",
                    mb: 1.8,
                  }}
                >
                  <Box
                    sx={{
                      px: 2.2,
                      py: 1.2,
                      borderRadius: isUser
                        ? "20px 20px 6px 20px"
                        : "20px 20px 20px 6px",
                      bgcolor: isUser ? PRIMARY : BG_WARM,
                      color: isUser ? "#fff" : TEXT_DARK,
                      boxShadow: isUser
                        ? "0 2px 8px rgba(91,138,114,0.2)"
                        : "0 1px 4px rgba(0,0,0,0.05)",
                      maxWidth: "75%",
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
              );
            })}
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
                    borderRadius: 2,
                    backgroundColor: `${PRIMARY}20`,
                    "& .MuiLinearProgress-bar": {
                      backgroundColor: PRIMARY,
                    },
                  }}
                />
              </Box>
            )}
          </Box>

          {/* Input box */}
          <TextField
            disabled={writing}
            variant="filled"
            placeholder="Schreib mir, was dich beschäftigt..."
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
                borderRadius: 4,
                py: 1.2,
                px: 2.5,
                display: "flex",
                height: 72,
                bgcolor: BG_CARD,
                color: TEXT_DARK,
                border: `1px solid ${BORDER_SOFT}`,
                boxShadow: "0 1px 6px rgba(0,0,0,0.04)",
                ...fontMain,
              },
            }}
            slotProps={{
              htmlInput: {
                ref: inputRef,
                style: {
                  fontSize: 15,
                  lineHeight: 1.4,
                  fontFamily: "'Nunito', sans-serif",
                },
              },
              input: {
                disableUnderline: true,
                endAdornment: (
                  <InputAdornment position="end" sx={{ mr: 0.5 }}>
                    {writing ? (
                      <IconButton onClick={() => setSkipAnimation(true)}>
                        <StopRoundedIcon sx={{ color: ACCENT_WARM }} />
                      </IconButton>
                    ) : (
                      <IconButton
                        onClick={() => sendMessage(inputText, true)}
                        disabled={writing}
                      >
                        <SendRoundedIcon sx={{ color: PRIMARY }} />
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

        {/* ─── Stats panel (toggleable) ─── */}
        {showStats && (
          <Box
            sx={{
              width: 320,
              flexShrink: 0,
              borderLeft: `1px solid ${BORDER_SOFT}`,
              bgcolor: BG_CARD,
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
              p: 2,
              overflowY: "auto",
              ...customScrollBar(PRIMARY_LIGHT),
            }}
          >
            <Typography
              sx={{
                ...fontMain,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: TEXT_MUTED,
              }}
            >
              Sitzungsstatistiken
            </Typography>
            <Box
              sx={{
                p: 1.5,
                border: `1px solid ${BORDER_SOFT}`,
                borderRadius: 3,
                background: BG_WARM,
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
            {chartCard("Tokens", [
              {
                data: cumulative.tokensPrompt,
                color: PRIMARY,
                label: "Prompt",
              },
              {
                data: cumulative.tokensCompletion,
                color: ACCENT_WARM,
                label: "Completion",
              },
            ])}
            {chartCard("Ausführungszeit (ms)", [
              { data: cumulative.exec, color: "#E8A87C", label: "Zeit (ms)" },
            ])}
            {chartCard("Gesamtkosten (ct)", [
              { data: cumulative.cost, color: "#C26B5B", label: "Kosten (ct)" },
            ])}
          </Box>
        )}
      </Box>

      {/* ─── Footer ─── */}
      <Box
        sx={{
          width: 1,
          textAlign: "center",
          py: 0.8,
          borderTop: `1px solid ${BORDER_SOFT}`,
          bgcolor: BG_CARD,
        }}
      >
        <FooterLine typographySx={{ fontSize: 11, color: TEXT_MUTED, ...fontMain }}>
          Uni Wellbeing &middot; KI-gestützte emotionale Unterstützung &middot;
          Vertraulich &amp; sicher
        </FooterLine>
      </Box>
    </Box>
  );
}

export default MainPage;
