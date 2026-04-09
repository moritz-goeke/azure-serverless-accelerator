import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import * as React from "react";
import { BORDER, PRIMARY, TEXT_LIGHT, TEXT_PRIMARY, TEXT_SECONDARY, customScrollBar } from "./consts";

const formatDate = (value) => {
  if (!value) return "";
  const d = new Date(typeof value === "string" ? Number(value) : value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(d);
};

export default function SubjectPanel({
  activeSubjectId,
  onSubjectChange,
  disabled,
  showSnackbar,
}) {
  const [subjects, setSubjects] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [newSubjectName, setNewSubjectName] = React.useState("");
  const [docsDialogOpen, setDocsDialogOpen] = React.useState(false);
  const [documents, setDocuments] = React.useState([]);
  const [docsLoading, setDocsLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef(null);

  const fetchSubjects = React.useCallback(async () => {
    try {
      const response = await axios.post("/api/readSubjects");
      const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      setSubjects(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load subjects", error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSubjects();
  }, [fetchSubjects]);

  const handleCreateSubject = async () => {
    if (!newSubjectName.trim()) return;
    setBusy(true);
    try {
      const response = await axios.post("/api/createSubject", { name: newSubjectName.trim() });
      const created = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      if (created?.id) {
        setSubjects((prev) => [...prev, { ...created, documentCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
        onSubjectChange(created.id);
        showSnackbar?.(`Fach "${created.name}" erstellt.`);
      }
      setNewSubjectName("");
      setCreateDialogOpen(false);
    } catch (error) {
      console.error("Failed to create subject", error);
      showSnackbar?.("Fach konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSubject = async (event, subjectId) => {
    event?.stopPropagation();
    setBusy(true);
    try {
      await axios.post("/api/deleteSubject", { subjectId });
      setSubjects((prev) => prev.filter((s) => s.id !== subjectId));
      if (activeSubjectId === subjectId) {
        onSubjectChange(null);
      }
      showSnackbar?.("Fach gelöscht.");
    } catch (error) {
      console.error("Failed to delete subject", error);
      showSnackbar?.("Fach konnte nicht gelöscht werden.");
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDocs = async (subjectId) => {
    setDocsDialogOpen(true);
    setDocsLoading(true);
    try {
      const response = await axios.post("/api/readSubjectDocuments", { subjectId });
      const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      setDocuments(data?.documents || []);
    } catch (error) {
      console.error("Failed to load documents", error);
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !activeSubjectId) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      showSnackbar?.("Bitte nur PDF-Dateien hochladen.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showSnackbar?.("Datei zu groß (max. 10 MB).");
      return;
    }

    setUploading(true);
    try {
      const base64 = await fileToBase64(file);
      const response = await axios.post("/api/uploadDocument", {
        subjectId: activeSubjectId,
        filename: file.name,
        fileBase64: base64,
      });
      const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;

      // Update document count in subjects list
      setSubjects((prev) =>
        prev.map((s) =>
          s.id === activeSubjectId
            ? { ...s, documentCount: data?.totalDocuments ?? (s.documentCount || 0) + 1 }
            : s
        )
      );

      // If docs dialog is open, add document
      if (docsDialogOpen && data?.document) {
        setDocuments((prev) => [...prev, data.document]);
      }

      showSnackbar?.(`"${file.name}" hochgeladen.`);
    } catch (error) {
      console.error("Failed to upload document", error);
      const msg = error?.response?.data || "Upload fehlgeschlagen.";
      showSnackbar?.(typeof msg === "string" ? msg : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteDocument = async (documentId) => {
    if (!activeSubjectId) return;
    try {
      const response = await axios.post("/api/deleteDocument", {
        subjectId: activeSubjectId,
        documentId,
      });
      const data = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      setSubjects((prev) =>
        prev.map((s) =>
          s.id === activeSubjectId
            ? { ...s, documentCount: data?.remainingDocuments ?? Math.max(0, (s.documentCount || 1) - 1) }
            : s
        )
      );
      showSnackbar?.("Dokument gelöscht.");
    } catch (error) {
      console.error("Failed to delete document", error);
      showSnackbar?.("Dokument konnte nicht gelöscht werden.");
    }
  };

  const activeSubject = subjects.find((s) => s.id === activeSubjectId);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.2, color: TEXT_LIGHT, px: 1 }}>
          Fächer
        </Typography>
        <IconButton
          size="small"
          onClick={() => setCreateDialogOpen(true)}
          disabled={busy || disabled}
          sx={{ color: PRIMARY, "&:hover": { bgcolor: "#f5f3ff" } }}
        >
          <AddCircleOutlineIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Subject chips */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
          <CircularProgress size={18} sx={{ color: PRIMARY }} />
        </Box>
      ) : subjects.length === 0 ? (
        <Typography sx={{ fontSize: 12, color: TEXT_LIGHT, px: 1 }}>
          Noch keine Fächer. Erstelle eins!
        </Typography>
      ) : (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, px: 0.5 }}>
          {subjects.map((subject) => {
            const isActive = subject.id === activeSubjectId;
            return (
              <Chip
                key={subject.id}
                label={`${subject.name} (${subject.documentCount || 0})`}
                size="small"
                onClick={() => onSubjectChange(isActive ? null : subject.id)}
                onDelete={(e) => handleDeleteSubject(e, subject.id)}
                disabled={busy || disabled}
                deleteIcon={<CloseIcon sx={{ fontSize: "14px !important" }} />}
                sx={{
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 12,
                  bgcolor: isActive ? "#ede9fe" : "#f8fafc",
                  color: isActive ? PRIMARY : TEXT_SECONDARY,
                  border: isActive ? `1.5px solid ${PRIMARY}` : `1px solid ${BORDER}`,
                  "&:hover": { bgcolor: isActive ? "#ede9fe" : "#f1f5f9" },
                  "& .MuiChip-deleteIcon": {
                    color: isActive ? PRIMARY : TEXT_LIGHT,
                    "&:hover": { color: "#ef4444" },
                  },
                }}
              />
            );
          })}
        </Box>
      )}

      {/* Active subject actions */}
      {activeSubject && (
        <Box sx={{ display: "flex", gap: 0.5, px: 0.5, mt: 0.5 }}>
          <Button
            size="small"
            startIcon={uploading ? <CircularProgress size={14} /> : <UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || busy || disabled}
            sx={{
              textTransform: "none", fontSize: 11, fontWeight: 600,
              borderRadius: "8px", color: PRIMARY, bgcolor: "#f5f3ff",
              "&:hover": { bgcolor: "#ede9fe" },
              flex: 1,
            }}
          >
            {uploading ? "Lädt..." : "PDF hochladen"}
          </Button>
          <Button
            size="small"
            startIcon={<DescriptionOutlinedIcon />}
            onClick={() => handleOpenDocs(activeSubject.id)}
            disabled={busy || disabled}
            sx={{
              textTransform: "none", fontSize: 11, fontWeight: 600,
              borderRadius: "8px", color: TEXT_SECONDARY, bgcolor: "#f8fafc",
              border: `1px solid ${BORDER}`,
              "&:hover": { bgcolor: "#f1f5f9" },
              flex: 1,
            }}
          >
            Dokumente
          </Button>
        </Box>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        accept=".pdf"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={handleFileSelect}
      />

      {/* Upload progress */}
      {uploading && (
        <LinearProgress sx={{ mx: 0.5, borderRadius: 4, "& .MuiLinearProgress-bar": { bgcolor: PRIMARY } }} />
      )}

      {/* Create Subject Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Neues Fach erstellen</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="Fachname"
            placeholder="z.B. Mathematik, Deutsch, Biologie..."
            value={newSubjectName}
            onChange={(e) => setNewSubjectName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateSubject(); }}
            disabled={busy}
            sx={{ mt: 1, "& .MuiOutlinedInput-root": { borderRadius: "10px" } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={busy} sx={{ textTransform: "none", color: TEXT_SECONDARY }}>
            Abbrechen
          </Button>
          <Button
            onClick={handleCreateSubject}
            disabled={busy || !newSubjectName.trim()}
            variant="contained"
            sx={{
              textTransform: "none", fontWeight: 600, borderRadius: "10px",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              "&:hover": { background: "linear-gradient(135deg, #4f46e5, #7c3aed)" },
            }}
          >
            Erstellen
          </Button>
        </DialogActions>
      </Dialog>

      {/* Documents Dialog */}
      <Dialog open={docsDialogOpen} onClose={() => setDocsDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>📚 Dokumente – {activeSubject?.name}</span>
          <IconButton size="small" onClick={() => setDocsDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {docsLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <CircularProgress size={28} sx={{ color: PRIMARY }} />
            </Box>
          ) : documents.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography sx={{ fontSize: 40, mb: 1 }}>📄</Typography>
              <Typography sx={{ color: TEXT_LIGHT }}>Noch keine Dokumente.</Typography>
              <Typography sx={{ color: TEXT_LIGHT, fontSize: 13 }}>
                Lade PDFs hoch, um dem Chatbot Unterrichtsmaterial bereitzustellen.
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1, ...customScrollBar() }}>
              {documents.map((doc) => (
                <Box
                  key={doc.id}
                  sx={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    p: 1.5, borderRadius: "10px", border: `1px solid ${BORDER}`,
                    bgcolor: "#fafafa",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, minWidth: 0, flex: 1 }}>
                    <DescriptionOutlinedIcon sx={{ color: PRIMARY, fontSize: 20 }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 500, color: TEXT_PRIMARY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {doc.filename}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: TEXT_LIGHT }}>
                        {doc.charCount ? `${Math.round(doc.charCount / 1000)}k Zeichen` : ""}{" "}
                        · {formatDate(doc.uploadedAt)}
                      </Typography>
                    </Box>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteDocument(doc.id)}
                    sx={{ color: "#cbd5e1", "&:hover": { color: "#ef4444" } }}
                  >
                    <DeleteOutlineOutlinedIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            startIcon={uploading ? <CircularProgress size={14} /> : <UploadFileIcon />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            sx={{
              textTransform: "none", fontWeight: 600, borderRadius: "10px",
              color: PRIMARY, "&:hover": { bgcolor: "#f5f3ff" },
            }}
          >
            {uploading ? "Lädt..." : "Weiteres PDF hochladen"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
