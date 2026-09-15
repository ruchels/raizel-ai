# RAIZEL AI ⚡
> *"Your AI. Your Ideas. Your Power."*

A modern, high-performance, dark-futuristic AI chat web application powered by the **Rindri API Gateway** (`https://api.rindri.com`). Built with Next.js 16 (App Router), React 19, TypeScript, and Tailwind CSS.

---

## ✨ Features

- **Futuristic Dark Minimalism**: Curated deep obsidian palette, glassmorphism blur panels, subtle borders, and smooth micro-interactions.
- **Multi-Model Provider Switching**: Seamlessly toggle between top-tier AI engines directly from the header dropdown:
  - **Claude Opus**: `claude-opus-5` *(Default)*, `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-opus-4-5`
  - **Claude Sonnet**: `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-sonnet-4-5`
  - **Claude Haiku**: `claude-haiku-4-5`
  - **Grok**: `grok-4.6`, `grok-4.5`, `grok4-3`
  - **DeepSeek**: `deepseek-v4-pro`, `deepseek-v4-flash`
  - **Kimi**: `kimi-k3`, `kimi-k2.7-code`
  - **GLM**: `glm-5.3`
- **Zero Secret Exposure**: The `RINDRI_API_KEY` is strictly preserved on the server-side Next.js route handler (`/api/chat`). Keys are never sent to or visible in client browsers.
- **Rich File Attachments & Multimodal Vision**:
  - 📷 **Images**: Upload photos (PNG, JPG, WEBP, GIF) with thumbnail previews and real-time multimodal vision inspection by Claude models.
  - 📦 **ZIP Archives**: Automatically extracts directory trees and readable text/code files using `jszip` so RAIZEL AI can analyze full project repositories.
  - 📄 **Code & Documents**: Attach `.py`, `.js`, `.ts`, `.tsx`, `.json`, `.sql`, `.html`, `.css`, etc.
- **Claude AI-Style Auto-Collapse on Paste**:
  - When copying and pasting large snippets of code or text (> 800 characters or > 20 lines), RAIZEL AI automatically condenses them into an interactive attached snippet pill (`📄 pasted_content.tsx`), keeping your input box clean and comfortable just like on Claude.ai! Includes one-click preview modal and deletion.
- **Local Chat History**: Persistent conversations stored in `localStorage` categorized by *Today*, *Yesterday*, *Previous 7 Days*, and *Older*. Includes inline chat renaming, search, and deletion.
- **Interactive Welcome Screen**: Quick-start prompts for web development, Python scripting, cybersecurity, academic homework, and project architecture.
- **Responsive Layout**: Seamless on both desktop and mobile devices with a slide-out drawer on small screens and virtual-keyboard-safe floating chat input.
- **User Settings**: Configurable theme mode (Dark / Light / System), Enter-to-send toggle, message timestamps toggle, default model selector, and clear-history controls.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) (App Router & Turbopack)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **UI Library**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **AI SDK**: [OpenAI SDK](https://www.npmjs.com/package/openai) (configured for Rindri OpenAI-compatible gateway)
- **Markdown & Code**: `react-markdown`, `remark-gfm`, `rehype-highlight`

---

## 🚀 Getting Started

### 1. Clone & Install Dependencies

```bash
git clone <your-repo-url>
cd raizel-ai
npm install
```

### 2. Configure Environment Variables

Create your local `.env.local` file from the provided example template:

```bash
cp .env.example .env.local
```

Open `.env.local` and add your Rindri API key:

```env
# Server-side Rindri API Key (NEVER committed to git)
RINDRI_API_KEY=your_actual_rindri_api_key_here

# Rindri Gateway Base URL (default is https://api.rindri.com)
RINDRI_BASE_URL=https://api.rindri.com
```

> **Note**: `RINDRI_BASE_URL` automatically routes through `/v1` endpoints (e.g. `https://api.rindri.com/v1`). If your gateway URL changes in the future, simply update this variable.

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔒 Security Architecture

1. **Server-Side Proxy**: All communications to `https://api.rindri.com` happen strictly inside `app/api/chat/route.ts`.
2. **Model Whitelist**: Incoming model IDs are validated against a strict server whitelist (`lib/models.ts`) before being dispatched to the gateway.
3. **Safe Error Mapping**: If the AI provider returns a rate limit (429), authentication error (401), or bad request (400), user-friendly messages are returned without exposing server internals or tokens.

---

## 🚢 Vercel Deployment Guide

Deploying RAIZEL AI to Vercel takes less than two minutes:

1. **Push to GitHub**:
   Ensure `.env.local` is ignored (already configured in `.gitignore`) and push your code:
   ```bash
   git init
   git add .
   git commit -m "feat: initial RAIZEL AI commit"
   git branch -M main
   git remote add origin https://github.com/your-username/raizel-ai.git
   git push -u origin main
   ```

2. **Import to Vercel**:
   - Go to [vercel.com](https://vercel.com) and log in.
   - Click **Add New...** &rarr; **Project**.
   - Select your `raizel-ai` repository from GitHub.

3. **Configure Environment Variables**:
   In the Vercel project configuration screen, add the following Environment Variables under **Environment Variables**:
   - `RINDRI_API_KEY`: Your Rindri API secret key.
   - `RINDRI_BASE_URL`: `https://api.rindri.com`

4. **Deploy**:
   - Click **Deploy**.
   - Once completed, your RAIZEL AI web app is live with high-speed Edge delivery worldwide!

---

## 📜 License

MIT License &copy; 2026 RAIZEL AI. Powered by Rindri AI Gateway.
