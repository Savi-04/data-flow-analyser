# React Repo X-Ray 🔮

A 3D visualization tool that transforms React repositories into an interactive dependency graph, with an optional AI agent that explores the codebase and surfaces architectural patterns.

![React Repo X-Ray](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![Three.js](https://img.shields.io/badge/Three.js-R3F-purple?style=for-the-badge&logo=three.js)

## ✨ Features

- 🌌 **3D Force-Directed Graph**: Visualize your codebase as an interactive graph, on a light, WCAG-compliant UI
- 🔍 **Smart Code Analysis**: Automatically detects components, hooks, and utilities
- 🧠 **Deep-Dive Agentic Insights (BETA)**: A Gemini-powered agent explores the repo under a file budget and detects architectural patterns (prop drilling, circular dependencies, god components, and more) — opt-in, off by default
- 🪟 **Glassmorphism UI**: Translucent panels with blur effects throughout
- 📊 **Interactive Details**: Click nodes to see code, stats, and metadata

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see the application.

### Environment Variables

Both are optional — the app works fully without either. Create a `.env.local` (see `.env.example`):

```bash
# Raises the unauthenticated GitHub rate limit and allows analyzing private
# repos you have access to. Create at https://github.com/settings/tokens
GITHUB_TOKEN=your_github_token_here

# Enables "Deep-Dive Agentic Insights" mode. Without it, Deep-Dive shows as
# disabled and Normal mode is unaffected. Create at
# https://aistudio.google.com/apikey. Server-side only — never sent to the
# client or logged.
GOOGLE_API_KEY=your_gemini_api_key_here
```

## 🎮 How to Use

1. **Enter a GitHub URL** on the landing page (e.g., `facebook/react`)
2. **Pick a mode**:
   - **Normal** — instant, deterministic analysis, no API quota used
   - **Deep-Dive Agentic Insights (BETA)** — a Gemini agent explores the repo under a file budget, then a deterministic pass detects architectural patterns and the model writes a summary. Requires `GOOGLE_API_KEY`.
3. **Wait for analysis** - the tool fetches and analyzes React files
4. **Explore the 3D graph**:
   - 🔵 Blue spheres = Components
   - 🔴 Red spheres = Hooks
   - 🟢 Green spheres = Utils
   - Larger spheres = More connections
5. **Hover over nodes** to see tooltips
6. **Click nodes** to view detailed information and code — including an **Insights** tab in Deep-Dive mode, showing detected patterns, the model's assessment, and an expandable trace of the agent's exploration decisions
7. **Navigate** using mouse/trackpad to rotate and zoom

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **3D Graphics**: React Three Fiber, React Three Drei, Three.js
- **API**: Octokit (GitHub REST API)
- **AI Agent**: Google Gemini (`@google/genai`), used only in Deep-Dive mode
- **Icons**: Lucide React
- **Syntax Highlighting**: react-syntax-highlighter

## 📁 Project Structure

```
data-flow-analyser/
├── app/
│   ├── globals.css          # Cyberpunk theme
│   └── page.tsx              # Main dashboard
├── components/
│   ├── 3d/                   # Three.js components
│   │   ├── ForceGraph.tsx
│   │   ├── GraphNode.tsx
│   │   └── GraphLink.tsx
│   └── ui/                   # UI components
│       ├── LandingPage.tsx
│       ├── ParticleField.tsx
│       ├── FileTree.tsx
│       └── ComponentDetail.tsx
├── lib/
│   ├── actions/              # Server actions
│   │   └── fetchRepoData.ts
│   └── utils/                # Utilities
│       └── analyzeCode.ts
└── types/
    └── index.ts              # TypeScript types
```

## 🎨 Design Philosophy

A light, accessible UI (WCAG 2.1 reflow-compliant, no horizontal scroll at any viewport width) with purple/cyan accents and glassmorphism panels — the 3D graph itself is the focal point, not the chrome around it.

## 🔧 How It Works

**Normal mode:**
1. **GitHub API Integration**: Fetches repository file tree using Octokit, with retries on transient failures
2. **Code Analysis**: Regex-based parsing to detect components, hooks, and dependencies
3. **Graph Generation**: Builds nodes and links based on import/export relationships
4. **Force-Directed Layout**: Positions nodes in 3D space using physics simulation
5. **WebGL Rendering**: React Three Fiber renders the scene with animations

**Deep-Dive mode adds:**
1. **Shallow scan**: a cheap, depth-limited tree fetch
2. **Agent-driven exploration**: Gemini receives the shallow tree and a `fetch_subtree` tool, and decides which directories are worth the remaining file budget — each decision and its reasoning is recorded and shown in the UI
3. **Pattern detection**: deterministic graph algorithms (not LLM-guessed) find prop drilling, circular dependencies, god components, orphaned modules, and deep hierarchies
4. **Synthesis**: the model returns a structured architectural assessment from the graph, state flow, and detected patterns

A failure in the agent or synthesis stage degrades to the Normal-mode result rather than failing the whole request.

## 🌟 Example Repositories to Try

- `facebook/react`
- `vercel/next.js`
- `remix-run/react-router`
- `chakra-ui/chakra-ui`
- `mui/material-ui`

## 📝 License

MIT

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- 3D graphics powered by [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- Icons from [Lucide](https://lucide.dev/)
- GitHub API via [Octokit](https://github.com/octokit/octokit.js)

---


