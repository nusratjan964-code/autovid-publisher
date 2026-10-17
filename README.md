# ⚡ OmniFlow AI — Automated Social Media Video Publisher

An automated, modern SaaS platform for content creators and brands to auto-publish short-form vertical videos (Reels, Shorts, TikTok) directly from **Google Drive** or local folders with **AI-generated captions** and **daily timing schedules**.

![OmniFlow AI Light Theme](https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80)

---

## 🚀 Key Features

- **👤 Creator Account & Authentication:** Clean, distraction-free sign-in and persistent local profile.
- **📁 Multi-Project Management:** Add and manage multiple projects/channels independently with distinct Google Drive folders, social channels, and schedules.
- **🌐 1-Click Social Media Connect:** One-click two-way integration with:
  - 📸 **Instagram Reels**
  - 🎥 **YouTube Shorts**
  - 🎵 **TikTok**
  - 📘 **Facebook Reels**
  - 💼 **LinkedIn Video**
  - 🐦 **X (Twitter)**
- **☁️ Google Drive & Local Folder Sync:**
  - Automated video scanner detecting `.mp4`, `.mov`, and `.webm` files.
  - Built-in error and empty folder alerts if no video files are detected.
  - Native video preview playback, duration extraction, and canvas thumbnail generation.
- **🤖 AI Caption & Hashtag Studio:**
  - Integrated support for **Google Gemini API** (`gemini-1.5-flash`) and **OpenAI API** (`gpt-4o-mini`).
  - Tone presets: Viral & High Energy, Educational, Storytelling, and Humorous.
  - Automated hook creation, caption body formatting, and trending hashtag generation.
  - Built-in smart client-side fallback generator.
- **📅 Daily Timing Scheduler:**
  - Set daily release time (e.g. `18:00` / 6:00 PM).
  - Daily cadence (1 video/day or 2 videos/day) with weekday filters.
  - Interactive calendar queue timeline.
  - Step-by-step automated dispatch simulator with confetti animations and live URL verification.
- **🎨 Premium White / Light Theme:** Designed with a modern, high-contrast SaaS aesthetic (Linear/Stripe style) and 100% English UI.

---

## 🛠️ Tech Stack

- **Core:** HTML5, Modern ES6+ JavaScript, CSS3 Design System
- **Icons:** [Lucide Icons](https://lucide.dev/)
- **Bundler / Dev Server:** [Vite](https://vitejs.dev/)
- **Animations & Effects:** Canvas Confetti

---

## 💻 Local Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/nusratjan964-code/autovid-publisher.git
   cd autovid-publisher
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open in browser:**
   ```text
   http://localhost:5173/
   ```

---

## 📦 Build for Production

```bash
npm run build
```
The production bundle will be output to the `dist/` folder.

---

## 📄 License
MIT License. Created for modern automated short-form video publishing.
