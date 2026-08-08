import { useState } from "react";
import type { AppSettings, Document, ChatSession, ChatHistoryMessage } from "../../shared/types";
import SettingsPanel from "./SettingsPanel";
import HistoryPanel from "./HistoryPanel";

interface Props {
  documents: Document[];
  selectedDocIds: number[];
  importingFiles: Set<string>;
  settings: AppSettings;
  sessions: ChatSession[];
  onImport: () => void;
  onDelete: (id: number) => void;
  onToggle: (id: number) => void;
  onSelectAll: () => void;
  onSummarize: (doc: Document) => void;
  onSettingChange: (key: string, value: string) => Promise<void>;
  onLoadSession: (messages: ChatHistoryMessage[], title: string) => void;
  onDeleteSession: (sessionId: number) => void;
  onDeleteAllSessions: () => void;
  onExportSession: (sessionId: number, format: "md" | "txt") => void;
}

const FILE_ICONS: Record<string, string> = {
  pdf: "📄",
  docx: "📝",
  doc: "📝",
  xlsx: "📊",
  xls: "📊",
  txt: "📃",
  md: "📋",
  markdown: "📋",
  csv: "📊",
};

function fileIcon(type: string): string {
  return FILE_ICONS[type] ?? "📎";
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

type TabId = "docs" | "history";

export default function Sidebar({
  documents,
  selectedDocIds,
  importingFiles,
  settings,
  sessions,
  onImport,
  onDelete,
  onToggle,
  onSelectAll,
  onSummarize,
  onSettingChange,
  onLoadSession,
  onDeleteSession,
  onDeleteAllSessions,
  onExportSession,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("docs");
  const allSelected =
    documents.length > 0 && selectedDocIds.length === documents.length;

  return (
    <aside
      style={{
        width: 280,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border)",
        overflow: "hidden",
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        {(["docs", "history"] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              flex: 1,
              padding: "9px 0",
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              background: "none",
              cursor: "pointer",
              color:
                activeTab === tab
                  ? "var(--color-accent)"
                  : "var(--color-text-muted)",
              borderBottom:
                activeTab === tab
                  ? "2px solid var(--color-accent)"
                  : "2px solid transparent",
              transition: "all 0.15s",
              letterSpacing: "0.03em",
            }}
          >
            {tab === "docs" ? `📁 Tài liệu` : `🕐 Lịch sử`}
          </button>
        ))}
      </div>

      {/* Docs tab */}
      {activeTab === "docs" && (
        <>
          {/* Header */}
          <div
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--color-border)",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Tài liệu ({documents.length})
              </span>
              {documents.length > 0 && (
                <button
                  onClick={onSelectAll}
                  style={{
                    fontSize: 11,
                    color: "var(--color-accent)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "2px 4px",
                  }}
                >
                  {allSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </button>
              )}
            </div>

            {/* Import button */}
            <button
              onClick={onImport}
              disabled={importingFiles.size > 0}
              style={{
                width: "100%",
                padding: "8px 12px",
                background: "var(--color-accent)",
                color: "#fff",
                border: "none",
                borderRadius: 7,
                fontSize: 13,
                fontWeight: 500,
                cursor: importingFiles.size > 0 ? "not-allowed" : "pointer",
                opacity: importingFiles.size > 0 ? 0.7 : 1,
                transition: "opacity 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {importingFiles.size > 0 ? (
                <>
                  <Spinner />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <span>＋</span>
                  Import tài liệu
                </>
              )}
            </button>

            {/* Currently importing */}
            {importingFiles.size > 0 && (
              <div style={{ marginTop: 8 }}>
                {Array.from(importingFiles).map((name) => (
                  <div
                    key={name}
                    style={{
                      fontSize: 11,
                      color: "var(--color-text-muted)",
                      padding: "2px 0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    ⏳ {name}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Document list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {documents.length === 0 ? (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "var(--color-text-muted)",
                  fontSize: 13,
                }}
              >
                <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
                <div style={{ fontWeight: 500, marginBottom: 4 }}>
                  Chưa có tài liệu
                </div>
                <div style={{ fontSize: 12 }}>
                  Nhấn Import để thêm PDF, DOCX, TXT...
                </div>
              </div>
            ) : (
              documents.map((doc) => (
                <DocItem
                  key={doc.id}
                  doc={doc}
                  selected={selectedDocIds.includes(doc.id)}
                  onToggle={() => onToggle(doc.id)}
                  onDelete={() => onDelete(doc.id)}
                  onSummarize={() => onSummarize(doc)}
                />
              ))
            )}
          </div>

          {/* Active documents footer */}
          {selectedDocIds.length > 0 && (
            <div
              style={{
                padding: "8px 14px",
                borderTop: "1px solid var(--color-border)",
                fontSize: 12,
                color: "var(--color-accent)",
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              ✓ {selectedDocIds.length} tài liệu đang được dùng để chat
            </div>
          )}

          {/* Settings panel pinned at bottom */}
          <SettingsPanel settings={settings} onSettingChange={onSettingChange} />
        </>
      )}

      {/* History tab */}
      {activeTab === "history" && (
        <HistoryPanel
          sessions={sessions}
          onLoad={onLoadSession}
          onDelete={onDeleteSession}
          onDeleteAll={onDeleteAllSessions}
          onExport={onExportSession}
        />
      )}
    </aside>
  );
}

function DocItem({
  doc,
  selected,
  onToggle,
  onDelete,
  onSummarize,
}: {
  doc: Document;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onSummarize: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        padding: "8px 14px",
        gap: 8,
        background: selected ? "rgba(124,58,237,0.1)" : "transparent",
        borderLeft: selected
          ? "2px solid var(--color-accent)"
          : "2px solid transparent",
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onClick={onToggle}
    >
      {/* Checkbox */}
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: "2px solid",
          borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
          background: selected ? "var(--color-accent)" : "transparent",
          flexShrink: 0,
          marginTop: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
        }}
      >
        {selected && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path
              d="M1 3L3.5 5.5L8 1"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 2,
          }}
        >
          <span style={{ fontSize: 14 }}>{fileIcon(doc.fileType)}</span>
          <span
            style={{
              fontSize: 13,
              color: "var(--color-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontWeight: 500,
            }}
            title={doc.name}
          >
            {doc.name}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            display: "flex",
            gap: 8,
          }}
        >
          <span>{doc.chunkCount} đoạn</span>
          <span>{formatDate(doc.createdAt)}</span>
        </div>

        {/* Actions */}
        <div
          style={{ display: "flex", gap: 6, marginTop: 6 }}
          onClick={(e) => e.stopPropagation()}
        >
          <ActionBtn
            label="Tóm tắt"
            color="#7c3aed"
            onClick={onSummarize}
          />
          <ActionBtn
            label="Xóa"
            color="var(--color-error)"
            onClick={() => {
              if (confirm(`Xóa tài liệu "${doc.name}"?`)) onDelete();
            }}
          />
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  color,
  onClick,
}: {
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        color,
        background: "none",
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: "2px 8px",
        cursor: "pointer",
        opacity: 0.8,
        transition: "opacity 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
    >
      {label}
    </button>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 12,
        height: 12,
        border: "2px solid rgba(255,255,255,0.3)",
        borderTopColor: "#fff",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
      }}
    />
  );
}
