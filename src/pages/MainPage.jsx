import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ExpandLessRoundedIcon from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import FavoriteIcon from "@mui/icons-material/Favorite";
import SpaIcon from "@mui/icons-material/Spa";
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Select,
  Typography,
  Tooltip,
  TextField,
} from "@mui/material";
import axios from "axios";
import "katex/dist/katex.min.css";
import * as React from "react";
import AiMarkdown from "../components/AiMarkdown";
import {
  ACCENT_WARM,
  BG_CARD,
  BG_WARM,
  BORDER_SOFT,
  PRIMARY,
  PRIMARY_DARK,
  PRIMARY_LIGHT,
  TEXT_DARK,
  TEXT_MUTED,
  customScrollBar,
} from "../components/consts";
import { FooterLine } from "../components/Footer";
import NotificationSnackbar from "../components/NotificationSnackbar";
import Typewriter from "../components/Typewriter";

const CONVERSATION_CONTAINER = "Conversations";

const DEFAULT_ASSISTANT_MESSAGE =
  "Hallo! Ich bin dein Wellbeing-Assistent. Ich bin hier, um dich zu unterstützen – ob bei Stress, Prüfungsangst oder wenn du einfach jemanden zum Reden brauchst. Wie kann ich dir heute helfen?";

const MODEL_OPTIONS = [
  { value: "strict_4o", label: "Sicherheitsfokus", description: "Klare Grenzen" },
  { value: "supportive_4o", label: "Unterstützend", description: "Empathisch & praktisch" },
  { value: "baseline_4.1", label: "Standard", description: "Ausgewogene Antworten" },
];

const STARTER_PROMPTS = [
  "Ich habe Prüfungsstress",
  "Ich fühle mich überfordert",
  "Ich bin traurig",
  "I feel really stressed",
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

const buildConversationTitleFromMessage = (text) => {
  if (!text || !text.trim()) return "Neues Gespräch";

  const clean = text.replace(/\s+/g, " ").replace(/[\r\n]+/g, " ").trim();

  const maxLength = 38;
  return clean.length > maxLength
    ? `${clean.slice(0, maxLength).trim()}...`
    : clean;
};

const isHighRiskMessage = (text) => {
  if (!text) return false;
  const lower = text.toLowerCase();

  const keywords = [
    "suicide",
    "commit suicide",
    "kill myself",
    "i want to die",
    "overdose",
    "harm myself",
    "how to harm myself",
    "self harm",
    "self-harm",
    "self injure",
    "self-injure",
    "suizid",
    "suizid begehen",
    "ich will suizid begehen",
    "mich umbringen",
    "ich will mich umbringen",
    "mich selbst verletzen",
    "wie kann ich mich selbst verletzen",
    "selbst verletzen",
    "nicht mehr leben",
    "ich will nicht mehr",
    "ich will sterben",
  ];

  return keywords.some((keyword) => lower.includes(keyword));
};

const detectLanguage = (message = "") => {
  const text = String(message).toLowerCase().trim();

  const germanMarkers = [
    " ich ",
    " mich ",
    " mir ",
    " mein ",
    " was ",
    " gerade ",
    " nicht ",
    "hilfe",
    "traurig",
    "überfordert",
    "suizid",
    "umbringen",
    "verletzen",
    "sterben",
    "warum",
    "heute",
    "kannst du",
    "möchte",
    "möchtest",
    "bitte",
    "selbst",
    "leben",
  ];

  const englishMarkers = [
    " i ",
    " me ",
    " my ",
    " myself ",
    " want ",
    " help ",
    " sad ",
    " stressed ",
    " suicide",
    " kill myself",
    " overdose",
    " harm myself",
    " what ",
    " why ",
    " today ",
    " please ",
  ];

  const normalized = ` ${text} `;

  const germanScore = germanMarkers.reduce(
    (score, marker) => score + (normalized.includes(marker) ? 1 : 0),
    0
  );

  const englishScore = englishMarkers.reduce(
    (score, marker) => score + (normalized.includes(marker) ? 1 : 0),
    0
  );

  return germanScore >= englishScore ? "de" : "en";
};

const buildGenericErrorReply = (message = "") => {
  const language = detectLanguage(message);

  if (language === "de") {
    return "Es tut mir leid, gerade konnte ich keine passende Antwort laden. Bitte versuche es noch einmal.";
  }

  return "Sorry, I couldn't load a proper response just now. Please try again.";
};

const buildFrontendFallbackReply = (message = "") => {
  const language = detectLanguage(message);

  if (language === "de") {
    return "Es tut mir sehr leid, dass du dich gerade so fühlst. Du musst das nicht allein tragen. Wenn du dich im Moment nicht sicher fühlst oder dir etwas antun könntest, kontaktiere bitte sofort eine vertraute Person, die psychologische Beratung deiner Hochschule oder in akuter Gefahr den Notruf. Wenn du möchtest, kannst du mir schreiben, was gerade am schwersten ist.";
  }

  return "I'm really sorry you're feeling this way. You don't have to carry this alone right now. If you feel unsafe or might act on these thoughts, please contact a trusted person, your university counseling service, or emergency services right away. If you want, you can tell me what feels hardest right now.";
};



const fontMain = { fontFamily: "'Nunito', sans-serif" };

function MainPage() {
 const [selectedModel, setSelectedModel] = React.useState("strict_4o");
  const [inputText, setInputText] = React.useState("");
  const [chatArray, setChatArray] = React.useState([]);
  const [typewriterIndex, setTypewriterIndex] = React.useState(null);
  const [loadingAnswer, setLoadingAnswer] = React.useState(false);
  const [skipAnimation, setSkipAnimation] = React.useState(false);
  const [writing, setWriting] = React.useState(false);

  const [conversations, setConversations] = React.useState([]);
  const [activeConversationId, setActiveConversationId] = React.useState(null);

  const [sidebarLoading, setSidebarLoading] = React.useState(true);
  const [sidebarBusy, setSidebarBusy] = React.useState(false);

  const [snackbarOpen, setSnackbarOpen] = React.useState(false);
  const [snackbarMessage, setSnackbarMessage] = React.useState("");

  const [showCrisisNotice, setShowCrisisNotice] = React.useState(false);
  const [crisisExpanded, setCrisisExpanded] = React.useState(false);

  const messagesRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const autoSaveTimeoutRef = React.useRef(null);

  const showSnackbar = React.useCallback((message) => {
    if (!message) return;
    setSnackbarMessage(message);
    setSnackbarOpen(true);
  }, []);

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

  const loadConversation = React.useCallback((conversation) => {
    if (!conversation) return;

    const nextMessages =
      conversation.messages && conversation.messages.length
        ? conversation.messages.map((message) => ({ ...message }))
        : buildDefaultMessages();

    setChatArray(nextMessages);
    setActiveConversationId(conversation.id);
    setSkipAnimation(false);
    setShowCrisisNotice(false);
    setCrisisExpanded(false);

    const hasMessages = conversation?.messages?.length;
    setTypewriterIndex(hasMessages ? null : 0);
  }, []);

  const handleCreateConversation = React.useCallback(() => {
    setChatArray(buildDefaultMessages());
    setActiveConversationId(null);
    setSkipAnimation(false);
    setTypewriterIndex(0);
    setShowCrisisNotice(false);
    setCrisisExpanded(false);
  }, []);

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
  }, [fetchConversationList, handleCreateConversation, loadConversation, showSnackbar]);

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

  React.useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, []);

  const persistConversation = React.useCallback(
    async (messages, explicitConversationId = null, silent = true) => {
      const relevantMessages =
        messages && messages.length ? messages : buildDefaultMessages();

      const firstUserMessage =
        relevantMessages.find((msg) => msg.from === "user")?.message || "";

      const autoTitle = buildConversationTitleFromMessage(firstUserMessage);

      const itemPayload = {
        messages: relevantMessages,
        title: autoTitle,
      };

      try {
        if (explicitConversationId || activeConversationId) {
          const response = await axios.post("/api/updateItem", {
            container: CONVERSATION_CONTAINER,
            itemId: explicitConversationId || activeConversationId,
            item: itemPayload,
          });

          const updated = normalizeResponsePayload(response.data);
          if (updated) {
            upsertConversation(updated);
            return updated;
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
            return created;
          }
        }

        if (!silent) {
          showSnackbar("Gespräch gespeichert.");
        }
      } catch (error) {
        console.error("Failed to persist conversation", error);
        if (!silent) {
          showSnackbar("Gespräch konnte nicht gespeichert werden.");
        }
      }

      return null;
    },
    [activeConversationId, showSnackbar, upsertConversation]
  );

  const scheduleAutoSave = React.useCallback(
    (messages, explicitConversationId = null) => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }

      autoSaveTimeoutRef.current = setTimeout(() => {
        persistConversation(messages, explicitConversationId, true);
      }, 500);
    },
    [persistConversation]
  );

  const handleSelectConversation = (conversationId) => {
    if (sidebarBusy) return;
    if (!conversationId || conversationId === activeConversationId) return;

    const conversation = conversations.find((conv) => conv.id === conversationId);
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

  const sendMessage = async (text, addToChat = true) => {
    if (!text || !text.trim()) return;
    const trimmedText = text.trim();

    if (isHighRiskMessage(trimmedText)) {
      setShowCrisisNotice(true);
      setCrisisExpanded(true);
    } else {
      setShowCrisisNotice(false);
    }

    const userMessage = { from: "user", message: trimmedText };
    const conversation = addToChat
      ? [...chatArray, userMessage]
      : [...chatArray];

    setChatArray(conversation);
    setInputText("");
    setLoadingAnswer(true);
    setWriting(true);

    let conversationId = activeConversationId;

    try {
      if (!conversationId) {
        const created = await persistConversation(conversation, null, true);
        conversationId = created?.id || null;
      } else {
        await persistConversation(conversation, conversationId, true);
      }

      const response = await axios.post("/api/openai", {
        message: trimmedText,
        conversation: JSON.stringify(conversation),
        model: selectedModel,
      });

      let data = response.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (error) {
          console.warn("Failed to parse openai response string", error);
        }
      }

const rawContent = data?.choices?.[0]?.message?.content?.trim();

const gptContent = rawContent
  ? rawContent
  : isHighRiskMessage(trimmedText)
    ? buildFrontendFallbackReply(trimmedText)
    : buildGenericErrorReply(trimmedText);

      const updatedConversation = [
        ...conversation,
        { from: "gpt", message: gptContent },
      ];

      setChatArray(updatedConversation);
      setSkipAnimation(false);
      setTypewriterIndex(updatedConversation.length - 1);

      if (conversationId) {
        await persistConversation(updatedConversation, conversationId, true);
      } else {
        scheduleAutoSave(updatedConversation, null);
      }
    } catch (error) {
      console.error("Failed to send message", error);

     const fallbackText = isHighRiskMessage(trimmedText)
  ? buildFrontendFallbackReply(trimmedText)
  : buildGenericErrorReply(trimmedText);

const fallbackMessage = {
  from: "gpt",
  message: fallbackText,
  error: true,
};

      const updatedConversation = [...conversation, fallbackMessage];

      setChatArray(updatedConversation);
      setSkipAnimation(false);
      setTypewriterIndex(updatedConversation.length - 1);

      if (conversationId) {
        await persistConversation(updatedConversation, conversationId, true);
      } else {
        scheduleAutoSave(updatedConversation, null);
      }
    } finally {
      setLoadingAnswer(false);
      setWriting(false);
    }
  };

  const handleStarterPrompt = async (text) => {
    await sendMessage(text, true);
  };

  const isWelcomeState =
    chatArray.length === 1 &&
    chatArray[0]?.from === "gpt" &&
    chatArray[0]?.message === DEFAULT_ASSISTANT_MESSAGE;

  const canSend = !writing && !!inputText.trim();

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
              UniWell Assistant
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

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Typography
            sx={{
              ...fontMain,
              fontSize: 12,
              color: "rgba(255,255,255,0.78)",
              fontWeight: 600,
            }}
          >
            Modell
          </Typography>

          <Select
            size="small"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            sx={{
              ...fontMain,
              fontSize: 13,
              color: "#fff",
              minWidth: 150,
              bgcolor: "rgba(255,255,255,0.08)",
              borderRadius: 2.5,
              ".MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(255,255,255,0.25)",
                borderRadius: 2.5,
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "rgba(255,255,255,0.45)",
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
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                    {opt.label}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: TEXT_MUTED }}>
                    {opt.description}
                  </Typography>
                </Box>
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Box>

      <Box sx={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
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
            position: "relative",
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
                borderRadius: 2.5,
                boxShadow: "none",
                "&:hover": { bgcolor: PRIMARY_DARK, boxShadow: "none" },
              }}
            >
              Neues Gespräch
            </Button>
          </Box>

          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 0.9,
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
                      px: 1.4,
                      py: 1.05,
                      pl: isActive ? 1.8 : 1.4,
                      borderRadius: 2.5,
                      border: isActive
                        ? `1px solid ${PRIMARY_LIGHT}`
                        : `1px solid ${BORDER_SOFT}`,
                      bgcolor: isActive ? `${PRIMARY}10` : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1,
                      transition: "all 0.18s ease",
                      position: "relative",
                      "&:hover": {
                        bgcolor: `${PRIMARY}08`,
                      },
                      "&::before": isActive
                        ? {
                            content: '""',
                            position: "absolute",
                            left: 0,
                            top: 8,
                            bottom: 8,
                            width: 4,
                            borderRadius: 4,
                            backgroundColor: PRIMARY,
                          }
                        : {},
                      "& .delete-button": {
                        opacity: isActive ? 0.85 : 0.18,
                        transition: "opacity 0.18s ease",
                      },
                      "&:hover .delete-button": {
                        opacity: 1,
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
                        {conversation.title || "Neues Gespräch"}
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

                    <Tooltip title="Gespräch löschen">
                      <IconButton
                        size="small"
                        className="delete-button"
                        onClick={(event) =>
                          handleDeleteConversation(event, conversation.id)
                        }
                        disabled={sidebarBusy}
                        sx={{ color: TEXT_MUTED }}
                      >
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
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
          <Box
            sx={{
              px: 2,
              py: 1.3,
              borderRadius: 3,
              bgcolor: BG_CARD,
              border: `1px solid ${BORDER_SOFT}`,
              boxShadow: "0 1px 6px rgba(0,0,0,0.03)",
            }}
          >
            <Typography
              sx={{
                ...fontMain,
                fontSize: 13,
                color: TEXT_DARK,
                lineHeight: 1.55,
              }}
            >
              <strong>Diese KI</strong> unterstützt dich bei Stress und emotionalem
              Wohlbefinden. Sie ersetzt keine professionelle Hilfe.
            </Typography>
          </Box>

          <Box
            sx={{
              borderRadius: 3,
              bgcolor: `${PRIMARY_LIGHT}14`,
              border: `1px solid ${PRIMARY_LIGHT}38`,
              overflow: "hidden",
            }}
          >
            <Button
              onClick={() => setCrisisExpanded((prev) => !prev)}
              fullWidth
              sx={{
                ...fontMain,
                textTransform: "none",
                justifyContent: "space-between",
                alignItems: "center",
                px: 2,
                py: 1.1,
                color: TEXT_DARK,
                borderRadius: 0,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.2 }}>
                <FavoriteIcon sx={{ color: ACCENT_WARM, fontSize: 18 }} />
                <Typography
                  sx={{
                    ...fontMain,
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: TEXT_DARK,
                  }}
                >
                  Vertraulich & sicher · Hilfe in akuten Krisen
                </Typography>
              </Box>
              {crisisExpanded ? (
                <ExpandLessRoundedIcon sx={{ color: TEXT_MUTED }} />
              ) : (
                <ExpandMoreRoundedIcon sx={{ color: TEXT_MUTED }} />
              )}
            </Button>

            <Collapse in={crisisExpanded}>
              <Box sx={{ px: 2, pb: 1.6 }}>
                <Typography
                  sx={{
                    ...fontMain,
                    fontSize: 12,
                    color: TEXT_DARK,
                    lineHeight: 1.55,
                  }}
                >
                  Bei akuten Krisen wende dich an die Telefonseelsorge:
                  <strong> 0800 111 0 111</strong> (kostenlos, 24/7) oder an die
                  psychologische Beratung deiner Hochschule.
                </Typography>
              </Box>
            </Collapse>
          </Box>

          {showCrisisNotice && (
            <Box
              sx={{
                px: 2,
                py: 1.4,
                borderRadius: 3,
                bgcolor: "#fff4e8",
                border: "1px solid #e4c9a8",
              }}
            >
              <Typography
                sx={{
                  ...fontMain,
                  fontSize: 13,
                  color: "#6a4b2f",
                  lineHeight: 1.55,
                }}
              >
                Wenn du dich gerade nicht sicher fühlst oder dir etwas antun
                könntest, wende dich bitte sofort an eine vertraute Person, die
                psychologische Beratung deiner Hochschule oder in akuter Gefahr an
                den Notruf.
              </Typography>
            </Box>
          )}

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
            {isWelcomeState ? (
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "flex-start",
                  maxWidth: 720,
                  mx: "auto",
                  width: "100%",
                  gap: 2.2,
                }}
              >
                <Box>
                  <Typography
                    sx={{
                      ...fontMain,
                      fontSize: 30,
                      fontWeight: 700,
                      color: TEXT_DARK,
                      mb: 1,
                    }}
                  >
                    Schön, dass du da bist.
                  </Typography>
                  <Typography
                    sx={{
                      ...fontMain,
                      fontSize: 15,
                      color: TEXT_MUTED,
                      lineHeight: 1.65,
                      maxWidth: 620,
                    }}
                  >
                    Du kannst hier über Stress, Überforderung oder andere
                    Belastungen sprechen. Womit möchtest du anfangen?
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 1.2,
                  }}
                >
                  {STARTER_PROMPTS.map((prompt) => (
                    <Button
                      key={prompt}
                      variant="outlined"
                      onClick={() => handleStarterPrompt(prompt)}
                      disabled={writing || loadingAnswer}
                      sx={{
                        ...fontMain,
                        textTransform: "none",
                        borderRadius: 999,
                        px: 2,
                        py: 1,
                        borderColor: BORDER_SOFT,
                        color: TEXT_DARK,
                        bgcolor: BG_WARM,
                        "&:hover": {
                          borderColor: PRIMARY,
                          bgcolor: `${PRIMARY}08`,
                        },
                      }}
                    >
                      {prompt}
                    </Button>
                  ))}
                </Box>
              </Box>
            ) : (
              <>
                {chatArray.map((chatObject, index) => {
                  const isUser = chatObject?.from === "user";

                  return (
                    <Box
                      key={index}
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: isUser ? "flex-end" : "flex-start",
                        mb: 2.2,
                      }}
                    >
                      <Box
                        sx={{
                          px: 2.25,
                          py: 1.3,
                          borderRadius: isUser
                            ? "20px 20px 6px 20px"
                            : "20px 20px 20px 6px",
                          bgcolor: isUser ? PRIMARY : BG_WARM,
                          color: isUser ? "#fff" : TEXT_DARK,
                          boxShadow: isUser
                            ? "0 2px 8px rgba(91,138,114,0.2)"
                            : "0 1px 4px rgba(0,0,0,0.05)",
                          maxWidth: isUser ? "75%" : "72%",
                          lineHeight: 1.7,
                          fontSize: 15,
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
                      mt: 0.5,
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
              </>
            )}
          </Box>

          <TextField
            disabled={writing}
            variant="filled"
            placeholder="Ich bin hier. Was beschäftigt dich gerade?"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) {
                  sendMessage(inputText, true);
                }
              }
            }}
            size="small"
            sx={{
              width: 1,
              ".MuiInputBase-root": {
                borderRadius: 4,
                px: 2.5,
                py: 1.2,
                display: "flex",
                alignItems: "flex-end",
                minHeight: 64,
                height: "auto",
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
                  lineHeight: 1.5,
                  fontFamily: "'Nunito', sans-serif",
                },
              },
              input: {
                disableUnderline: true,
                endAdornment: (
                  <InputAdornment position="end" sx={{ mr: 0.25, mb: 0.15 }}>
                    {writing ? (
                      <Tooltip title="Animation überspringen">
                        <span>
                          <IconButton onClick={() => setSkipAnimation(true)}>
                            <StopRoundedIcon sx={{ color: ACCENT_WARM }} />
                          </IconButton>
                        </span>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Nachricht senden">
                        <span>
                          <IconButton
                            onClick={() => sendMessage(inputText, true)}
                            disabled={!canSend}
                          >
                            <SendRoundedIcon
                              sx={{
                                color: canSend ? PRIMARY : `${TEXT_MUTED}80`,
                              }}
                            />
                          </IconButton>
                        </span>
                      </Tooltip>
                    )}
                  </InputAdornment>
                ),
              },
            }}
            multiline
            minRows={1}
            maxRows={4}
            spellCheck={false}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
        </Box>
      </Box>

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
          UniWell Assistant · KI-gestützte emotionale Unterstützung · Vertraulich &
          sicher
        </FooterLine>
      </Box>
    </Box>
  );
}

export default MainPage;