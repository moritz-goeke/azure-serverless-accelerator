import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import "katex/dist/katex.min.css";
import * as React from "react";
import AiMarkdown from "../components/AiMarkdown";
import {
  BORDER,
  MODEL_OPTIONS,
  PRIMARY,
  PRIMARY_DARK,
  TEXT_LIGHT,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  customScrollBar,
} from "../components/consts";
import NotificationSnackbar from "../components/NotificationSnackbar";
import SubjectPanel from "../components/SubjectPanel";
import Typewriter from "../components/Typewriter";

const CONVERSATION_CONTAINER = "Conversations";
const DEFAULT_ASSISTANT_MESSAGE =
  "Hallo! Ich bin euer KI-Assistent für den Unterricht. Stellt mir eine Frage – ich helfe euch gerne beim Lernen!";

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
  const [activeSubjectId, setActiveSubjectId] = React.useState(null);
  const messagesRef = React.useRef(null);
  const inputRef = React.useRef(null);

  const showSnackbar = React.useCallback((message) => {
    if (!message) return;
    setSnackbarMessage(message);
    setSnackbarOpen(true);
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
    },
    []
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
    try {
      const openaiPayload = {
        message: trimmedText,
        conversation: JSON.stringify(conversation),
        model: selectedModel,
      };
      if (activeSubjectId) {
        openaiPayload.subjectId = activeSubjectId;
      }
      const response = await axios.post("/api/openai", openaiPayload);
      let data = response.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (parseError) {
          console.warn("Failed to parse OpenAI response", parseError);
        }
      }
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

  const activeModel = MODEL_OPTIONS.find((m) => m.key === selectedModel);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", bgcolor: "#f1f5f9", overflow: "hidden", height: "100vh", fontFamily: "'Inter', sans-serif" }}>
      <NotificationSnackbar
        open={snackbarOpen}
        setOpen={setSnackbarOpen}
        message={snackbarMessage}
      />
      {/* HEADER */}
      <Box sx={{ height: 64, display: "flex", alignItems: "center", justifyContent: "space-between", bgcolor: "#fff", borderBottom: `1px solid ${BORDER}`, px: 3, boxShadow: "0 1px 3px rgba(0,0,0,0.04)", flexShrink: 0 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <Box sx={{ width: 42, height: 42, borderRadius: "12px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>
            🎓
          </Box>
          <Box>
            <Typography sx={{ fontSize: 17, fontWeight: 700, color: TEXT_PRIMARY, lineHeight: 1.2, letterSpacing: -0.3 }}>
              KI-Chatbot 123
            </Typography>
            <Typography sx={{ fontSize: 11, color: TEXT_SECONDARY, fontWeight: 500 }}>
              für den Unterricht
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: "flex", bgcolor: "#f1f5f9", borderRadius: "12px", p: 0.5 }}>
          {MODEL_OPTIONS.map((m) => (
            <Button
              key={m.key}
              onClick={() => setSelectedModel(m.key)}
              disabled={loadingAnswer}
              sx={{
                textTransform: "none", borderRadius: "10px", px: 2.5, py: 0.8,
                fontSize: 13, fontWeight: 600, minWidth: 130,
                bgcolor: selectedModel === m.key ? "#fff" : "transparent",
                color: selectedModel === m.key ? PRIMARY : TEXT_SECONDARY,
                boxShadow: selectedModel === m.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                "&:hover": { bgcolor: selectedModel === m.key ? "#fff" : "#e2e8f0" },
                transition: "all 0.2s ease",
              }}
            >
              <span style={{ marginRight: 6 }}>{m.icon}</span>{m.label}
            </Button>
          ))}
        </Box>
      </Box>

      {/* MAIN CONTENT */}
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* LEFT SIDEBAR - Conversations + Stats */}
        <Box sx={{ width: 320, flexShrink: 0, bgcolor: "#fff", borderRight: `1px solid ${BORDER}`, display: "flex", flexDirection: "column" }}>
          {/* Actions */}
          <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5, borderBottom: "1px solid #f1f5f9" }}>
            <Button
              variant="contained"
              startIcon={<AddCircleOutlineIcon />}
              onClick={handleCreateConversation}
              disabled={sidebarBusy || sidebarLoading || writing}
              sx={{
                textTransform: "none", fontWeight: 600, borderRadius: "12px",
                background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                boxShadow: "0 4px 14px rgba(99,102,241,0.3)",
                py: 1.2, fontSize: 14,
                "&:hover": { background: "linear-gradient(135deg, #4f46e5, #7c3aed)" },
              }}
            >
              Neues Gespräch
            </Button>
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={handleSaveConversation}
                fullWidth
                disabled={sidebarBusy || sidebarLoading || writing || loadingAnswer}
                sx={{
                  textTransform: "none", fontWeight: 600, borderRadius: "10px",
                  borderColor: BORDER, color: TEXT_SECONDARY,
                  "&:hover": { borderColor: PRIMARY, color: PRIMARY, bgcolor: "#f5f3ff" },
                }}
              >
                💾 Speichern
              </Button>
            </Box>
            <TextField
              label="Titel"
              variant="outlined"
              size="small"
              fullWidth
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              disabled={sidebarBusy}
              sx={{
                "& .MuiOutlinedInput-root": { borderRadius: "10px", bgcolor: "#f8fafc", fontSize: 13 },
                "& .MuiInputLabel-root": { color: TEXT_LIGHT },
              }}
            />
          </Box>

          {/* Subject Panel */}
          <Box sx={{ px: 1.5, py: 1.5, borderBottom: "1px solid #f1f5f9" }}>
            <SubjectPanel
              activeSubjectId={activeSubjectId}
              onSubjectChange={setActiveSubjectId}
              disabled={sidebarBusy || sidebarLoading || writing}
              showSnackbar={showSnackbar}
            />
          </Box>

          {/* Conversation list */}
          <Box sx={{ flex: 1, overflowY: "auto", p: 1.5, display: "flex", flexDirection: "column", gap: 0.5, ...customScrollBar() }}>
            <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: TEXT_LIGHT, px: 1, mb: 0.5 }}>
              Gespräche
            </Typography>
            {sidebarLoading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress size={24} sx={{ color: PRIMARY }} />
              </Box>
            ) : conversations.length ? (
              conversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId;
                return (
                  <Box
                    key={conversation.id}
                    onClick={() => handleSelectConversation(conversation.id)}
                    sx={{
                      px: 1.5, py: 1.2, borderRadius: "10px", cursor: "pointer",
                      bgcolor: isActive ? "#f5f3ff" : "transparent",
                      borderLeft: isActive ? "3px solid #6366f1" : "3px solid transparent",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      transition: "all 0.15s ease",
                      "&:hover": { bgcolor: isActive ? "#f5f3ff" : "#f8fafc" },
                    }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: isActive ? 600 : 500, color: TEXT_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {conversation.title || "(Ohne Titel)"}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: TEXT_LIGHT }}>
                        {formatConversationTimestamp(conversation.updatedAt || conversation.createdAt)}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      onClick={(event) => handleDeleteConversation(event, conversation.id)}
                      disabled={sidebarBusy}
                      sx={{ color: "#cbd5e1", "&:hover": { color: "#ef4444" } }}
                    >
                      <DeleteOutlineOutlinedIcon fontSize="small" />
                    </IconButton>
                  </Box>
                );
              })
            ) : (
              <Box sx={{ textAlign: "center", py: 6 }}>
                <Typography sx={{ fontSize: 32, mb: 1 }}>💬</Typography>
                <Typography sx={{ color: TEXT_LIGHT, fontSize: 13 }}>
                  Noch keine Gespräche
                </Typography>
              </Box>
            )}
          </Box>

        </Box>
        {/* CHAT AREA */}
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", bgcolor: "#f8fafc", minWidth: 0 }}>
          {/* Active model indicator */}
          <Box sx={{ px: 3, py: 1, borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "#10b981" }} />
              <Typography sx={{ fontSize: 12, color: TEXT_SECONDARY }}>
                Aktives Modell: <strong>{activeModel?.label}</strong> — {activeModel?.description}
              </Typography>
            </Box>
            {activeSubjectId && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, bgcolor: "#ede9fe", borderRadius: "6px", px: 1, py: 0.25 }}>
                <Typography sx={{ fontSize: 11, color: PRIMARY, fontWeight: 600 }}>
                  📚 Fach-Kontext aktiv
                </Typography>
              </Box>
            )}
          </Box>

          {/* Messages */}
          <Box
            ref={messagesRef}
            sx={{ flex: 1, overflowY: "auto", px: 3, py: 2, display: "flex", flexDirection: "column", ...customScrollBar("#cbd5e1"), minHeight: 0 }}
          >
            <Box sx={{ flex: 1, minHeight: 0 }} />
            {chatArray.map((chatObject, index) => (
              <Box
                key={index}
                sx={{ display: "flex", justifyContent: chatObject?.from === "user" ? "flex-end" : "flex-start", mb: 2, gap: 1.5, alignItems: "flex-start" }}
              >
                {chatObject?.from === "gpt" && (
                  <Box sx={{ width: 36, height: 36, borderRadius: "10px", flexShrink: 0, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, mt: 0.5, boxShadow: "0 2px 8px rgba(99,102,241,0.25)" }}>
                    🤖
                  </Box>
                )}
                <Box
                  sx={{
                    px: 2.5, py: 1.5, maxWidth: "75%",
                    borderRadius: chatObject?.from === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    bgcolor: chatObject?.from === "user" ? PRIMARY : "#fff",
                    color: chatObject?.from === "user" ? "#fff" : TEXT_PRIMARY,
                    boxShadow: chatObject?.from === "user" ? "0 4px 14px rgba(99,102,241,0.25)" : "0 1px 4px rgba(0,0,0,0.06)",
                    border: chatObject?.from === "user" ? "none" : `1px solid ${BORDER}`,
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
                {chatObject?.from === "user" && (
                  <Box sx={{ width: 36, height: 36, borderRadius: "10px", flexShrink: 0, bgcolor: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, mt: 0.5 }}>
                    👤
                  </Box>
                )}
              </Box>
            ))}
            {loadingAnswer && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 2 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: "10px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, boxShadow: "0 2px 8px rgba(99,102,241,0.25)" }}>
                  🤖
                </Box>
                <Box sx={{ px: 2.5, py: 2, borderRadius: "18px 18px 18px 4px", bgcolor: "#fff", border: `1px solid ${BORDER}`, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    {[0, 1, 2].map((i) => (
                      <Box key={i} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: PRIMARY, animation: "dotPulse 1.4s ease-in-out infinite", animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </Box>
                </Box>
              </Box>
            )}
          </Box>

          {/* Input Area */}
          <Box sx={{ px: 3, pb: 2.5, pt: 1 }}>
            <Box
              sx={{
                display: "flex", alignItems: "flex-end", gap: 1.5,
                p: 1.5, bgcolor: "#fff", borderRadius: "16px",
                border: `1px solid ${BORDER}`,
                boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
                transition: "border-color 0.2s, box-shadow 0.2s",
                "&:focus-within": { borderColor: PRIMARY, boxShadow: "0 4px 20px rgba(99,102,241,0.1)" },
              }}
            >
              <TextField
                disabled={writing}
                variant="standard"
                fullWidth
                multiline
                maxRows={4}
                placeholder="Stelle eine Frage zum Unterrichtsthema..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(inputText, true);
                  }
                }}
                slotProps={{
                  htmlInput: { ref: inputRef, style: { fontSize: 15, lineHeight: 1.5 } },
                  input: { disableUnderline: true },
                }}
                sx={{ "& .MuiInputBase-root": { px: 1 } }}
                spellCheck={false}
              />
              {writing ? (
                <IconButton onClick={() => setSkipAnimation(true)} sx={{ bgcolor: "#fef2f2", "&:hover": { bgcolor: "#fee2e2" }, flexShrink: 0 }}>
                  <StopRoundedIcon sx={{ color: "#ef4444" }} />
                </IconButton>
              ) : (
                <IconButton
                  onClick={() => sendMessage(inputText, true)}
                  disabled={writing || !inputText.trim()}
                  sx={{
                    bgcolor: PRIMARY, "&:hover": { bgcolor: PRIMARY_DARK },
                    "&.Mui-disabled": { bgcolor: "#e2e8f0" },
                    transition: "all 0.2s ease", flexShrink: 0,
                  }}
                >
                  <SendRoundedIcon sx={{ color: "#fff", fontSize: 20 }} />
                </IconButton>
              )}
            </Box>
            <Typography sx={{ textAlign: "center", fontSize: 11, color: TEXT_LIGHT, mt: 1.5 }}>
              KI-Chatbot für Schüler*innen im Unterricht · Powered by Azure
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Sidebar busy overlay */}
      {sidebarBusy && (
        <Box sx={{ position: "fixed", top: 0, left: 0, width: 320, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "rgba(255,255,255,0.8)", backdropFilter: "blur(4px)", zIndex: 10 }}>
          <CircularProgress size={28} sx={{ color: PRIMARY }} />
        </Box>
      )}
    </Box>
  );
}

export default MainPage;
