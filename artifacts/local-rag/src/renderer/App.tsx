import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import ModelBadge from "./components/ModelBadge";
import SummaryModal from "./components/SummaryModal";
import type {
  AppSettings,
  Document,
  ChatMessage,
  ModelInfo,
  ChatSession,
  ChatHistoryMessage,
  SourceChunk,
  SearchMode,
} from "../shared/types";

export default function App() {
  const [modelInfo, setModelInfo] = useState<ModelInfo>({ loaded: false });
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isQuerying, setIsQuerying] = useState(false);
  const [summaryDoc, setSummaryDoc] = useState<Document | null>(null);
  const [summaryText, setSummaryText] = useState<string>("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [importingFiles, setImportingFiles] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<AppSettings>({ semanticSearch: false });

  // History state
  const [sessions, setSessions] = useState<ChatSession[]>([]);

  // ── Persistence refs (synchronous, not state) ────────────────────────────────
  // Active session ID for the current conversation
  const currentSessionIdRef = useRef<number | null>(null);
  // Message IDs that have been successfully written to the DB
  const savedMessageIdsRef = useRef<Set<string>>(new Set());
  // Whether at least one message was successfully persisted in this session
  // (used to decide whether to clean up an empty session on cancel/error)
  const sessionHasSavedMsgsRef = useRef(false);
  // Mirror of the messages state for synchronous reads in event handlers
  const messagesRef = useRef<ChatMessage[]>([]);

  // Keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // ── Startup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    window.electronAPI.getModelInfo().then(setModelInfo);
    window.electronAPI.getSettings().then(setSettings);
    refreshDocuments();
    refreshSessions();
  }, []);

  const refreshSessions = async () => {
    const list = await window.electronAPI.listSessions();
    setSessions(list);
  };

  // ── Persistence helpers ──────────────────────────────────────────────────────

  /** Create a session the first time it is needed; idempotent after that. */
  const ensureSession = useCallback(async (firstQuestion: string): Promise<number | null> => {
    if (currentSessionIdRef.current !== null) return currentSessionIdRef.current;
    try {
      const title = firstQuestion.slice(0, 60) || "Phiên mới";
      const { id } = await window.electronAPI.createSession(title);
      currentSessionIdRef.current = id;
      sessionHasSavedMsgsRef.current = false;
      return id;
    } catch {
      return null;
    }
  }, []);

  /**
   * Persist one message, mark its ID saved on success.
   * Returns true if the write succeeded.
   */
  const persistMessage = useCallback(
    async (
      sessionId: number,
      msg: ChatMessage,
      sources: SourceChunk[] | null,
      searchMode: SearchMode | null
    ): Promise<boolean> => {
      if (savedMessageIdsRef.current.has(msg.id)) return true; // already saved
      try {
        await window.electronAPI.saveMessage(
          sessionId,
          msg.role,
          msg.content,
          sources ?? null,
          searchMode ?? null
        );
        savedMessageIdsRef.current.add(msg.id);
        sessionHasSavedMsgsRef.current = true;
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  /**
   * Delete the current session if no messages were ever saved to it
   * (prevents empty ghost sessions from cancel/error before any write).
   */
  const cleanupEmptySessionIfNeeded = useCallback(async () => {
    const id = currentSessionIdRef.current;
    if (id !== null && !sessionHasSavedMsgsRef.current) {
      try {
        await window.electronAPI.deleteSession(id);
      } catch {
        // best-effort
      }
      currentSessionIdRef.current = null;
      savedMessageIdsRef.current = new Set();
      sessionHasSavedMsgsRef.current = false;
    }
  }, []);

  // ── Streaming listeners ──────────────────────────────────────────────────────
  useEffect(() => {
    const unsubChunk = window.electronAPI.onChatChunk((chunk) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        return [...prev.slice(0, -1), { ...last, content: last.content + chunk }];
      });
    });

    const unsubDone = window.electronAPI.onChatDone(({ sources, searchMode }) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        const updated = { ...last, isStreaming: false, sources, searchMode };
        const next = [...prev.slice(0, -1), updated];

        // Save only the assistant message — user message was saved on send.
        const sessionId = currentSessionIdRef.current;
        if (sessionId !== null && !savedMessageIdsRef.current.has(updated.id)) {
          persistMessage(sessionId, updated, sources, searchMode)
            .then(() => refreshSessions())
            .catch(() => {});
        }

        return next;
      });
      setIsQuerying(false);
    });

    const unsubError = window.electronAPI.onChatError((error) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        const updated = {
          ...last,
          content: `⚠️ Lỗi: ${error}`,
          isStreaming: false,
        };
        const next = [...prev.slice(0, -1), updated];

        // Persist the error assistant message, then clean up if nothing was
        // saved (i.e. only the user message went through, which already
        // counted — but if even that failed, drop the empty session).
        const sessionId = currentSessionIdRef.current;
        if (sessionId !== null && !savedMessageIdsRef.current.has(updated.id)) {
          persistMessage(sessionId, updated, null, null)
            .then(() => refreshSessions())
            .then(() => cleanupEmptySessionIfNeeded())
            .catch(() => cleanupEmptySessionIfNeeded());
        } else {
          cleanupEmptySessionIfNeeded();
        }

        return next;
      });
      setIsQuerying(false);
    });

    return () => {
      unsubChunk();
      unsubDone();
      unsubError();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistMessage, cleanupEmptySessionIfNeeded]);

  // ── Document actions ─────────────────────────────────────────────────────────
  const refreshDocuments = async () => {
    const docs = await window.electronAPI.listDocuments();
    setDocuments(docs);
    setSelectedDocIds((prev) =>
      prev.filter((id) => docs.some((d) => d.id === id))
    );
  };

  const handlePickModel = async () => {
    const result = await window.electronAPI.pickModel();
    if (result.canceled || !result.filePath) return;
    setModelInfo({ loaded: false });
    const res = await window.electronAPI.loadModel(result.filePath);
    if (res.success) {
      setModelInfo({ loaded: true, path: result.filePath, name: res.name });
    } else {
      alert(`Không thể tải mô hình: ${res.error}`);
    }
  };

  const handleImportFiles = async () => {
    const result = await window.electronAPI.pickFiles();
    if (result.canceled || !result.filePaths) return;
    for (const fp of result.filePaths) {
      const fileName = fp.split(/[/\\]/).pop() ?? fp;
      setImportingFiles((prev) => new Set(prev).add(fileName));
      const res = await window.electronAPI.importFile(fp);
      if (!res.success) alert(`Lỗi import ${fileName}: ${res.error}`);
      setImportingFiles((prev) => {
        const next = new Set(prev);
        next.delete(fileName);
        return next;
      });
    }
    await refreshDocuments();
  };

  const handleDeleteDoc = async (id: number) => {
    await window.electronAPI.deleteDocument(id);
    await refreshDocuments();
  };

  const handleToggleDoc = (id: number) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedDocIds.length === documents.length) {
      setSelectedDocIds([]);
    } else {
      setSelectedDocIds(documents.map((d) => d.id));
    }
  };

  const handleSettingChange = useCallback(
    async (key: string, value: string) => {
      await window.electronAPI.setSetting(key, value);
      const updated = await window.electronAPI.getSettings();
      setSettings(updated);
    },
    []
  );

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const handleSendMessage = useCallback(
    async (question: string) => {
      if (!modelInfo.loaded) {
        alert("Vui lòng chọn mô hình AI trước khi chat.");
        return;
      }
      if (selectedDocIds.length === 0) {
        alert("Vui lòng chọn ít nhất một tài liệu để hỏi.");
        return;
      }

      // Ensure a session exists BEFORE dispatching the query so the done/error
      // handlers always find a valid session ID.
      const sessionId = await ensureSession(question);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: question,
      };
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsQuerying(true);

      // Save the user message immediately — this guarantees it is persisted
      // even if the response is cancelled or errors out.
      if (sessionId !== null) {
        persistMessage(sessionId, userMsg, null, null).catch(() => {});
      }

      window.electronAPI.sendQuery(question, selectedDocIds, settings.semanticSearch);
    },
    [modelInfo.loaded, selectedDocIds, settings.semanticSearch, ensureSession, persistMessage]
  );

  const handleCancelQuery = useCallback(async () => {
    window.electronAPI.cancelQuery();

    // Capture the in-progress assistant message synchronously before state update
    const currentMsgs = messagesRef.current;
    const last = currentMsgs[currentMsgs.length - 1];

    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;
      return [
        ...prev.slice(0, -1),
        { ...last, content: last.content + "\n\n_[Đã dừng]_", isStreaming: false },
      ];
    });
    setIsQuerying(false);

    // Persist the cancelled assistant message (with whatever content was streamed)
    const sessionId = currentSessionIdRef.current;
    if (
      sessionId !== null &&
      last &&
      last.role === "assistant" &&
      !savedMessageIdsRef.current.has(last.id)
    ) {
      const cancelledContent = last.content
        ? last.content + "\n\n_[Đã dừng]_"
        : "_[Đã dừng]_";
      const syntheticMsg: ChatMessage = {
        ...last,
        content: cancelledContent,
        isStreaming: false,
      };
      await persistMessage(sessionId, syntheticMsg, null, null);
      await refreshSessions();
    }

    // Remove ghost sessions that have no saved messages
    await cleanupEmptySessionIfNeeded();
  }, [persistMessage, cleanupEmptySessionIfNeeded]);

  const handleSummarize = async (doc: Document) => {
    if (!modelInfo.loaded) {
      alert("Vui lòng chọn mô hình AI trước khi tổng hợp.");
      return;
    }
    setSummaryDoc(doc);
    setSummaryText("");
    setIsSummarizing(true);
    const res = await window.electronAPI.summarizeDocument(doc.id);
    setIsSummarizing(false);
    if (res.success && res.summary) {
      setSummaryText(res.summary);
    } else {
      setSummaryText(`⚠️ Lỗi: ${res.error}`);
    }
  };

  /** Start a fresh conversation. */
  const handleClearChat = () => {
    setMessages([]);
    currentSessionIdRef.current = null;
    savedMessageIdsRef.current = new Set();
    sessionHasSavedMsgsRef.current = false;
  };

  // ── History handlers ─────────────────────────────────────────────────────────

  /** Load a historical session into the chat panel (read-only restore). */
  const handleLoadSession = useCallback(
    (historyMessages: ChatHistoryMessage[], _title: string) => {
      const mapped: ChatMessage[] = historyMessages.map((m) => ({
        id: String(m.id),
        role: m.role,
        content: m.content,
        sources: m.sources ?? undefined,
        searchMode: m.searchMode ?? undefined,
        isStreaming: false,
      }));
      setMessages(mapped);
      // Reset tracking so new messages won't be appended to the historical session
      currentSessionIdRef.current = null;
      savedMessageIdsRef.current = new Set(mapped.map((m) => m.id));
      sessionHasSavedMsgsRef.current = false;
    },
    []
  );

  const handleDeleteSession = useCallback(async (sessionId: number) => {
    await window.electronAPI.deleteSession(sessionId);
    // If the deleted session was the active one, clear the ref so subsequent
    // messages don't attempt to insert into a non-existent foreign key.
    if (currentSessionIdRef.current === sessionId) {
      currentSessionIdRef.current = null;
      savedMessageIdsRef.current = new Set();
      sessionHasSavedMsgsRef.current = false;
    }
    await refreshSessions();
  }, []);

  const handleDeleteAllSessions = useCallback(async () => {
    await window.electronAPI.deleteAllSessions();
    // Reset active session tracking unconditionally.
    currentSessionIdRef.current = null;
    savedMessageIdsRef.current = new Set();
    sessionHasSavedMsgsRef.current = false;
    await refreshSessions();
  }, []);

  const handleExportSession = useCallback(
    async (sessionId: number, format: "md" | "txt") => {
      const res = await window.electronAPI.exportSession(sessionId, format);
      if (!res.success && res.error && res.error !== "Đã hủy") {
        alert(`Lỗi xuất file: ${res.error}`);
      }
    },
    []
  );

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--color-bg)" }}>
      {/* Title bar */}
      <div
        className="drag-region flex items-center justify-between px-4"
        style={{
          height: 44,
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-2 no-drag">
          <span style={{ fontSize: 18 }}>🤖</span>
          <span style={{ fontWeight: 600, color: "var(--color-text)", fontSize: 15 }}>
            DocChat AI
          </span>
        </div>
        <div className="no-drag">
          <ModelBadge modelInfo={modelInfo} onPick={handlePickModel} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          documents={documents}
          selectedDocIds={selectedDocIds}
          importingFiles={importingFiles}
          settings={settings}
          sessions={sessions}
          onImport={handleImportFiles}
          onDelete={handleDeleteDoc}
          onToggle={handleToggleDoc}
          onSelectAll={handleSelectAll}
          onSummarize={handleSummarize}
          onSettingChange={handleSettingChange}
          onLoadSession={handleLoadSession}
          onDeleteSession={handleDeleteSession}
          onDeleteAllSessions={handleDeleteAllSessions}
          onExportSession={handleExportSession}
        />
        <ChatPanel
          messages={messages}
          isQuerying={isQuerying}
          selectedDocCount={selectedDocIds.length}
          modelLoaded={modelInfo.loaded}
          semanticSearchEnabled={settings.semanticSearch}
          onSend={handleSendMessage}
          onCancel={handleCancelQuery}
          onClear={handleClearChat}
        />
      </div>

      {/* Summary modal */}
      {summaryDoc && (
        <SummaryModal
          doc={summaryDoc}
          summary={summaryText}
          isLoading={isSummarizing}
          onClose={() => {
            setSummaryDoc(null);
            setSummaryText("");
          }}
        />
      )}
    </div>
  );
}
