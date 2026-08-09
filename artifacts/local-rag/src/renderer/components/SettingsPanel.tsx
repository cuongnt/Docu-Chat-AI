import { useEffect, useRef, useState } from "react";
import type {
  AppSettings,
  EmbeddingProgress,
  EmbeddingStatusInfo,
} from "../../shared/types";

interface Props {
  settings: AppSettings;
  onSettingChange: (key: string, value: string) => Promise<void>;
}

export default function SettingsPanel({ settings, onSettingChange }: Props) {
  const [embStatus, setEmbStatus] = useState<EmbeddingStatusInfo>({
    status: "idle",
    modelPath: null,
    modelName: null,
    error: "",
  });
  const [reembedProgress, setReembedProgress] =
    useState<EmbeddingProgress | null>(null);
  const [isReembedding, setIsReembedding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load initial embedding status
  useEffect(() => {
    window.electronAPI.getEmbeddingStatus().then(setEmbStatus);
  }, []);

  // Poll while loading
  useEffect(() => {
    if (embStatus.status === "loading") {
      pollRef.current = setInterval(async () => {
        const s = await window.electronAPI.getEmbeddingStatus();
        setEmbStatus(s);
        if (s.status !== "loading") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 800);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [embStatus.status]);

  // Listen for re-embed progress events
  useEffect(() => {
    const unsub = window.electronAPI.onEmbeddingProgress((p) => {
      setReembedProgress(p);
    });
    return unsub;
  }, []);

  const handlePickEmbeddingModel = async () => {
    const result = await window.electronAPI.pickEmbeddingModel();
    if (result.canceled || !result.filePath) return;

    setIsLoading(true);
    const res = await window.electronAPI.loadEmbeddingModel(result.filePath);
    setIsLoading(false);

    const s = await window.electronAPI.getEmbeddingStatus();
    setEmbStatus(s);

    // If binary not found or model failed, auto-disable semantic search so
    // the user can still use the app with BM25 search.
    if (!res.success) {
      onSettingChange("semanticSearch", "false");
    }
  };

  const handleUnload = async () => {
    await window.electronAPI.unloadEmbeddingModel();
    const s = await window.electronAPI.getEmbeddingStatus();
    setEmbStatus(s);
  };

  const handleReembed = async () => {
    setIsReembedding(true);
    setReembedProgress({ done: 0, total: 0, pct: 0 });
    await window.electronAPI.reembedAll();
    setIsReembedding(false);
    setReembedProgress(null);
  };

  return (
    <div
      style={{
        padding: "12px 14px",
        borderTop: "1px solid var(--color-border)",
        flexShrink: 0,
      }}
    >
      {/* Section header */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 10,
        }}
      >
        ⚙️ Cài đặt
      </div>

      {/* Semantic search toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{ fontSize: 12, color: "var(--color-text)", fontWeight: 500 }}
          >
            Tìm kiếm ngữ nghĩa
          </div>
          <div
            style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}
          >
            Hiểu paraphrase, từ đồng nghĩa
          </div>
        </div>
        <Toggle
          checked={settings.semanticSearch}
          onChange={(v) => onSettingChange("semanticSearch", v ? "true" : "false")}
        />
      </div>

      {/* Embedding model panel — shown when semantic search is enabled */}
      {settings.semanticSearch && (
        <div
          style={{
            background: "rgba(124,58,237,0.07)",
            border: "1px solid rgba(124,58,237,0.2)",
            borderRadius: 7,
            padding: "8px 10px",
            fontSize: 11,
            marginTop: 4,
          }}
        >
          <EmbStatusRow status={embStatus} isLoading={isLoading} />

          {/* Actions */}
          {embStatus.status !== "error" && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {embStatus.status !== "loading" && !isLoading && (
                <button
                  onClick={handlePickEmbeddingModel}
                  style={actionBtnStyle("var(--color-accent)")}
                  title="Chọn file GGUF embedding (ví dụ: nomic-embed-text, all-minilm)"
                >
                  {embStatus.status === "ready" ? "🔄 Đổi model" : "📂 Chọn model embedding"}
                </button>
              )}

              {embStatus.status === "ready" && (
                <>
                  {isReembedding ? (
                    <div style={{ color: "var(--color-text-muted)", width: "100%" }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginBottom: 4,
                        }}
                      >
                        <MiniSpinner />
                        <span>
                          Đang tạo embedding... ({reembedProgress?.done ?? 0}/
                          {reembedProgress?.total ?? "?"})
                        </span>
                      </div>
                      <ProgressBar pct={reembedProgress?.pct ?? 0} />
                    </div>
                  ) : (
                    <button
                      onClick={handleReembed}
                      style={actionBtnStyle("var(--color-accent)")}
                      title="Tạo lại embedding cho tất cả tài liệu"
                    >
                      ✦ Tạo embedding tài liệu cũ
                    </button>
                  )}
                  <button
                    onClick={handleUnload}
                    style={actionBtnStyle("var(--color-error)")}
                    title="Bỏ tải mô hình embedding"
                  >
                    Bỏ tải
                  </button>
                </>
              )}
            </div>
          )}

          <div
            style={{
              fontSize: 10,
              color: "var(--color-text-muted)",
              marginTop: 6,
            }}
          >
            {embStatus.status === "error"
              ? "⚠ Không thể tải mô hình — tính năng này đã tắt. App vẫn hoạt động bình thường với tìm kiếm BM25."
              : "Dùng file GGUF embedding: nomic-embed-text, all-minilm, mxbai-embed..."}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmbStatusRow({
  status,
  isLoading,
}: {
  status: EmbeddingStatusInfo;
  isLoading: boolean;
}) {
  if (isLoading || status.status === "loading") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--color-text-muted)",
        }}
      >
        <MiniSpinner />
        <span>Đang tải mô hình embedding...</span>
      </div>
    );
  }
  if (status.status === "idle") {
    return (
      <div style={{ color: "var(--color-text-muted)" }}>
        ⏸ Chưa có mô hình embedding — chọn file GGUF để bắt đầu
      </div>
    );
  }
  if (status.status === "ready") {
    return (
      <div style={{ color: "#22c55e" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span>✓</span>
          <span>Sẵn sàng — tìm kiếm ngữ nghĩa đang hoạt động</span>
        </div>
        {status.modelName && (
          <div
            style={{
              fontSize: 10,
              color: "var(--color-text-muted)",
              marginTop: 2,
            }}
          >
            {status.modelName}
          </div>
        )}
      </div>
    );
  }
  if (status.status === "error") {
    return (
      <div style={{ color: "var(--color-error)" }}>
        <div>⚠ Lỗi tải mô hình</div>
        {status.error && (
          <div style={{ fontSize: 10, marginTop: 3, opacity: 0.8, wordBreak: "break-all" }}>
            {status.error}
          </div>
        )}
      </div>
    );
  }
  return null;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 22,
        borderRadius: 11,
        background: checked ? "var(--color-accent)" : "var(--color-border)",
        border: "none",
        cursor: "pointer",
        position: "relative",
        flexShrink: 0,
        transition: "background 0.2s",
        padding: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 19 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }}
      />
    </button>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div
      style={{
        height: 4,
        background: "var(--color-border)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(100, Math.max(0, pct))}%`,
          background: "var(--color-accent)",
          borderRadius: 2,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

function MiniSpinner() {
  return (
    <div
      style={{
        width: 10,
        height: 10,
        border: "1.5px solid var(--color-border)",
        borderTopColor: "var(--color-accent)",
        borderRadius: "50%",
        animation: "spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

function actionBtnStyle(color: string): React.CSSProperties {
  return {
    fontSize: 11,
    color,
    background: "none",
    border: `1px solid ${color}`,
    borderRadius: 4,
    padding: "3px 8px",
    cursor: "pointer",
    opacity: 0.85,
    whiteSpace: "nowrap",
  };
}
