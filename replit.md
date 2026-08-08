# DocChat AI

Ứng dụng desktop Windows chạy hoàn toàn offline — cho phép người dùng import tài liệu (PDF, DOCX, TXT, XLSX) và chat với AI trong phạm vi nội dung tài liệu đó, không cần kết nối internet.

## Run & Operate

**Quan trọng:** Đây là Electron desktop app — không chạy được trên Replit. Phải clone và build trên **Windows**.

- `pnpm --filter @workspace/local-rag run typecheck` — kiểm tra TypeScript (chạy được trên Replit)
- Trên Windows: `cd artifacts/local-rag && pnpm install && pnpm dist` — build file .exe

## Stack

- pnpm workspaces, Node.js 20+, TypeScript 5.9
- Desktop: Electron 33 + React 19 + Vite 7
- AI inference: node-llama-cpp v3 (chạy file GGUF local)
- Retrieval: BM25 (100% offline, pure JS)
- Storage: better-sqlite3 (SQLite local)
- Doc parsing: pdf-parse, mammoth, xlsx
- UI: Tailwind CSS v4 (dark theme)

## Where things live

- `artifacts/local-rag/` — toàn bộ Electron app
  - `src/main/` — Electron main process (Node.js)
  - `src/preload/` — contextBridge security layer
  - `src/renderer/` — React frontend
  - `src/shared/types.ts` — TypeScript types dùng chung
  - `README.md` — hướng dẫn build Windows đầy đủ

## Architecture decisions

- **BM25 thay vì vector embeddings**: 100% offline không cần tải embedding model, nhanh hơn, tiết kiệm RAM cho LLM
- **CommonJS cho main process**: Tương thích tốt hơn với native modules (better-sqlite3, node-llama-cpp)
- **dynamic import() cho native modules**: Tránh lỗi khởi động, load lazy khi cần
- **Streaming qua IPC events**: Dùng `ipcRenderer.on('chat:chunk')` pattern thay vì invoke để stream tokens
- **asarUnpack cho native modules**: electron-builder cần unpack better-sqlite3 và node-llama-cpp khỏi asar archive

## User preferences

- Giao diện và UI text hoàn toàn bằng tiếng Việt
- Dark theme (màu nền #1a1b1e, accent tím #7c3aed)

## Gotchas

- `electron-builder` không thể install trên Replit (dependency `tar` bị firewall chặn) — phải cài trên Windows
- `node-llama-cpp` cần Visual Studio Build Tools 2019/2022 với C++ workload để biên dịch
- `minimumReleaseAge: 1440` trong pnpm-workspace.yaml có thể chặn package mới — dùng version ổn định

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
