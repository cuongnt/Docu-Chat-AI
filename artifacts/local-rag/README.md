# DocChat AI — Ứng dụng Chat Tài liệu Offline

Ứng dụng desktop Windows cho phép bạn chat với tài liệu của mình bằng AI — **100% offline, không cần internet**.

## ✨ Tính năng

- 📄 **Import tài liệu**: PDF, DOCX, TXT, MD, XLSX, CSV
- 💬 **Chat với AI**: Hỏi bất kỳ câu hỏi nào về nội dung tài liệu
- 📝 **Tóm tắt tài liệu**: Tổng hợp nội dung nhanh chóng
- 🔍 **Tìm kiếm thông minh**: BM25 retrieval chọn đoạn liên quan nhất
- ⚡ **Streaming**: Câu trả lời hiển thị dần như ChatGPT
- 🔒 **Hoàn toàn offline**: Không gửi dữ liệu ra ngoài

---

## 🚀 Hướng dẫn Build trên Windows

### Yêu cầu hệ thống

| Thứ cần cài | Phiên bản | Link tải |
|---|---|---|
| **Node.js** | 20+ (LTS) | https://nodejs.org |
| **pnpm** | 9+ | `npm install -g pnpm` |
| **Python** | 3.x | https://www.python.org |
| **Visual Studio Build Tools** | 2019 hoặc 2022 | Xem bên dưới |
| **CMake** | 3.24+ | Tự động khi cài VS Build Tools |

### Cài Visual Studio Build Tools (bắt buộc cho native modules)

1. Tải [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. Chạy installer, chọn **"Desktop development with C++"**
3. Đảm bảo bao gồm: `MSVC`, `Windows SDK`, `CMake Tools`

### Tải mô hình AI (GGUF)

Bạn cần tải một file mô hình `.gguf` về máy. Các mô hình gợi ý:

| Mô hình | Kích thước | Yêu cầu RAM | Chất lượng | Link |
|---|---|---|---|---|
| **Phi-3 Mini 4K** | ~2.2GB | 4GB | ⭐⭐⭐ | [Hugging Face](https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf) |
| **Llama 3.2 3B** | ~2.0GB | 4GB | ⭐⭐⭐ | [Hugging Face](https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF) |
| **Mistral 7B** | ~4.1GB | 8GB | ⭐⭐⭐⭐ | [Hugging Face](https://huggingface.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF) |
| **Qwen2.5 7B** | ~4.7GB | 8GB | ⭐⭐⭐⭐ | [Hugging Face](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF) |

> 💡 Tải file có đuôi `Q4_K_M.gguf` để cân bằng chất lượng và tốc độ.

### Clone và build

```bash
# 1. Clone project
git clone <repo-url>
cd <repo-folder>

# 2. Cài dependencies từ thư mục gốc
pnpm install

# 3. Vào thư mục ứng dụng
cd artifacts/local-rag

# 4. Build toàn bộ ứng dụng
pnpm build

# 5. Đóng gói thành file .exe
pnpm dist
```

File cài đặt `.exe` sẽ xuất hiện trong thư mục `artifacts/local-rag/release/`.

### Build nhanh (chỉ xem thư mục, không nén)

```bash
pnpm dist:dir
```

Thư mục ứng dụng sẽ ở `artifacts/local-rag/release/win-unpacked/DocChat AI.exe`.

---

## 💻 Chạy ở chế độ phát triển (Development)

```bash
cd artifacts/local-rag

# Terminal 1: Khởi động renderer (React + Vite)
pnpm dev:renderer

# Terminal 2: Biên dịch main process
pnpm build:main && pnpm build:preload

# Terminal 3: Chạy Electron
npx electron .
```

---

## 🏗️ Kiến trúc

```
artifacts/local-rag/
├── src/
│   ├── main/              # Electron main process (Node.js)
│   │   ├── index.ts       # Khởi tạo app, đăng ký IPC handlers
│   │   ├── db.ts          # SQLite schema và queries
│   │   ├── llm.ts         # node-llama-cpp wrapper (inference)
│   │   ├── bm25.ts        # BM25 retrieval (100% offline)
│   │   ├── doc-parser.ts  # Đọc PDF, DOCX, TXT, XLSX
│   │   └── rag.ts         # RAG pipeline + summarization
│   ├── preload/
│   │   └── index.ts       # contextBridge (bảo mật IPC)
│   ├── renderer/          # React frontend
│   │   ├── App.tsx        # Component gốc
│   │   ├── components/
│   │   │   ├── Sidebar.tsx      # Danh sách tài liệu
│   │   │   ├── ChatPanel.tsx    # Giao diện chat
│   │   │   ├── ModelBadge.tsx   # Hiển thị model status
│   │   │   └── SummaryModal.tsx # Modal tóm tắt
│   │   └── index.css      # Tailwind CSS + animations
│   └── shared/
│       └── types.ts       # TypeScript types dùng chung
├── package.json
├── electron-builder.json5  # Cấu hình đóng gói .exe
├── vite.renderer.config.ts
├── vite.main.config.ts
└── vite.preload.config.ts
```

### Luồng hoạt động

```
[Người dùng chọn file] 
  → extractText() → chunkText() → lưu SQLite
  
[Người dùng gửi câu hỏi]
  → BM25 search top-6 chunks liên quan
  → Build prompt với context
  → node-llama-cpp stream tokens
  → IPC → React UI hiển thị dần

[Người dùng nhấn "Tóm tắt"]
  → Map-reduce: tóm tắt từng batch chunks
  → Gộp lại → LLM tổng hợp cuối cùng
```

### Tại sao dùng BM25 thay vì vector embeddings?

- ✅ **100% offline**: Không cần tải embedding model
- ✅ **Không cần internet lần đầu**: Hoạt động ngay sau khi cài
- ✅ **Nhanh hơn**: Không cần inference cho embedding
- ✅ **Ít RAM hơn**: Toàn bộ RAM dành cho LLM
- ⚠️ Trade-off: Độ chính xác hơi thấp hơn semantic embeddings với câu hỏi paraphrase

---

## 🔧 Tùy chỉnh

### Thay đổi số lượng chunks tìm kiếm

Mở `src/main/rag.ts`, thay `topK = 6` thành giá trị khác:
```typescript
const relevant = search(question, corpus, 8); // Lấy 8 chunks thay vì 6
```

### Thay đổi kích thước chunk

Mở `src/main/doc-parser.ts`:
```typescript
// Mặc định: 400 words/chunk, overlap 50 words
export function chunkText(text, targetWords = 400, overlapWords = 50)
```

### Thay đổi context size của LLM

Mở `src/main/llm.ts`:
```typescript
modelContext = await loadedModel.createContext({ contextSize: 8192 }); // Tăng lên 8K
```

---

## ❓ Troubleshooting

### Lỗi "Cannot find module 'better-sqlite3'"
```bash
# Rebuild native modules cho Electron
npx electron-rebuild -f -w better-sqlite3
```

### Lỗi CMake / node-gyp khi build node-llama-cpp
- Đảm bảo đã cài **Visual Studio Build Tools 2019/2022** với **C++ workload**
- Đảm bảo **Python 3.x** đã cài và trong PATH
- Chạy lại: `pnpm install --force`

### App mở nhưng trắng màn hình
- Kiểm tra: `dist/renderer/index.html` có tồn tại không
- Chạy lại: `pnpm build`

### Mô hình tải chậm / báo lỗi RAM
- Thử mô hình nhỏ hơn (Phi-3 mini thay vì Mistral 7B)
- Đóng các ứng dụng khác để giải phóng RAM

---

## 📋 Định dạng tài liệu hỗ trợ

| Định dạng | Mô tả |
|---|---|
| `.pdf` | PDF thông thường (có text layer) |
| `.docx`, `.doc` | Microsoft Word |
| `.xlsx`, `.xls` | Microsoft Excel (tất cả sheets) |
| `.txt` | Văn bản thuần |
| `.md`, `.markdown` | Markdown |
| `.csv` | CSV |

> ⚠️ PDF scan (ảnh chụp tài liệu) không được hỗ trợ — cần OCR riêng.
