import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StopRoundedIcon from "@mui/icons-material/StopRounded";
import {
  Box,
  Button,
  CircularProgress,
  Icon,
  IconButton,
  InputAdornment,
  LinearProgress,
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
  AZURE_FUNCTION_COST_CT_PER_GB_SECOND,
  LIGHT_BLUE,
  RED,
  WHITE,
  costInCentPerInputToken,
  costInCentPerOutputToken,
  customScrollBar,
} from "../components/consts";
import { FooterLine } from "../components/Footer";
import { beautifyCostCentValue } from "../components/helpers";
import Typewriter from "../components/Typewriter";

const CONVERSATION_CONTAINER = "Conversations";
const DEFAULT_ASSISTANT_MESSAGE =
  "Hello, I am the serverless agent. Ask me a question about serverless on Azure.";

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
  const selectedModel = "gpt5mini";
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
  const messagesRef = React.useRef(null);
  const inputRef = React.useRef(null);

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
    } finally {
      setSidebarLoading(false);
    }
  }, [fetchConversationList, handleCreateConversation, loadConversation]);

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
    } catch (error) {
      console.error("Failed to delete conversation", error);
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
        }
      }
    } catch (error) {
      console.error("Failed to save conversation", error);
    } finally {
      setSidebarBusy(false);
    }
  }, [activeConversationId, chatArray, titleDraft, upsertConversation]);

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
      const response = await axios.post(
        "/api/openai",
        {
          message: trimmedText,
          conversation: JSON.stringify(conversation),
        },
        {
          headers: {
            "Content-Type": "text/plain",
          },
        }
      );
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

  const fontMono = { fontFamily: "Lato", fontSize: 12, letterSpacing: 0.3 };
  const metricRow = (label, value) => (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Typography sx={{ ...fontMono, color: "#8fa3ad" }}>{label}</Typography>
      <Typography sx={{ ...fontMono, fontWeight: 600, color: "#dde7eb" }}>
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
        background: "#1d272e",
        borderRadius: 2,
        border: "1px solid #ffffff12",
        display: "flex",
        flexDirection: "column",
        gap: 0.5,
        height: 180,
      }}
    >
      <Typography
        sx={{
          fontFamily: "Lato",
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: LIGHT_BLUE,
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
            <Typography sx={{ ...fontMono, color: "#8fa3ad", fontSize: 11 }}>
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
          <CartesianGrid strokeDasharray="2 4" stroke="#27343c" />
          <XAxis
            dataKey="index"
            stroke="#5d6b72"
            tick={{ fontSize: 10 }}
            type="number"
            domain={["dataMin", "dataMax"]}
          />
          <YAxis stroke="#5d6b72" tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              background: "#223039",
              border: "1px solid #33505c",
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
        bgcolor: "#0e1418",
        color: WHITE,
        overflow: "hidden",
        height: "100vh",
      }}
    >
      <Box
        sx={{
          height: 64,
          width: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",

          background: "linear-gradient(90deg,#162634,#1d3646)",
          borderBottom: "1px solid #1f2f38",
        }}
      >
        <Box
          sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0 }}
        >
          <Icon
            sx={{
              ml: 3,
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
          <Typography
            sx={{
              fontFamily: "Lato",
              fontSize: 18,
              fontWeight: 400,
              lineHeight: 1,
            }}
          >
            Serverless App | AI Chat
          </Typography>
        </Box>
      </Box>
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <Box
          sx={{
            width: 360,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
            p: 2,
            borderRight: "1px solid #1f2f38",
            bgcolor: "#121b21",
            minHeight: 0,
          }}
        >
          <Box
            sx={{
              p: 1.5,
              border: "1px solid #1f3640",
              borderRadius: 2,
              background: "linear-gradient(145deg,#15232c,#1d2f38)",
              display: "flex",
              flexDirection: "column",
              gap: 0.6,
            }}
          >
            {metricRow("Prompt Tokens", promptTokens)}
            {metricRow("Completion Tokens", completionTokens)}
            {metricRow(
              "AI Cost (ct)",
              beautifyCostCentValue(sessionCostConsumption)
            )}
            {metricRow("Exec Time (ms)", functionExecutionTime)}
            {metricRow(
              "Func Cost (ct)",
              beautifyCostCentValue(functionComputeCost)
            )}
            {metricRow("Total (ct)", beautifyCostCentValue(totalOverallCost))}
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
                color: "#3ba9ff",
                label: "Prompt",
              },
              {
                data: cumulative.tokensCompletion,
                color: "#36d9c6",
                label: "Completion",
              },
            ])}
            {chartCard("Computation Time (ms)", [
              { data: cumulative.exec, color: "#ffb347", label: "Exec (ms)" },
            ])}
            {chartCard("Total costs (ct)", [
              { data: cumulative.cost, color: "#e45b78", label: "Cost (ct)" },
            ])}
          </Box>
        </Box>
        <Box sx={{ flex: 1, display: "flex", minWidth: 0, overflow: "hidden" }}>
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              p: 2,
              gap: 1.5,
              bgcolor: "#0f181d",
            }}
          >
            <Box
              ref={messagesRef}
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflowY: "auto",
                border: "1px solid #1f2f38",
                borderRadius: 2,
                background: "#142229",
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
                        chatObject?.from === "user" ? "#ffffff" : "#e7f1f5",
                      color: "#102027",
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
                      backgroundColor: "#1d3038",
                      "& .MuiLinearProgress-bar": {
                        backgroundColor: LIGHT_BLUE,
                      },
                    }}
                  />
                </Box>
              )}
            </Box>
            <TextField
              disabled={writing}
              variant="filled"
              placeholder="Enter your message."
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
                  bgcolor: "#1b2a31",
                  color: WHITE,
                  boxShadow: "inset 0 0 0 1px #22333b",
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
                          <StopRoundedIcon color={RED} />
                        </IconButton>
                      ) : (
                        <IconButton
                          onClick={() => sendMessage(inputText, true)}
                          disabled={writing}
                        >
                          <SendRoundedIcon color={RED} />
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
          <Box
            sx={{
              width: 260,
              flexShrink: 0,
              borderLeft: "1px solid #1f2f38",
              bgcolor: "#111920",
              display: "flex",
              flexDirection: "column",
              gap: 1,
              p: 1.5,
              position: "relative",
            }}
          >
            <Typography
              sx={{
                fontFamily: "Lato",
                fontSize: 12,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                color: "#6d838f",
              }}
            >
              Conversations
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
                  bgcolor: "#1e6c8c",
                  "&:hover": { bgcolor: "#2180a5" },
                }}
              >
                New Conversation
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
                  borderColor: "#2f5667",
                  color: "#b7c6ce",
                  "&:hover": { borderColor: "#3e6f84" },
                }}
              >
                Save Conversation
              </Button>
            </Box>
            <TextField
              label="Title"
              variant="filled"
              size="small"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              disabled={sidebarBusy}
              helperText=" "
              sx={{
                ".MuiInputBase-root": {
                  borderRadius: 2,
                  bgcolor: "#16232b",
                  color: WHITE,
                  px: 1.2,
                },
                "& .MuiInputBase-root:before": { borderBottom: "none" },
                "& .MuiInputBase-root:after": { borderBottom: "none" },
                ".MuiFormLabel-root": { color: "#7c8d96" },
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
                ...customScrollBar("#34505e"),
              }}
            >
              {sidebarLoading ? (
                <Typography sx={{ color: "#7d909a", fontSize: 13 }}>
                  Loading conversations...
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
                          ? "1px solid #2f5667"
                          : "1px solid transparent",
                        bgcolor: isActive ? "#17242c" : "transparent",
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
                          {conversation.title || "(Untitled)"}
                        </Typography>
                        <Typography
                          sx={{
                            fontSize: 11,
                            color: "#7b8c95",
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
                        sx={{ color: "#7d8f98" }}
                      >
                        <DeleteOutlineOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  );
                })
              ) : (
                <Typography sx={{ color: "#7d909a", fontSize: 13 }}>
                  No conversations yet
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
                  bgcolor: "rgba(15,24,29,0.8)",
                  borderRadius: 0,
                  zIndex: 2,
                }}
              >
                <CircularProgress
                  size={28}
                  thickness={4}
                  sx={{ color: LIGHT_BLUE }}
                />
              </Box>
            )}
          </Box>
        </Box>
      </Box>
      <Box
        sx={{
          width: 1,
          textAlign: "center",
          py: 0.7,
          borderTop: "1px solid #1f2f38",
          bgcolor: "#0b1317",
        }}
      >
        <FooterLine typographySx={{ fontSize: 11, color: "#66767e" }}>
          Built on Azure • Serverless AI App
        </FooterLine>
      </Box>
    </Box>
  );
}

export default MainPage;
