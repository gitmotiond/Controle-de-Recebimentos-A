import { supabase } from "./lib/supabase";

export async function testarSupabase() {
  console.log("🔄 Testando conexão com Supabase...");

  const { data, error } = await supabase
    .from("lancamentos")
    .select("*")
    .limit(5);

  if (error) {
    console.error("❌ Erro ao conectar com Supabase:", error);
    return;
  }

  console.log("✅ Conexão com Supabase funcionando!");
  console.log("📦 Registros encontrados:", data);
}