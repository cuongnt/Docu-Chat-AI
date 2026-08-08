import type { ModelInfo } from "../../shared/types";

interface Props {
  modelInfo: ModelInfo;
  onPick: () => void;
}

export default function ModelBadge({ modelInfo, onPick }: Props) {
  return (
    <button
      onClick={onPick}
      title={modelInfo.loaded ? `Mô hình: ${modelInfo.path}` : "Nhấn để chọn file mô hình GGUF"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 6,
        border: "1px solid",
        borderColor: modelInfo.loaded ? "var(--color-accent)" : "var(--color-border)",
        background: modelInfo.loaded ? "rgba(124,58,237,0.12)" : "var(--color-surface2)",
        color: modelInfo.loaded ? "#a78bfa" : "var(--color-text-muted)",
        fontSize: 12,
        cursor: "pointer",
        transition: "all 0.2s",
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: modelInfo.loaded ? "var(--color-success)" : "var(--color-text-muted)",
          flexShrink: 0,
        }}
      />
      {modelInfo.loaded ? modelInfo.name : "Chọn mô hình AI"}
    </button>
  );
}
