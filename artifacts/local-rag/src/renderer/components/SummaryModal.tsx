import type { Document } from "../../shared/types";

interface Props {
  doc: Document;
  summary: string;
  isLoading: boolean;
  onClose: () => void;
}

export default function SummaryModal({
  doc,
  summary,
  isLoading,
  onClose,
}: Props) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.6)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "min(680px, 90vw)",
          maxHeight: "80vh",
          background: "var(--color-surface)",
          borderRadius: 12,
          border: "1px solid var(--color-border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--color-text)",
              }}
            >
              📝 Tóm tắt tài liệu
            </div>
            <div
              style={{
                fontSize: 12,
                color: "var(--color-text-muted)",
                marginTop: 2,
              }}
            >
              {doc.name}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "var(--color-surface2)",
              border: "none",
              color: "var(--color-text-muted)",
              fontSize: 16,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          className="selectable"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
          }}
        >
          {isLoading ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px 20px",
                color: "var(--color-text-muted)",
                gap: 16,
              }}
            >
              <LoadingSpinner />
              <div style={{ fontSize: 14 }}>
                Đang tổng hợp tài liệu... (có thể mất vài phút)
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: "var(--color-text)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {summary}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && summary && (
          <div
            style={{
              padding: "12px 20px",
              borderTop: "1px solid var(--color-border)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => {
                navigator.clipboard.writeText(summary).catch(() => {});
              }}
              style={{
                padding: "7px 16px",
                background: "var(--color-surface2)",
                border: "1px solid var(--color-border)",
                borderRadius: 7,
                color: "var(--color-text)",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Sao chép
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "7px 16px",
                background: "var(--color-accent)",
                border: "none",
                borderRadius: 7,
                color: "#fff",
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div
      style={{
        width: 40,
        height: 40,
        border: "3px solid var(--color-border)",
        borderTopColor: "var(--color-accent)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    />
  );
}
