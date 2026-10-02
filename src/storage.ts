import { useEffect, useState } from "react";
import type { Lancamento } from "./types";
import { supabase } from "./lib/supabase";

const KEY = "controle-faltas-sobras-v1";

export function carregar(): Lancamento[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Lancamento[];
  } catch {
    return [];
  }
}

export function salvar(dados: Lancamento[]) {
  localStorage.setItem(KEY, JSON.stringify(dados));
}


export function useLancamentos() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(() => carregar());

  const [carregamentoInicial, setCarregamentoInicial] = useState(false);

  // Salva localmente
  useEffect(() => {
    salvar(lancamentos);
  }, [lancamentos]);

  // =====================================================
  // 1. AO ABRIR O APP, BUSCA OS DADOS DO SUPABASE
  // =====================================================
  useEffect(() => {
    async function carregarDoSupabase() {
      try {
        console.log("☁️ Buscando lançamentos no Supabase...");

        const { data, error } = await supabase
          .from("lancamentos")
          .select("*")
          .order("updated_at", { ascending: false });

        if (error) {
          console.error(
            "❌ Erro ao buscar Supabase:",
            error
          );

          setCarregamentoInicial(true);
          return;
        }

        if (data && data.length > 0) {
          const dadosSupabase = data
            .map((registro) => registro.dados as Lancamento)
            .filter(Boolean);

          console.log(
            "✅ Lançamentos recebidos do Supabase:",
            dadosSupabase.length
          );

          setLancamentos(dadosSupabase);
        } else {
          console.log(
            "ℹ️ Supabase está vazio. Mantendo dados locais."
          );
        }

        setCarregamentoInicial(true);
      } catch (erro) {
        console.error(
          "❌ Erro inesperado ao carregar Supabase:",
          erro
        );

        setCarregamentoInicial(true);
      }
    }

    carregarDoSupabase();
  }, []);

  // =====================================================
  // 2. QUANDO ALTERAR UM LANÇAMENTO, ENVIA PARA SUPABASE
  // =====================================================
  useEffect(() => {
    if (!carregamentoInicial) {
      return;
    }

    async function sincronizarComSupabase() {
      try {
        if (lancamentos.length === 0) {
          return;
        }

        const registros = lancamentos.map((lancamento) => ({
          id: lancamento.id,
          dados: lancamento,
          updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from("lancamentos")
          .upsert(registros);

        if (error) {
          console.error(
            "❌ Erro ao sincronizar:",
            error
          );

          return;
        }

        console.log(
          "✅ Dados sincronizados com Supabase."
        );
      } catch (erro) {
        console.error(
          "❌ Erro inesperado na sincronização:",
          erro
        );
      }
    }

    sincronizarComSupabase();
  }, [lancamentos, carregamentoInicial]);

    // =====================================================
  // 3. SINCRONIZAÇÃO AUTOMÁTICA EM TEMPO REAL
  // =====================================================
  useEffect(() => {
    const canal = supabase
      .channel("lancamentos-tempo-real")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lancamentos",
        },
        async (payload) => {
          console.log(
            "🔄 Alteração recebida do Supabase:",
            payload.eventType
          );

          const { data, error } = await supabase
            .from("lancamentos")
            .select("*")
            .order("updated_at", { ascending: false });

          if (error) {
            console.error(
              "❌ Erro ao atualizar dados:",
              error
            );
            return;
          }

          if (data) {
            const dadosAtualizados = data
              .map((registro) => registro.dados as Lancamento)
              .filter(Boolean);

            setLancamentos(dadosAtualizados);

            console.log(
              "✅ Aplicativo atualizado automaticamente."
            );
          }
        }
      )
      .subscribe((status) => {
        console.log(
          "📡 Status Realtime:",
          status
        );
      });

    return () => {
      supabase.removeChannel(canal);
    };
  }, []);
  return [lancamentos, setLancamentos] as const;
}

export function formatarData(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function hojeISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

export function gerarCodigo(dados: Lancamento[]): string {
  const json = JSON.stringify(dados);
  return btoa(unescape(encodeURIComponent(json)));
}

export function lerCodigo(codigo: string): Lancamento[] {
  const json = decodeURIComponent(escape(atob(codigo.trim())));
  const dados = JSON.parse(json);

  if (!Array.isArray(dados)) {
    throw new Error("Formato inválido");
  }

  return dados as Lancamento[];
}
