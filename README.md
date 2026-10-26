# 🎮 Quiz Battle Arena

A real-time multiplayer quiz game where players can compete with friends across separate devices.

🌐 **Live Demo:** https://quizbattlearena.vercel.app

## ✨ Features

- 🎯 Real-time multiplayer quiz battles
- 📱 Play across separate devices
- 🧠 Multiple-choice quiz questions
- ⏱️ Timed quiz rounds
- 🏆 Score tracking and results screen
- 🎨 Dark neon gaming interface
- 🔄 Random question selection for new matches

## 🛠️ Tech Stack

- **Frontend:** React, Vite, JavaScript
- **Backend and Database:** Supabase
- **Deployment:** Vercel
- **Version Control:** Git and GitHub

## 🚀 Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/Shambhavi2306/quiz_battle_arena.git
cd quiz_battle_arena
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root and add your Supabase project URL and public anon/publishable key:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_public_key
```

Use the variable names expected by the project code. Never add a Supabase service-role key, database password, or other secret to the frontend.

### 4. Start the development server

```bash
npm run dev
```

Open the local URL printed in your terminal.

## 🎮 How to Play

1. Open the game.
2. Create a quiz room.
3. Share the room code with another player.
4. Join from a separate device.
5. Answer the questions and compare scores on the results screen.

## 🔐 Security

This project uses Supabase for multiplayer functionality. Database policies, answer confidentiality, and server-side validation should be reviewed before production use.

## 👩‍💻 Author

**Shambhavi Rai**

GitHub: [@Shambhavi2306](https://github.com/Shambhavi2306)

---

*Built as a multiplayer web development project.*
