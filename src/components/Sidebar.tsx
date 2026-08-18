import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Sidebar() {
  const { user, login, logout } =
    useAuth();

  const navItems = [
    {
      name: "Dashboard",
      path: "/",
      icon: "🏠",
    },
    {
      name: "Demo Analyzer",
      path: "/demo-analyzer",
      icon: "🎥",
    },
    {
      name: "Matches",
      path: "/matches",
      icon: "🏆",
    },
    {
      name: "Progress",
      path: "/progress",
      icon: "📈",
    },
    {
      name: "Exercises",
      path: "/exercises",
      icon: "🎯",
    },
    {
      name: "Maps & Utility",
      path: "/utility",
      icon: "🗺️",
    },
    {
      name: "Settings",
      path: "/settings",
      icon: "⚙️",
    },
  ];

  const displayName =
    user?.displayName || "Guest";

  const email =
    user?.email || "Ikke innlogget";

  const avatar =
    displayName.charAt(0).toUpperCase();

  return (
    <aside className="flex h-screen w-[260px] flex-col border-r border-[#182538] bg-[#08111f]">
      <div className="border-b border-[#182538] p-6">
        <div className="flex items-center gap-3">
          <div className="text-5xl text-orange-500">
            🎯
          </div>

          <div>
            <div className="text-3xl font-black tracking-tight text-white">
              CS2
            </div>

            <div className="text-xl font-black text-orange-500">
              COACH LAB
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4">
        <nav className="space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3 transition ${
                  isActive
                    ? "border-l-4 border-orange-500 bg-[#131d30] text-orange-400"
                    : "text-slate-300 hover:bg-[#121b2c]"
                }`
              }
            >
              <span className="text-lg">
                {item.icon}
              </span>

              <span className="font-medium">
                {item.name}
              </span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="m-4 rounded-2xl border border-[#1a2740] bg-[#0d1728] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1d2c44] font-bold text-white">
            {avatar}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-white">
              {displayName}
            </p>

            <p className="truncate text-sm text-slate-400">
              {email}
            </p>
          </div>
        </div>

        {!user ? (
          <button
            onClick={login}
            className="mt-4 w-full rounded-xl border border-orange-500 py-2 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
          >
            Logg inn med Google
          </button>
        ) : (
          <button
            onClick={logout}
            className="mt-4 w-full rounded-xl border border-[#263754] py-2 text-sm text-slate-300 transition hover:bg-[#15253a]"
          >
            Logg ut
          </button>
        )}
      </div>
    </aside>
  );
}