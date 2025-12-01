import { Box } from "@mui/material";
import "katex/dist/katex.min.css";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

const normalizeMathContent = (value) => {
  const text = typeof value === "string" ? value : String(value ?? "");
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_match, expr) => `$$\n${expr}\n$$`)
    .replace(/\\\((.+?)\\\)/g, (_match, expr) => `$${expr}$`);
};

export default function AiMarkdown({ children, fontSize = 14 }) {
  return (
    <Box
      sx={{ fontFamily: "Lato !important", fontSize: { xs: 12, md: fontSize } }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code: ({ children }) => (
            <code
              style={{
                backgroundColor: "#00000055",
              }}
            >
              {children}
            </code>
          ),
          strong: ({ children }) => (
            <strong
              style={{
                letterSpacing: 0.75,
                fontWeight: "bold",
              }}
            >
              {children}
            </strong>
          ),
          p: ({ children }) => (
            <p style={{ padding: "1px 0px", margin: 0 }}>{children}</p>
          ),
        }}
      >
        {normalizeMathContent(children)}
      </ReactMarkdown>
    </Box>
  );
}
