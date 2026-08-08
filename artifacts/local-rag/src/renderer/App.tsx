import { useState, useEffect, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import ModelBadge from "./components/ModelBadge";
import SummaryModal from "./components/SummaryModal";
import type { AppSettings, Document, ChatMessage, ModelInfo } from "../shared/types";


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

  // Load model info, documents, and settings on mount
  useEffect(() => {
    window.electronAPI.getModelInfo().then(setModelInfo);
    window.electronAPI.getSettings().then(setSettings);
    refreshDocuments();
  }, []);

  // Set up streaming listeners
  useEffect(() => {
    const unsubChunk = window.electronAPI.onChatChunk((chunk) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content + chunk },
        ];
      });
    });

    const unsubDone = window.electronAPI.onChatDone(({ sources, searchMode }) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        return [
          ...prev.slice(0, -1),
          { ...last, isStreaming: false, sources, searchMode },
        ];
      });
      setIsQuerying(false);
    });

    const unsubError = window.electronAPI.onChatError((error) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            content: `⚠️ Lỗi: ${error}`,
            isStreaming: false,
          },
        ];
      });
      setIsQuerying(false);
    });

    return () => {
      unsubChunk();
      unsubDone();
      unsubError();
    };
  }, []);

  const refreshDocuments = async () => {
    const docs = await window.electronAPI.listDocuments();
    setDocuments(docs);
    // Remove selected IDs that no longer exist
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
      if (!res.success) {
        alert(`Lỗi import ${fileName}: ${res.error}`);
      }

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
      // Refresh settings from backend to get canonical state
      const updated = await window.electronAPI.getSettings();
      setSettings(updated);
    },
    []
  );

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

      window.electronAPI.sendQuery(
        question,
        selectedDocIds,
        settings.semanticSearch
      );
    },
    [modelInfo.loaded, selectedDocIds, settings.semanticSearch]
  );

  const handleCancelQuery = () => {
    window.electronAPI.cancelQuery();
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (!last || last.role !== "assistant") return prev;
      return [
        ...prev.slice(0, -1),
        { ...last, content: last.content + "\n\n_[Đã dừng]_", isStreaming: false },
      ];
    });
    setIsQuerying(false);
  };

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

  const handleClearChat = () => {
    setMessages([]);
  };

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
          onImport={handleImportFiles}
          onDelete={handleDeleteDoc}
          onToggle={handleToggleDoc}
          onSelectAll={handleSelectAll}
          onSummarize={handleSummarize}
          onSettingChange={handleSettingChange}
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
