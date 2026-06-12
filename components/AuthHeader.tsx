"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function AuthHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user?.email ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/");
  }

  // Cacher le header sur les pages auth
  if (pathname === "/login" || pathname === "/register") return null;

  return (
    <div className="fixed top-0 right-0 z-50 p-4 flex items-center gap-3">
      {email ? (
        <>
          <span className="text-xs text-[#4a3820] truncate max-w-[150px]">{email}</span>
          <button onClick={handleLogout}
            className="text-xs text-[#4a3820] hover:text-[#c87050] transition-colors tracking-widest uppercase">
            Déco
          </button>
        </>
      ) : (
        <a href="/login"
          className="text-xs text-[#4a3820] hover:text-[#c8a030] transition-colors tracking-widest uppercase">
          Connexion
        </a>
      )}
    </div>
  );
}
