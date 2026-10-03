import { useEffect, useRef, useState } from "react";
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

function assinatura(dados: Lancamento[]): string {
  return JSON.stringify(
    [...dados].sort((a, b) => a.id.localeCompare(b.id))
  );
}

export function useLancamentos() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(
    () => carregar()
  );

  const [carregamentoInicial, setCarregamentoInicial] = useState(false);

  // Indica que a próxima alteração do estado veio do Supabase,
  // e não do usuário local.
  const alteracaoRemota = useRef(false);

  // Evita duas sincronizações simultâneas.
  const sincronizando = useRef(false);

  // Guarda a última versão conhecida.
  const ultimaAssinatura = useRef<string>("");

  // =====================================================
  // 1. SALVA UMA CÓPIA LOCAL
  // =====================================================

  useEffect(() => {
    salvar(lancamentos);
  }, [lancamentos]);

  // =====================================================
  // 2. CARREGA DO SUPABASE AO ABRIR
  // =====================================================

  useEffect(() => {
    let ativo = true;

    async function carregarDoSupabase() {
      try {
        console.log("☁️ Buscando lançamentos no Supabase...");

        const { data, error } = await supabase
          .from("lancamentos")
          .select("*")
          .order("updated_at", { ascending: false });

        if (error) {
          console.error("❌ Erro ao buscar Supabase:", error);
          setCarregamentoInicial(true);
          return;
        }

        if (!ativo) return;

        const dadosSupabase: Lancamento[] = (data || [])
          .map((registro) => registro.dados as Lancamento)
          .filter(Boolean);

        console.log(
          "✅ Lançamentos recebidos do Supabase:",
          dadosSupabase.length
        );

        alteracaoRemota.current = true;

        ultimaAssinatura.current = assinatura(dadosSupabase);

        setLancamentos(dadosSupabase);

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

    return () => {
      ativo = false;
    };
  }, []);

  // =====================================================
  // 3. ENVIA ALTERAÇÕES LOCAIS PARA O SUPABASE
  // =====================================================

  useEffect(() => {
    if (!carregamentoInicial) return;

    // Se a alteração veio do Supabase,
    // não devemos mandar novamente para o Supabase.
    if (alteracaoRemota.current) {
      alteracaoRemota.current = false;
      ultimaAssinatura.current = assinatura(lancamentos);
      return;
    }

    const assinaturaAtual = assinatura(lancamentos);

    // Nada mudou de verdade.
    if (assinaturaAtual === ultimaAssinatura.current) {
      return;
    }

    async function sincronizarComSupabase() {
      if (sincronizando.current) return;

      sincronizando.current = true;

      try {
        console.log("☁️ Sincronizando alterações locais...");

        // -------------------------------------------------
        // 1. Busca os registros existentes no Supabase
        // -------------------------------------------------

        const { data: existentes, error: erroBusca } = await supabase
          .from("lancamentos")
          .select("id");

        if (erroBusca) {
          console.error(
            "❌ Erro ao buscar IDs existentes:",
            erroBusca
          );

          return;
        }

        // -------------------------------------------------
        // 2. IDs que continuam existindo no aplicativo
        // -------------------------------------------------

        const idsAtuais = new Set(
          lancamentos.map((lancamento) => lancamento.id)
        );

        // -------------------------------------------------
        // 3. Exclui do Supabase o que foi excluído localmente
        // -------------------------------------------------

        const idsParaExcluir = (existentes || [])
          .map((registro) => registro.id)
          .filter((id) => !idsAtuais.has(id));

        if (idsParaExcluir.length > 0) {
          const { error: erroDelete } = await supabase
            .from("lancamentos")
            .delete()
            .in("id", idsParaExcluir);

          if (erroDelete) {
            console.error(
              "❌ Erro ao excluir do Supabase:",
              erroDelete
            );

            return;
          }

          console.log(
            "🗑️ Registros excluídos do Supabase:",
            idsParaExcluir.length
          );
        }

        // -------------------------------------------------
        // 4. Se existem lançamentos, faz UPSERT
        // -------------------------------------------------

        if (lancamentos.length > 0) {
          const registros = lancamentos.map((lancamento) => ({
            id: lancamento.id,
            dados: lancamento,
            updated_at: new Date().toISOString(),
          }));

          const { error: erroUpsert } = await supabase
            .from("lancamentos")
            .upsert(registros, {
              onConflict: "id",
            });

          if (erroUpsert) {
            console.error(
              "❌ Erro ao sincronizar:",
              erroUpsert
            );

            return;
          }
        }

        ultimaAssinatura.current = assinaturaAtual;

        console.log(
          "✅ Dados sincronizados com Supabase."
        );
      } catch (erro) {
        console.error(
          "❌ Erro inesperado na sincronização:",
          erro
        );
      } finally {
        sincronizando.current = false;
      }
    }

    sincronizarComSupabase();
  }, [lancamentos, carregamentoInicial]);

  // =====================================================
  // 4. SINCRONIZAÇÃO EM TEMPO REAL
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

          try {
            const { data, error } = await supabase
              .from("lancamentos")
              .select("*")
              .order("updated_at", {
                ascending: false,
              });

            if (error) {
              console.error(
                "❌ Erro ao atualizar dados:",
                error
              );

              return;
            }

            const dadosAtualizados: Lancamento[] = (data || [])
              .map(
                (registro) =>
                  registro.dados as Lancamento
              )
              .filter(Boolean);

            const novaAssinatura =
              assinatura(dadosAtualizados);

            // Se os dados já são iguais aos que temos,
            // não atualiza o React desnecessariamente.
            if (
              novaAssinatura ===
              ultimaAssinatura.current
            ) {
              console.log(
                "ℹ️ Dados recebidos já estão atualizados."
              );

              return;
            }

            // Marca que esta alteração veio do Supabase.
            alteracaoRemota.current = true;

            ultimaAssinatura.current =
              novaAssinatura;

            setLancamentos(dadosAtualizados);

            console.log(
              "✅ Aplicativo atualizado automaticamente."
            );
          } catch (erro) {
            console.error(
              "❌ Erro no Realtime:",
              erro
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

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

export function formatarData(iso: string): string {
  const [a, m, d] = iso.split("-");

  return `${d}/${m}/${a}`;
}

export function hojeISO(): string {
  const d = new Date();

  const off = d.getTimezoneOffset();

  const local = new Date(
    d.getTime() - off * 60000
  );

  return local.toISOString().slice(0, 10);
}

export function gerarCodigo(
  dados: Lancamento[]
): string {
  const json = JSON.stringify(dados);

  return btoa(
    unescape(
      encodeURIComponent(json)
    )
  );
}

export function lerCodigo(
  codigo: string
): Lancamento[] {
  const json = decodeURIComponent(
    escape(atob(codigo.trim()))
  );

  const dados = JSON.parse(json);

  if (!Array.isArray(dados)) {
    throw new Error("Formato inválido");
  }

  return dados as Lancamento[];
}