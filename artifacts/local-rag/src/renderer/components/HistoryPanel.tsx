import { useState } from "react";
import type { ChatSession, ChatHistoryMessage } from "../../shared/types";

interface Props {
  sessions: ChatSession[];
  onLoad: (messages: ChatHistoryMessage[], sessionTitle: string) => void;
  onDelete: (sessionId: number) => void;
  onDeleteAll: () => void;
  onExport: (sessionId: number, format: "md" | "txt") => void;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function groupByDate(sessions: ChatSession[]): Record<string, ChatSession[]> {
  const groups: Record<string, ChatSession[]> = {};
  for (const s of sessions) {
    try {
      const d = new Date(s.updatedAt);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let key: string;
      if (d.toDateString() === today.toDateString()) {
        key = "Hôm nay";
      } else if (d.toDateString() === yesterday.toDateString()) {
        key = "Hôm qua";
      } else {
        key = d.toLocaleDateString("vi-VN", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    } catch {
      if (!groups["Khác"]) groups["Khác"] = [];
      groups["Khác"].push(s);
    }
  }
  return groups;
}

export default function HistoryPanel({
  sessions,
  onLoad,
  onDelete,
  onDeleteAll,
  onExport,
}: Props) {
  const [expandedSession, setExpandedSession] = useState<number | null>(null);
  const [exportMenuId, setExportMenuId] = useState<number | null>(null);

  const grouped = groupByDate(sessions);

  if (sessions.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "32px 16px",
          color: "var(--color-text-muted)",
          fontSize: 13,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>🕐</div>
        <div style={{ fontWeight: 500, marginBottom: 4 }}>Chưa có lịch sử</div>
        <div style={{ fontSize: 12 }}>Các cuộc trò chuyện sẽ tự động lưu tại đây</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {/* Delete all */}
      <div
        style={{
          padding: "8px 14px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          justifyContent: "flex-end",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => {
            if (confirm("Xóa toàn bộ lịch sử hội thoại?")) onDeleteAll();
          }}
          style={{
            fontSize: 11,
            color: "var(--color-error)",
            background: "none",
            border: "1px solid var(--color-error)",
            borderRadius: 4,
            padding: "2px 8px",
            cursor: "pointer",
            opacity: 0.8,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
        >
          Xóa tất cả
        </button>
      </div>

      {/* Sessions grouped by date */}
      <div style={{ padding: "4px 0", flex: 1 }}>
        {Object.entries(grouped).map(([label, group]) => (
          <div key={label}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "var(--color-text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                padding: "10px 14px 4px",
              }}
            >
              {label}
            </div>
            {group.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isExpanded={expandedSession === session.id}
                showExportMenu={exportMenuId === session.id}
                onExpand={() =>
                  setExpandedSession((prev) =>
                    prev === session.id ? null : session.id
                  )
                }
                onLoad={() => {
                  window.electronAPI
                    .getSessionMessages(session.id)
                    .then((msgs) => onLoad(msgs, session.title));
                }}
                onDelete={() => {
                  if (confirm(`Xóa phiên "${session.title}"?`)) {
                    onDelete(session.id);
                    if (expandedSession === session.id) setExpandedSession(null);
                  }
                }}
                onToggleExportMenu={() =>
                  setExportMenuId((prev) =>
                    prev === session.id ? null : session.id
                  )
                }
                onExport={(fmt) => {
                  onExport(session.id, fmt);
                  setExportMenuId(null);
                }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionItem({
  session,
  onLoad,
  onDelete,
  onToggleExportMenu,
  onExport,
  showExportMenu,
}: {
  session: ChatSession;
  isExpanded: boolean;
  onExpand: () => void;
  onLoad: () => void;
  onDelete: () => void;
  onToggleExportMenu: () => void;
  onExport: (fmt: "md" | "txt") => void;
  showExportMenu: boolean;
}) {
  return (
    <div
      style={{
        padding: "8px 14px",
        borderLeft: "2px solid transparent",
        transition: "background 0.15s",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background =
          "rgba(124,58,237,0.06)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      {/* Title row */}
      <div
        style={{ display: "flex", alignItems: "flex-start", gap: 6 }}
        onClick={onLoad}
      >
        <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>💬</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              color: "var(--color-text)",
              fontWeight: 500,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={session.title}
          >
            {session.title}
          </div>
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-muted)",
              marginTop: 2,
            }}
          >
            {session.messageCount} tin · {formatDate(session.updatedAt)}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          gap: 5,
          marginTop: 6,
          position: "relative",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <SmallBtn label="Xem" color="var(--color-accent)" onClick={onLoad} />
        <div style={{ position: "relative" }}>
          <SmallBtn label="Xuất" color="#059669" onClick={onToggleExportMenu} />
          {showExportMenu && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                background: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: 6,
                zIndex: 50,
                minWidth: 110,
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                overflow: "hidden",
              }}
            >
              <ExportOption
                label="📝 Markdown (.md)"
                onClick={() => onExport("md")}
              />
              <ExportOption
                label="📄 Văn bản (.txt)"
                onClick={() => onExport("txt")}
              />
            </div>
          )}
        </div>
        <SmallBtn
          label="Xóa"
          color="var(--color-error)"
          onClick={onDelete}
        />
      </div>
    </div>
  );
}

function ExportOption({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "8px 12px",
        fontSize: 12,
        color: "var(--color-text)",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLDivElement).style.background =
          "rgba(124,58,237,0.1)")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLDivElement).style.background = "transparent")
      }
    >
      {label}
    </div>
  );
}

function SmallBtn({
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
