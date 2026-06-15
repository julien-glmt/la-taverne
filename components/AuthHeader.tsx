"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function AuthHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      
      // Chercher le pseudo dans profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", session.user.id)
        .single();
      
      if (profile?.username) {
        setDisplayName(profile.username);
      } else {
        setDisplayName(
          session.user.user_metadata?.full_name ??
          session.user.user_metadata?.name ??
          session.user.email ??
          null
        );
      }
    }

    loadUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) { setDisplayName(null); return; }
      loadUser();
    });

    const heartbeat = setInterval(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await supabase.from("profiles")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", session.user.id);
  }, 5 * 60 * 1000);

  return () => {
    subscription.unsubscribe();
    clearInterval(heartbeat);
  };
  }, [pathname]); // recharge à chaque changement de page

  // Fermer le menu si on clique ailleurs
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setMenuOpen(false);
    router.push("/");
  }

  if (pathname === "/login" || pathname === "/register") return null;

  return (
    <div className="fixed top-0 right-0 z-50 p-4" ref={menuRef}>
      {displayName ? (
        <div className="relative">
          {/* Bouton compte */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 px-3 py-2 rounded-sm transition-all"
            style={{
              background: menuOpen ? "rgba(200,160,48,0.1)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${menuOpen ? "rgba(200,160,48,0.3)" : "rgba(255,255,255,0.06)"}`,
            }}>
            <span className="text-sm">👤</span>
            <span className="text-xs text-[#c8b888] max-w-[120px] truncate">{displayName}</span>
            <span className="text-[10px] text-[#4a3820]">{menuOpen ? "▲" : "▼"}</span>
          </button>

          {/* Menu déroulant */}
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-sm overflow-hidden"
              style={{ background: "#1e160a", border: "1px solid rgba(200,160,48,0.2)", boxShadow: "0 8px 24px rgba(0,0,0,0.6)" }}>
              
              <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <p className="text-xs text-[#4a3820]">Connecté en tant que</p>
                <p className="text-xs text-[#c8b888] truncate font-medium">{displayName}</p>
              </div>

              <button
                onClick={() => { setMenuOpen(false); router.push("/account"); }}
                className="w-full px-4 py-3 text-left text-xs text-[#c8b888] hover:text-[#c8a030] transition-colors flex items-center gap-2"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                ⚙️ Mon compte
              </button>

              <button
                onClick={handleLogout}
                className="w-full px-4 py-3 text-left text-xs text-[#c87050] hover:text-[#e87060] transition-colors flex items-center gap-2">
                🚪 Se déconnecter
              </button>
            </div>
          )}
        </div>
      ) : (
        <a href="/login"
          className="text-xs text-[#4a3820] hover:text-[#c8a030] transition-colors tracking-widest uppercase px-3 py-2 rounded-sm"
          style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          Connexion
        </a>
      )}
    </div>
  );
}
