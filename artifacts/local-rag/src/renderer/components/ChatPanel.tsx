import { useRef, useEffect, useState } from "react";
import type { ChatMessage } from "../../shared/types";

interface Props {
  messages: ChatMessage[];
  isQuerying: boolean;
  selectedDocCount: number;
  modelLoaded: boolean;
  onSend: (question: string) => void;
  onCancel: () => void;
  onClear: () => void;
}

export default function ChatPanel({
  messages,
  isQuerying,
  selectedDocCount,
  modelLoaded,
  onSend,
  onCancel,
  onClear,
}: Props) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const q = input.trim();
    if (!q || isQuerying) return;
    setInput("");
    onSend(q);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = !isQuerying && modelLoaded && selectedDocCount > 0;
  const placeholder = !modelLoaded
    ? "Vui lòng chọn mô hình AI trước..."
    : selectedDocCount === 0
    ? "Vui lòng chọn tài liệu trong sidebar..."
    : "Hỏi về nội dung tài liệu... (Enter để gửi)";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--color-bg)",
      }}
    >
      {/* Chat header */}
      <div
        style={{
          padding: "10px 20px",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
          {selectedDocCount > 0
            ? `💬 Chat với ${selectedDocCount} tài liệu`
            : "💬 Hội thoại"}
        </div>
        {messages.length > 0 && (
          <button
            onClick={onClear}
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              background: "none",
              border: "1px solid var(--color-border)",
              borderRadius: 5,
              padding: "3px 10px",
              cursor: "pointer",
            }}
          >
            Xóa hội thoại
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        className="selectable"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {messages.length === 0 ? (
          <EmptyState modelLoaded={modelLoaded} selectedDocCount={selectedDocCount} />
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: "14px 20px",
          borderTop: "1px solid var(--color-border)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            background: "var(--color-surface)",
            borderRadius: 10,
            border: "1px solid var(--color-border)",
            padding: "8px 12px",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={!canSend && !isQuerying}
            rows={1}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--color-text)",
              fontSize: 14,
              resize: "none",
              maxHeight: 120,
              fontFamily: "inherit",
              lineHeight: 1.5,
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = Math.min(target.scrollHeight, 120) + "px";
            }}
          />

          {isQuerying ? (
            <button
              onClick={onCancel}
              style={{
                alignSelf: "flex-end",
                padding: "6px 14px",
                background: "var(--color-error)",
                color: "#fff",
                border: "none",
                borderRadius: 7,
                fontSize: 13,
                cursor: "pointer",
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              Dừng
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend || !input.trim()}
              style={{
                alignSelf: "flex-end",
                padding: "6px 16px",
                background:
                  canSend && input.trim()
                    ? "var(--color-accent)"
                    : "var(--color-surface2)",
                color:
                  canSend && input.trim() ? "#fff" : "var(--color-text-muted)",
                border: "none",
                borderRadius: 7,
                fontSize: 13,
                cursor: canSend && input.trim() ? "pointer" : "not-allowed",
                fontWeight: 500,
                flexShrink: 0,
                transition: "all 0.15s",
              }}
            >
              Gửi ↑
            </button>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--color-text-muted)",
            marginTop: 6,
            paddingLeft: 2,
          }}
        >
          Enter để gửi · Shift+Enter xuống dòng
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          🤖
        </div>
      )}

      <div style={{ maxWidth: "75%", minWidth: 0 }}>
        <div
          style={{
            padding: "10px 14px",
            borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            background: isUser
              ? "linear-gradient(135deg, #7c3aed, #6d28d9)"
              : "var(--color-surface)",
            color: "var(--color-text)",
            fontSize: 14,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            border: isUser ? "none" : "1px solid var(--color-border)",
            position: "relative",
          }}
        >
          {message.content || (
            <span
              style={{
                display: "inline-flex",
                gap: 4,
                alignItems: "center",
                color: "var(--color-text-muted)",
              }}
            >
              <TypingDots />
            </span>
          )}
          {message.isStreaming && message.content && (
            <span
              style={{
                display: "inline-block",
                width: 2,
                height: 14,
                background: "var(--color-accent)",
                marginLeft: 2,
                animation: "blink 1s step-end infinite",
                verticalAlign: "middle",
              }}
            />
          )}
        </div>

        {/* Sources */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: "var(--color-text-muted)",
              padding: "0 4px",
            }}
          >
            📎 Từ: {message.sources.slice(0, 3).join(", ")}
            {message.sources.length > 3 && ` và ${message.sources.length - 3} đoạn khác`}
          </div>
        )}
      </div>

      {isUser && (
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "var(--color-surface2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          👤
        </div>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--color-text-muted)",
            display: "inline-block",
            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </>
  );
}

function EmptyState({
  modelLoaded,
  selectedDocCount,
}: {
  modelLoaded: boolean;
  selectedDocCount: number;
}) {
  const steps = [
    {
      done: modelLoaded,
      icon: "🤖",
      text: "Chọn mô hình AI (file .gguf)",
    },
    {
      done: selectedDocCount > 0,
      icon: "📄",
      text: "Import và chọn tài liệu trong sidebar",
    },
    {
      done: false,
      icon: "💬",
      text: "Bắt đầu đặt câu hỏi!",
    },
  ];

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 40,
        color: "var(--color-text-muted)",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 20 }}>✨</div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 600,
          color: "var(--color-text)",
          marginBottom: 8,
        }}
      >
        Chat với tài liệu của bạn
      </div>
      <div style={{ fontSize: 14, marginBottom: 28, maxWidth: 360 }}>
        AI sẽ trả lời dựa trên nội dung tài liệu bạn cung cấp — 100% offline
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          textAlign: "left",
          width: "100%",
          maxWidth: 320,
        }}
      >
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 14px",
              borderRadius: 8,
              background: step.done
                ? "rgba(16,185,129,0.1)"
                : "var(--color-surface)",
              border: "1px solid",
              borderColor: step.done
                ? "rgba(16,185,129,0.3)"
                : "var(--color-border)",
            }}
          >
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: step.done
                  ? "var(--color-success)"
                  : "var(--color-surface2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                flexShrink: 0,
                color: step.done ? "#fff" : "var(--color-text-muted)",
                fontWeight: 700,
              }}
            >
              {step.done ? "✓" : i + 1}
            </span>
            <span style={{ fontSize: 13 }}>
              {step.icon} {step.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
