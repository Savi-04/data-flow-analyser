# React Repo X-Ray 🔮

A stunning 3D visualization tool that transforms React repositories into interactive cyberpunk constellations.

![React Repo X-Ray](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![Three.js](https://img.shields.io/badge/Three.js-R3F-purple?style=for-the-badge&logo=three.js)

## ✨ Features

- 🌌 **3D Force-Directed Graph**: Visualize your codebase as a floating hologram in space
- 🎨 **Cyberpunk Aesthetic**: Deep black backgrounds with neon purple/cyan accents
- 🔍 **Smart Code Analysis**: Automatically detects components, hooks, and utilities
- 💫 **Animated Particles**: Watch data flow through your dependency graph
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

### Optional: GitHub Token

For higher API rate limits, add a GitHub token:

```bash
# Create .env.local
GITHUB_TOKEN=your_github_token_here
```

## 🎮 How to Use

1. **Enter a GitHub URL** on the landing page (e.g., `facebook/react`)
2. **Wait for analysis** - the tool fetches and analyzes all React files
3. **Explore the 3D graph**:
   - 🔵 Blue spheres = Components
   - 🔴 Red spheres = Hooks
   - 🟢 Green spheres = Utils
   - Larger spheres = More connections
4. **Hover over nodes** to see tooltips
5. **Click nodes** to view detailed information and code
6. **Navigate** using mouse/trackpad to rotate and zoom

## 🛠️ Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **3D Graphics**: React Three Fiber, React Three Drei, Three.js
- **API**: Octokit (GitHub REST API)
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

The application follows a **Cyberpunk Void** aesthetic:

- **Colors**: Deep black (#050505) with neon purple (#bf00ff) and cyan (#00f3ff)
- **Effects**: Glassmorphism, glow effects, particle systems
- **Typography**: Clean, modern fonts with text shadows
- **Animations**: Smooth transitions and floating elements

## 🔧 How It Works

1. **GitHub API Integration**: Fetches repository file tree using Octokit
2. **Code Analysis**: Regex-based parsing to detect components, hooks, and dependencies
3. **Graph Generation**: Builds nodes and links based on import/export relationships
4. **Force-Directed Layout**: Positions nodes in 3D space using physics simulation
5. **WebGL Rendering**: React Three Fiber renders the scene with animations

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


