import { Routes, Route } from "react-router-dom";

import Sidebar from "./components/Sidebar";

import Dashboard from "./pages/Dashboard";
import DemoAnalyzer from "./pages/DemoAnalyzer";
import Exercises from "./pages/exercises";
import RecoilLab from "./pages/RecoilLab";

import { AuthProvider } from "./context/AuthContext";

function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-slate-950 text-white flex">
        <Sidebar />

        <main className="flex-1 p-8 overflow-auto">
          <Routes>
            <Route
              path="/"
              element={<Dashboard />}
            />

            <Route
              path="/demo-analyzer"
              element={<DemoAnalyzer />}
            />

            <Route
              path="/clip-review"
              element={<Exercises />}
            />

            <Route
              path="/exercises"
              element={<Exercises />}
            />

            <Route
              path="/recoil-lab"
              element={<RecoilLab />}
            />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  );
}

export default App;