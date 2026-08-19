import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import DemoAnalyzer from "./pages/DemoAnalyzer";
import Exercises from "./pages/exercises";
import MapsUtility from "./pages/MapsUtility";
import Matches from "./pages/Matches";
import Progress from "./pages/Progress";
import RecoilLab from "./pages/RecoilLab";
import Settings from "./pages/Settings";
import { AuthProvider } from "./context/AuthContext";

function App() {
  return (
    <AuthProvider>
      <div className="flex min-h-screen bg-slate-950 text-white">
        <Sidebar />
        <main className="flex-1 overflow-auto p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/demo-analyzer" element={<DemoAnalyzer />} />
            <Route path="/matches" element={<Matches />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/clip-review" element={<Exercises />} />
            <Route path="/exercises" element={<Exercises />} />
            <Route path="/utility" element={<MapsUtility />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/recoil-lab" element={<RecoilLab />} />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  );
}

export default App;
