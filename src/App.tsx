import { useMemo, useState } from "react";
import type { Categoria, Lancamento } from "./types";
import {
  ACONDICIONAMENTOS,
  COLABORADORES_DPP,
  CONFERENTES,
  MESES,
  ORIGENS,
  diferenca,
  limiteResolucao,
  prazoHoras,
  previstoUnid,
  statusDe,
  statusPrazo,
} from "./types";
import { formatarData, gerarCodigo, hojeISO, lerCodigo, useLancamentos } from "./storage";

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [ANO_ATUAL - 2, ANO_ATUAL - 1, ANO_ATUAL, ANO_ATUAL + 1];

interface FormState {
  data: string;
  hora: string;
  codigo: string;
  descricao: string;
  acondicionamento: string;
  unidadesPorAcond: string;
  caixas: string;
  recebidoCaixas: string;
  recebidoUnidades: string;
  categoria: Categoria;
  conferente: string;
  colaboradorPP: string;
  origem: string;
  obs: string;
}

function formVazio(mes: number, ano: number): FormState {
  const hoje = new Date();
  const dataPadrao =
    hoje.getMonth() === mes && hoje.getFullYear() === ano
      ? hojeISO()
      : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  const hh = String(hoje.getHours()).padStart(2, "0");
  const mm = String(hoje.getMinutes()).padStart(2, "0");
  return {
    data: dataPadrao,
    hora: `${hh}:${mm}`,
    codigo: "",
    descricao: "",
    acondicionamento: ACONDICIONAMENTOS[0],
    unidadesPorAcond: "",
    caixas: "",
    recebidoCaixas: "",
    recebidoUnidades: "",
    categoria: "seca",
    conferente: "",
    colaboradorPP: "",
    origem: "",
    obs: "",
  };
}

export default function App() {
  const [lancamentos, setLancamentos] = useLancamentos();
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth());
  const [ano, setAno] = useState(hoje.getFullYear());
  const [form, setForm] = useState<FormState>(() => formVazio(hoje.getMonth(), hoje.getFullYear()));
  const [editId, setEditId] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "falta" | "sobra" | "ok">("todos");
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<"lancamentos" | "relatorio" | "backup">("lancamentos");
  const [codigoSync, setCodigoSync] = useState("");
  const [msgBackup, setMsgBackup] = useState("");

  // Lançamentos do mês selecionado
  const doMes = useMemo(() => {
    return lancamentos
      .filter((l) => {
        const [a, m] = l.data.split("-").map(Number);
        return a === ano && m === mes + 1;
      })
      .filter((l) => (filtroTipo === "todos" ? true : statusDe(l) === filtroTipo))
      .filter((l) => {
        if (!busca.trim()) return true;
        const t = busca.toLowerCase();
        return (
          l.codigo.toLowerCase().includes(t) ||
          l.descricao.toLowerCase().includes(t)
        );
      })
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [lancamentos, mes, ano, filtroTipo, busca]);

  const totais = useMemo(() => {
    const base = lancamentos.filter((l) => {
      const [a, m] = l.data.split("-").map(Number);
      return a === ano && m === mes + 1;
    });
    let faltas = 0;
    let sobras = 0;
    let previsto = 0;
    let recebido = 0;
    for (const l of base) {
      const d = diferenca(l);
      if (d < 0) faltas += -d;
      else if (d > 0) sobras += d;
      previsto += previstoUnid(l);
      recebido += l.recebido;
    }
    return { faltas, sobras, saldo: sobras - faltas, previsto, recebido, qtd: base.length };
  }, [lancamentos, mes, ano]);

  // pré-visualização do lançamento atual no formulário
  const preview = useMemo(() => {
    const unid =
      form.acondicionamento === "Unidade" ? 1 : parseInt(form.unidadesPorAcond, 10) || 1;
    const caixas = parseInt(form.caixas, 10) || 0;
    const recCaixas = parseInt(form.recebidoCaixas, 10) || 0;
    const recUnid = parseInt(form.recebidoUnidades, 10) || 0;
    const prev = caixas * unid;
    const recebido = recCaixas * unid + recUnid;
    const diff = recebido - prev;
    return { prev, recebido, diff };
  }, [form]);

  function mudarMes(novoMes: number, novoAno: number) {
    setMes(novoMes);
    setAno(novoAno);
    setEditId(null);
    setForm(formVazio(novoMes, novoAno));
  }

  function salvarLancamento(e: React.FormEvent) {
    e.preventDefault();
    const unidNum = form.acondicionamento === "Unidade" ? 1 : parseInt(form.unidadesPorAcond, 10) || 1;
    const caixasNum = parseInt(form.caixas, 10) || 0;
    const recCaixas = parseInt(form.recebidoCaixas, 10) || 0;
    const recUnid = parseInt(form.recebidoUnidades, 10) || 0;
    const recebidoNum = recCaixas * unidNum + recUnid;
    // Previsto pode ser 0 (ex.: sobra de produto não esperado).
    // Exige apenas dados básicos e que haja previsto OU recebido > 0.
    if (
      !form.codigo.trim() ||
      !form.descricao.trim() ||
      !form.data ||
      (caixasNum <= 0 && recebidoNum <= 0)
    ) {
      return;
    }
    if (editId) {
      setLancamentos((prev) =>
        prev.map((l) =>
          l.id === editId
            ? {
                ...l,
                data: form.data,
                hora: form.hora,
                codigo: form.codigo.trim(),
                descricao: form.descricao.trim(),
                acondicionamento: form.acondicionamento,
                unidadesPorAcond: unidNum,
                caixas: caixasNum,
                recebido: recebidoNum,
                categoria: form.categoria,
                conferente: form.conferente.trim(),
                colaboradorPP: form.colaboradorPP.trim(),
                origem: form.origem.trim(),
                obs: form.obs.trim(),
              }
            : l
        )
      );
      setEditId(null);
    } else {
      const novo: Lancamento = {
        id: crypto.randomUUID(),
        data: form.data,
        hora: form.hora,
        codigo: form.codigo.trim(),
        descricao: form.descricao.trim(),
        acondicionamento: form.acondicionamento,
        unidadesPorAcond: unidNum,
        caixas: caixasNum,
        recebido: recebidoNum,
        categoria: form.categoria,
        conferente: form.conferente.trim(),
        colaboradorPP: form.colaboradorPP.trim(),
        origem: form.origem.trim(),
        resolvido: false,
        obs: form.obs.trim(),
      };
      setLancamentos((prev) => [...prev, novo]);
    }
    setForm(formVazio(mes, ano));
  }

  function editar(l: Lancamento) {
    setEditId(l.id);
    setForm({
      data: l.data,
      hora: l.hora || "00:00",
      codigo: l.codigo,
      descricao: l.descricao,
      acondicionamento: l.acondicionamento,
      unidadesPorAcond: String(l.unidadesPorAcond ?? 1),
      caixas: l.caixas ? String(l.caixas) : "",
      recebidoCaixas: (() => {
        const v = Math.floor(l.recebido / (l.unidadesPorAcond || 1));
        return v ? String(v) : "";
      })(),
      recebidoUnidades: (() => {
        const v = l.recebido % (l.unidadesPorAcond || 1);
        return v ? String(v) : "";
      })(),
      categoria: l.categoria ?? "seca",
      conferente: l.conferente || "",
      colaboradorPP: l.colaboradorPP || "",
      origem: l.origem || "",
      obs: l.obs || "",
    });
    setAba("lancamentos");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelarEdicao() {
    setEditId(null);
    setForm(formVazio(mes, ano));
  }

  function excluir(id: string) {
    if (confirm("Deseja realmente excluir este lançamento?")) {
      setLancamentos((prev) => prev.filter((l) => l.id !== id));
      if (editId === id) cancelarEdicao();
    }
  }

  function alternarResolvido(id: string) {
    setLancamentos((prev) =>
      prev.map((l) => (l.id === id ? { ...l, resolvido: !l.resolvido } : l))
    );
  }

  function textoPrazo(l: Lancamento): { label: string; cls: string } {
    const s = statusPrazo(l);
    if (s === "sem_problema") return { label: "—", cls: "text-slate-400" };
    if (s === "resolvido") return { label: "✅ Resolvido", cls: "text-emerald-600" };
    const limite = limiteResolucao(l);
    const lim = `${String(limite.getDate()).padStart(2, "0")}/${String(
      limite.getMonth() + 1
    ).padStart(2, "0")} ${String(limite.getHours()).padStart(2, "0")}:${String(
      limite.getMinutes()
    ).padStart(2, "0")}`;
    if (s === "atrasado") return { label: `⏰ Atrasado (venceu ${lim})`, cls: "text-rose-600 font-bold" };
    return { label: `🕒 Até ${lim}`, cls: "text-amber-600" };
  }

  function rotuloStatus(l: Lancamento): string {
    const s = statusDe(l);
    if (s === "falta") return "Falta";
    if (s === "sobra") return "Sobra";
    return "Conferido";
  }

  function exportarCSV() {
    const linhas = [
      [
        "Data/Hora",
        "Código",
        "Descrição",
        "Acondicionamento",
        "Qtd/Acond.",
        "Qtd. Caixas",
        "Previsto (un)",
        "Recebido (un)",
        "Diferença (un)",
        "Status",
        "Categoria",
        "Prazo (h)",
        "Limite resolução",
        "Situação prazo",
        "Local origem",
        "Conferente",
        "DPP - Departamento de Prevenção e Perdas",
        "Observação",
      ],
      ...doMes.map((l) => {
        const d = diferenca(l);
        const lim = limiteResolucao(l);
        const limStr =
          d === 0
            ? "-"
            : `${String(lim.getDate()).padStart(2, "0")}/${String(lim.getMonth() + 1).padStart(2, "0")}/${lim.getFullYear()} ${String(lim.getHours()).padStart(2, "0")}:${String(lim.getMinutes()).padStart(2, "0")}`;
        const sp = statusPrazo(l);
        const spStr =
          sp === "sem_problema"
            ? "-"
            : sp === "resolvido"
            ? "Resolvido"
            : sp === "atrasado"
            ? "Atrasado"
            : "No prazo";
        return [
          formatarData(l.data) + (l.hora ? " " + l.hora : ""),
          l.codigo,
          l.descricao,
          l.acondicionamento,
          String(l.unidadesPorAcond ?? 1),
          String(l.caixas),
          String(previstoUnid(l)),
          String(l.recebido),
          String(d),
          rotuloStatus(l),
          l.categoria === "pereciveis" ? "Perecíveis" : "Carga seca",
          String(prazoHoras(l.categoria)),
          limStr,
          spStr,
          l.origem || "",
          l.conferente || "",
          l.colaboradorPP || "",
          l.obs || "",
        ];
      }),
    ];
    const csv = linhas
      .map((linha) => linha.map((c) => `"${c.replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${MESES[mes]}-${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function textoRelatorio(): string {
    const linhas: string[] = [];
    linhas.push(`*SUPERBOM NOVA IGUAÇU*`);
    linhas.push(`Av. Marquês Rolo, N° 995`);
    linhas.push(`*RELATÓRIO DE FALTAS E SOBRAS*`);
    linhas.push(`📅 ${MESES[mes]} / ${ano}`);
    linhas.push("");
    linhas.push(`📦 Previsto: ${totais.previsto} un`);
    linhas.push(`✅ Recebido: ${totais.recebido} un`);
    linhas.push(`🔻 Faltas: ${totais.faltas} un`);
    linhas.push(`🔺 Sobras: ${totais.sobras} un`);
    linhas.push(`⚖️ Saldo: ${totais.saldo} un`);
    linhas.push("");
    linhas.push(`*Por produto:*`);
    if (relatorioProdutos.length === 0) {
      linhas.push("Sem lançamentos.");
    } else {
      for (const p of relatorioProdutos) {
        const dif = p.recebido - p.previsto;
        const st = dif < 0 ? `Falta ${-dif}un` : dif > 0 ? `Sobra ${dif}un` : "Conferido";
        linhas.push(
          `• [${p.codigo}] ${p.descricao} (${p.acond} c/ ${p.unid}) — Previsto: ${p.previsto}un | Recebido: ${p.recebido}un → ${st}`
        );
      }
    }
    if (relatorioDias.length > 0) {
      linhas.push("");
      linhas.push(`*Dia a dia:*`);
      for (const d of relatorioDias) {
        linhas.push(`📆 ${formatarData(d.data)} — Faltas: ${d.faltas}un | Sobras: ${d.sobras}un`);
        for (const it of d.itensFalta) {
          linhas.push(`   🔻 [${it.codigo}] ${it.descricao}: -${-it.diff}un`);
        }
        for (const it of d.itensSobra) {
          linhas.push(`   🔺 [${it.codigo}] ${it.descricao}: +${it.diff}un`);
        }
      }
    }
    if (pendencias.length > 0) {
      linhas.push("");
      linhas.push(`*⏱️ Pendências em aberto (prazo 12h perecível / 24h seca):*`);
      for (const l of pendencias) {
        const d = diferenca(l);
        const tp = textoPrazo(l);
        const cat = l.categoria === "pereciveis" ? "Perecível 12h" : "Seca 24h";
        linhas.push(
          `• [${l.codigo}] ${l.descricao} — ${d < 0 ? `Falta ${-d}` : `Sobra ${d}`}un | ${cat} | ${tp.label.replace(/[🕒⏰]/g, "").trim()}`
        );
        if (l.origem) linhas.push(`   Origem: ${l.origem}`);
        if (l.conferente) linhas.push(`   Conferente: ${l.conferente}`);
        if (l.colaboradorPP) linhas.push(`   DPP: ${l.colaboradorPP}`);
      }
    }
    return linhas.join("\n");
  }

  function compartilharWhatsApp() {
    const texto = encodeURIComponent(textoRelatorio());
    window.open(`https://wa.me/?text=${texto}`, "_blank");
  }

  function imprimir() {
    window.print();
  }

  // ---- Backup ----
  async function exportarBackup() {
    const conteudo = JSON.stringify(lancamentos, null, 2);
    const nomeArquivo = `backup-faltas-sobras-${hojeISO()}.json`;
    const blob = new Blob([conteudo], { type: "application/json" });

    // Navegadores compatíveis: abre janela "Salvar como" para escolher o local
    const picker = (window as unknown as {
      showSaveFilePicker?: (opts: unknown) => Promise<{
        createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
      }>;
    }).showSaveFilePicker;

    if (picker) {
      try {
        const handle = await picker({
          suggestedName: nomeArquivo,
          types: [
            {
              description: "Arquivo de backup (JSON)",
              accept: { "application/json": [".json"] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setMsgBackup("✅ Backup salvo no local que você escolheu!");
        return;
      } catch (err) {
        // usuário cancelou a janela
        if (err instanceof DOMException && err.name === "AbortError") {
          setMsgBackup("Exportação cancelada.");
          return;
        }
        // se falhar por outro motivo, cai no método tradicional abaixo
      }
    }

    // Método tradicional (download): vai para a pasta de Downloads do navegador
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
    setMsgBackup(
      `✅ Backup "${nomeArquivo}" baixado! Verifique na pasta Downloads do seu dispositivo (ou no local definido nas configurações de download do navegador).`
    );
  }

  function importarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dados = JSON.parse(String(reader.result));
        if (!Array.isArray(dados)) throw new Error();
        aplicarImportacao(dados as Lancamento[]);
      } catch {
        setMsgBackup("❌ Arquivo inválido. Verifique o backup.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function aplicarImportacao(dados: Lancamento[]) {
    const substituir = confirm(
      `Foram encontrados ${dados.length} lançamento(s).\n\nOK = SUBSTITUIR todos os dados atuais.\nCancelar = MESCLAR (juntar com os existentes).`
    );
    if (substituir) {
      setLancamentos(dados);
      setMsgBackup(`✅ ${dados.length} lançamento(s) importado(s) (substituídos).`);
    } else {
      setLancamentos((prev) => {
        const ids = new Set(prev.map((l) => l.id));
        const novos = dados.filter((l) => !ids.has(l.id));
        return [...prev, ...novos];
      });
      setMsgBackup("✅ Dados mesclados com sucesso!");
    }
  }

  function gerarCodigoSync() {
    setCodigoSync(gerarCodigo(lancamentos));
    setMsgBackup("✅ Código gerado. Copie e use em outro dispositivo.");
  }

  function copiarCodigo() {
    if (!codigoSync) return;
    navigator.clipboard?.writeText(codigoSync);
    setMsgBackup("📋 Código copiado para a área de transferência!");
  }

  function importarCodigo() {
    try {
      const dados = lerCodigo(codigoSync);
      aplicarImportacao(dados);
    } catch {
      setMsgBackup("❌ Código inválido. Verifique e tente novamente.");
    }
  }

  function limparTudo() {
    if (confirm("Tem certeza que deseja APAGAR TODOS os lançamentos? Esta ação não pode ser desfeita.")) {
      setLancamentos([]);
      setMsgBackup("🗑️ Todos os dados foram apagados.");
    }
  }

  // Relatório: agrupado por produto
  const relatorioProdutos = useMemo(() => {
    const base = lancamentos.filter((l) => {
      const [a, m] = l.data.split("-").map(Number);
      return a === ano && m === mes + 1;
    });
    const mapa = new Map<
      string,
      {
        codigo: string;
        descricao: string;
        acond: string;
        unid: number;
        previsto: number;
        recebido: number;
        faltas: number;
        sobras: number;
      }
    >();
    for (const l of base) {
      const k = l.codigo + "|" + l.descricao;
      const u = l.unidadesPorAcond ?? 1;
      const item =
        mapa.get(k) || {
          codigo: l.codigo,
          descricao: l.descricao,
          acond: l.acondicionamento,
          unid: u,
          previsto: 0,
          recebido: 0,
          faltas: 0,
          sobras: 0,
        };
      const d = diferenca(l);
      item.previsto += previstoUnid(l);
      item.recebido += l.recebido;
      if (d < 0) item.faltas += -d;
      else if (d > 0) item.sobras += d;
      mapa.set(k, item);
    }
    return Array.from(mapa.values()).sort((a, b) =>
      a.descricao.localeCompare(b.descricao)
    );
  }, [lancamentos, mes, ano]);

  // Relatório: por dia
  interface ItemDia {
    codigo: string;
    descricao: string;
    previsto: number;
    recebido: number;
    diff: number;
  }
  const relatorioDias = useMemo(() => {
    const base = lancamentos.filter((l) => {
      const [a, m] = l.data.split("-").map(Number);
      return a === ano && m === mes + 1;
    });
    const mapa = new Map<
      string,
      { faltas: number; sobras: number; itensFalta: ItemDia[]; itensSobra: ItemDia[] }
    >();
    for (const l of base) {
      const item =
        mapa.get(l.data) || { faltas: 0, sobras: 0, itensFalta: [], itensSobra: [] };
      const d = diferenca(l);
      const reg: ItemDia = {
        codigo: l.codigo,
        descricao: l.descricao,
        previsto: previstoUnid(l),
        recebido: l.recebido,
        diff: d,
      };
      if (d < 0) {
        item.faltas += -d;
        item.itensFalta.push(reg);
      } else if (d > 0) {
        item.sobras += d;
        item.itensSobra.push(reg);
      }
      mapa.set(l.data, item);
    }
    return Array.from(mapa.entries())
      .map(([data, v]) => ({ data, ...v }))
      .sort((a, b) => a.data.localeCompare(b.data));
  }, [lancamentos, mes, ano]);

  // Pendências (problemas em aberto) com controle de prazo
  const pendencias = useMemo(() => {
    const base = lancamentos.filter((l) => {
      const [a, m] = l.data.split("-").map(Number);
      return a === ano && m === mes + 1;
    });
    return base
      .filter((l) => diferenca(l) !== 0 && !l.resolvido)
      .sort((a, b) => limiteResolucao(a).getTime() - limiteResolucao(b).getTime());
  }, [lancamentos, mes, ano]);

  const ehUnidade = form.acondicionamento === "Unidade";

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800">
      {/* Cabeçalho */}
      <header className="bg-gradient-to-r from-indigo-700 to-violet-700 text-white shadow-lg">
        <div className="mx-auto max-w-6xl px-4 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-2xl">
              📦
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">Superbom Nova Iguaçu</h1>
              <p className="text-sm text-indigo-100">Av. Marquês Rolo, N° 995</p>
              <p className="text-xs text-indigo-200">Controle de Faltas e Sobras — dia a dia, mês a mês</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={mes}
              onChange={(e) => mudarMes(Number(e.target.value), ano)}
              className="rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-slate-800 shadow focus:outline-none"
            >
              {MESES.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select
              value={ano}
              onChange={(e) => mudarMes(mes, Number(e.target.value))}
              className="rounded-lg bg-white/95 px-3 py-2 text-sm font-medium text-slate-800 shadow focus:outline-none"
            >
              {ANOS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        {/* Cartões de totais */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card titulo="Previsto (un)" valor={totais.previsto} cor="text-slate-700" icone="📦" />
          <Card titulo="Recebido (un)" valor={totais.recebido} cor="text-indigo-600" icone="✅" />
          <Card titulo="Faltas (un)" valor={totais.faltas} cor="text-rose-600" icone="🔻" />
          <Card titulo="Sobras (un)" valor={totais.sobras} cor="text-emerald-600" icone="🔺" />
          <Card
            titulo="Saldo (un)"
            valor={totais.saldo}
            cor={totais.saldo < 0 ? "text-rose-600" : "text-emerald-600"}
            icone="⚖️"
          />
        </div>

        {/* Abas */}
        <div className="flex gap-2">
          <button
            onClick={() => setAba("lancamentos")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              aba === "lancamentos"
                ? "bg-indigo-600 text-white shadow"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Lançamentos
          </button>
          <button
            onClick={() => setAba("relatorio")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              aba === "relatorio"
                ? "bg-indigo-600 text-white shadow"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Relatórios
          </button>
          <button
            onClick={() => setAba("backup")}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              aba === "backup"
                ? "bg-indigo-600 text-white shadow"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Backup / Sincronizar
          </button>
        </div>

        {aba === "lancamentos" && (
          <>
            {/* Formulário */}
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-1 text-lg font-bold text-slate-800">
                {editId ? "✏️ Editar lançamento" : "➕ Adicionar produto"}
              </h2>
              <p className="mb-4 text-xs text-slate-500">
                Informe quanto <strong>era para receber</strong> (nº de caixas × qtd. dentro de cada caixa)
                e quanto <strong>realmente recebeu</strong> (caixas inteiras + unidades avulsas). A falta ou
                sobra em unidades é calculada automaticamente.
              </p>
              <form onSubmit={salvarLancamento} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Campo label="Data">
                  <input
                    type="date"
                    value={form.data}
                    onChange={(e) => setForm((f) => ({ ...f, data: e.target.value }))}
                    className="input"
                    required
                  />
                </Campo>
                <Campo label="Hora do recebimento">
                  <input
                    type="time"
                    value={form.hora}
                    onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))}
                    className="input"
                  />
                </Campo>
                <Campo label="Código do produto">
                  <input
                    type="text"
                    value={form.codigo}
                    onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))}
                    placeholder="Ex: 1023"
                    className="input"
                    required
                  />
                </Campo>
                <Campo label="Descrição do produto" full>
                  <input
                    type="text"
                    value={form.descricao}
                    onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                    placeholder="Ex: Arroz Tipo 1 5kg"
                    className="input"
                    required
                  />
                </Campo>
                <Campo label="Acondicionamento">
                  <select
                    value={form.acondicionamento}
                    onChange={(e) => {
                      const novo = e.target.value;
                      setForm((f) => ({
                        ...f,
                        acondicionamento: novo,
                        unidadesPorAcond: novo === "Unidade" ? "1" : f.unidadesPorAcond,
                      }));
                    }}
                    className="input"
                  >
                    {ACONDICIONAMENTOS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Qtd. dentro do acond. (ex: caixa c/ 12)">
                  <input
                    type="number"
                    min={1}
                    value={ehUnidade ? "1" : form.unidadesPorAcond}
                    onChange={(e) => setForm((f) => ({ ...f, unidadesPorAcond: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    placeholder="Ex: 12"
                    className="input disabled:bg-slate-100 disabled:text-slate-400"
                    disabled={ehUnidade}
                  />
                </Campo>
                <Campo label={`Qtd. de ${form.acondicionamento.toLowerCase()}s (previsto)`}>
                  <input
                    type="number"
                    min={0}
                    value={form.caixas}
                    onChange={(e) => setForm((f) => ({ ...f, caixas: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    placeholder="0 = não previsto (sobra)"
                    className="input"
                  />
                </Campo>
                <Campo label={`${form.acondicionamento}s recebidas`}>
                  <input
                    type="number"
                    min={0}
                    value={form.recebidoCaixas}
                    onChange={(e) => setForm((f) => ({ ...f, recebidoCaixas: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    placeholder="Ex: 2"
                    className="input"
                  />
                </Campo>
                <Campo label="Unidades avulsas recebidas">
                  <input
                    type="number"
                    min={0}
                    value={form.recebidoUnidades}
                    onChange={(e) => setForm((f) => ({ ...f, recebidoUnidades: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    placeholder="Ex: 0"
                    className="input"
                  />
                </Campo>
                <Campo label="Resultado (previsto x recebido)">
                  <div
                    className={`input flex items-center justify-between gap-2 font-semibold ${
                      preview.diff < 0
                        ? "bg-rose-50 text-rose-700"
                        : preview.diff > 0
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-50 text-slate-600"
                    }`}
                  >
                    <span className="text-xs font-normal text-slate-500">
                      {preview.prev} prev → {preview.recebido} rec
                    </span>
                    <span>
                      {preview.diff < 0
                        ? `Falta ${-preview.diff}`
                        : preview.diff > 0
                        ? `Sobra ${preview.diff}`
                        : "OK"}
                    </span>
                  </div>
                </Campo>
                <Campo label="Categoria (prazo de resolução)">
                  <select
                    value={form.categoria}
                    onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value as Categoria }))}
                    className="input"
                  >
                    <option value="pereciveis">Perecíveis — resolver em 12h</option>
                    <option value="seca">Carga seca — resolver em 24h</option>
                  </select>
                </Campo>
                <Campo label="Local de origem">
                  <SelectComOutro
                    opcoes={ORIGENS}
                    valor={form.origem}
                    onChange={(v) => setForm((f) => ({ ...f, origem: v }))}
                    placeholder="Digite o local de origem"
                  />
                </Campo>
                <Campo label="Conferente">
                  <SelectComOutro
                    opcoes={CONFERENTES}
                    valor={form.conferente}
                    onChange={(v) => setForm((f) => ({ ...f, conferente: v }))}
                    placeholder="Digite o nome do conferente"
                  />
                </Campo>
                <Campo label="DPP - Departamento de Prevenção e Perdas">
                  <SelectComOutro
                    opcoes={COLABORADORES_DPP}
                    valor={form.colaboradorPP}
                    onChange={(v) => setForm((f) => ({ ...f, colaboradorPP: v }))}
                    placeholder="Digite o nome do DPP"
                  />
                </Campo>
                <div className="lg:col-span-4 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                  ⏱️ Regra de resolução: <strong>Perecíveis em até 12 horas</strong> e{" "}
                  <strong>Carga seca em até 24 horas</strong> a partir do recebimento. Esta categoria
                  aplica prazo de <strong>{prazoHoras(form.categoria)}h</strong>.
                </div>
                <Campo label="Observação (opcional)" full>
                  <input
                    type="text"
                    value={form.obs}
                    onChange={(e) => setForm((f) => ({ ...f, obs: e.target.value }))}
                    placeholder="Ex: avaria, divergência de nota..."
                    className="input"
                  />
                </Campo>
                <div className="flex items-end gap-2 lg:col-span-4">
                  <button
                    type="submit"
                    className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700 transition"
                  >
                    {editId ? "Salvar alterações" : "Adicionar"}
                  </button>
                  {editId && (
                    <button
                      type="button"
                      onClick={cancelarEdicao}
                      className="rounded-lg bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-300 transition"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </form>
            </section>

            {/* Filtros e lista */}
            <section className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-800">
                  {MESES[mes]} / {ano} — {doMes.length} item(ns)
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar código ou descrição..."
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <select
                    value={filtroTipo}
                    onChange={(e) => setFiltroTipo(e.target.value as typeof filtroTipo)}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none"
                  >
                    <option value="todos">Todos</option>
                    <option value="falta">Faltas</option>
                    <option value="sobra">Sobras</option>
                    <option value="ok">Conferidos</option>
                  </select>
                  <button
                    onClick={exportarCSV}
                    disabled={doMes.length === 0}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40 transition"
                  >
                    ⬇ Exportar CSV
                  </button>
                </div>
              </div>

              {doMes.length === 0 ? (
                <p className="py-10 text-center text-slate-400">
                  Nenhum lançamento para este período. Adicione um produto acima.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-2 pr-3 font-semibold">Data</th>
                        <th className="py-2 pr-3 font-semibold">Código</th>
                        <th className="py-2 pr-3 font-semibold">Descrição</th>
                        <th className="py-2 pr-3 font-semibold">Acond.</th>
                        <th className="py-2 pr-3 font-semibold text-right">Qtd/Acond.</th>
                        <th className="py-2 pr-3 font-semibold text-right">Caixas</th>
                        <th className="py-2 pr-3 font-semibold text-right">Previsto</th>
                        <th className="py-2 pr-3 font-semibold text-right">Recebido</th>
                        <th className="py-2 pr-3 font-semibold text-right">Dif.</th>
                        <th className="py-2 pr-3 font-semibold">Status</th>
                        <th className="py-2 pr-3 font-semibold">Categoria</th>
                        <th className="py-2 pr-3 font-semibold">Prazo resolução</th>
                        <th className="py-2 pr-3 font-semibold">Origem</th>
                        <th className="py-2 pr-3 font-semibold">Conferente</th>
                        <th className="py-2 pr-3 font-semibold">DPP</th>
                        <th className="py-2 pr-3 font-semibold">Obs.</th>
                        <th className="py-2 font-semibold text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doMes.map((l) => {
                        const d = diferenca(l);
                        const s = statusDe(l);
                        return (
                          <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2 pr-3 whitespace-nowrap">{formatarData(l.data)}</td>
                            <td className="py-2 pr-3 font-mono">{l.codigo}</td>
                            <td className="py-2 pr-3">{l.descricao}</td>
                            <td className="py-2 pr-3 text-slate-500">{l.acondicionamento}</td>
                            <td className="py-2 pr-3 text-right text-slate-500">{l.unidadesPorAcond ?? 1}</td>
                            <td className="py-2 pr-3 text-right">{l.caixas}</td>
                            <td className="py-2 pr-3 text-right text-slate-500">{previstoUnid(l)}</td>
                            <td className="py-2 pr-3 text-right font-semibold">{l.recebido}</td>
                            <td
                              className={`py-2 pr-3 text-right font-bold ${
                                d < 0 ? "text-rose-600" : d > 0 ? "text-emerald-600" : "text-slate-400"
                              }`}
                            >
                              {d > 0 ? `+${d}` : d}
                            </td>
                            <td className="py-2 pr-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  s === "falta"
                                    ? "bg-rose-100 text-rose-700"
                                    : s === "sobra"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-slate-100 text-slate-500"
                                }`}
                              >
                                {rotuloStatus(l)}
                              </span>
                            </td>
                            <td className="py-2 pr-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  l.categoria === "pereciveis"
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-sky-100 text-sky-700"
                                }`}
                              >
                                {l.categoria === "pereciveis" ? "Perecível 12h" : "Seca 24h"}
                              </span>
                            </td>
                            <td className={`py-2 pr-3 text-xs whitespace-nowrap ${textoPrazo(l).cls}`}>
                              {textoPrazo(l).label}
                            </td>
                            <td className="py-2 pr-3 text-slate-500">{l.origem || "—"}</td>
                            <td className="py-2 pr-3 text-slate-500">{l.conferente || "—"}</td>
                            <td className="py-2 pr-3 text-slate-500">{l.colaboradorPP || "—"}</td>
                            <td className="py-2 pr-3 text-slate-500 max-w-[140px] truncate" title={l.obs}>
                              {l.obs || "—"}
                            </td>
                            <td className="py-2 text-right whitespace-nowrap">
                              {diferenca(l) !== 0 && (
                                <button
                                  onClick={() => alternarResolvido(l.id)}
                                  className={`mr-1 rounded-md px-2 py-1 text-xs font-semibold ${
                                    l.resolvido
                                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                      : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                                  }`}
                                >
                                  {l.resolvido ? "Reabrir" : "Resolver"}
                                </button>
                              )}
                              <button
                                onClick={() => editar(l)}
                                className="mr-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => excluir(l.id)}
                                className="rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-200"
                              >
                                Excluir
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {aba === "relatorio" && (
          <section id="area-impressao" className="space-y-6">
            {/* Cabeçalho da loja (visível na impressão) */}
            <div className="rounded-2xl bg-white p-5 shadow-sm text-center">
              <h2 className="text-xl font-bold text-slate-800">Superbom Nova Iguaçu</h2>
              <p className="text-sm text-slate-500">Av. Marquês Rolo, N° 995</p>
              <p className="mt-1 text-sm font-semibold text-indigo-700">
                Relatório de Faltas e Sobras — {MESES[mes]} / {ano}
              </p>
            </div>

            {/* Painel de pendências / prazos */}
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-1 text-lg font-bold text-slate-800">
                ⏱️ Pendências e prazos de resolução — {MESES[mes]}/{ano}
              </h2>
              <p className="mb-4 text-xs text-slate-500">
                Regra: <strong>Perecíveis</strong> devem ser resolvidos em até <strong>12h</strong> e{" "}
                <strong>Carga seca</strong> em até <strong>24h</strong> a partir do recebimento.
              </p>
              {pendencias.length === 0 ? (
                <p className="py-4 text-center text-sm text-emerald-600 font-medium">
                  ✅ Nenhuma pendência em aberto neste mês.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-2 pr-3 font-semibold">Data</th>
                        <th className="py-2 pr-3 font-semibold">Produto</th>
                        <th className="py-2 pr-3 font-semibold">Problema</th>
                        <th className="py-2 pr-3 font-semibold">Categoria</th>
                        <th className="py-2 pr-3 font-semibold">Origem</th>
                        <th className="py-2 pr-3 font-semibold">Conferente</th>
                        <th className="py-2 pr-3 font-semibold">DPP</th>
                        <th className="py-2 pr-3 font-semibold">Prazo limite</th>
                        <th className="py-2 font-semibold text-right no-print">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendencias.map((l) => {
                        const d = diferenca(l);
                        const tp = textoPrazo(l);
                        return (
                          <tr key={l.id} className="border-b border-slate-100">
                            <td className="py-2 pr-3 whitespace-nowrap">
                              {formatarData(l.data)} {l.hora}
                            </td>
                            <td className="py-2 pr-3">
                              <span className="font-mono text-slate-500">{l.codigo}</span> {l.descricao}
                            </td>
                            <td
                              className={`py-2 pr-3 font-semibold ${
                                d < 0 ? "text-rose-600" : "text-emerald-600"
                              }`}
                            >
                              {d < 0 ? `Falta ${-d}` : `Sobra ${d}`}
                            </td>
                            <td className="py-2 pr-3">
                              {l.categoria === "pereciveis" ? "Perecível (12h)" : "Seca (24h)"}
                            </td>
                            <td className="py-2 pr-3 text-slate-500">{l.origem || "—"}</td>
                            <td className="py-2 pr-3 text-slate-500">{l.conferente || "—"}</td>
                            <td className="py-2 pr-3 text-slate-500">{l.colaboradorPP || "—"}</td>
                            <td className={`py-2 pr-3 text-xs whitespace-nowrap ${tp.cls}`}>{tp.label}</td>
                            <td className="py-2 text-right no-print">
                              <button
                                onClick={() => alternarResolvido(l.id)}
                                className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-200"
                              >
                                Resolver
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800">
                  📊 Relatório por produto — {MESES[mes]}/{ano}
                </h2>
                <div className="flex flex-wrap gap-2 no-print">
                  <button
                    onClick={exportarCSV}
                    disabled={doMes.length === 0}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    ⬇ CSV
                  </button>
                  <button
                    onClick={imprimir}
                    disabled={doMes.length === 0}
                    className="rounded-lg bg-slate-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
                  >
                    🖨 Imprimir
                  </button>
                  <button
                    onClick={compartilharWhatsApp}
                    disabled={doMes.length === 0}
                    className="rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-40"
                  >
                    💬 WhatsApp
                  </button>
                </div>
              </div>
              {relatorioProdutos.length === 0 ? (
                <p className="py-8 text-center text-slate-400">Sem dados para este mês.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-2 pr-3 font-semibold">Código</th>
                        <th className="py-2 pr-3 font-semibold">Descrição</th>
                        <th className="py-2 pr-3 font-semibold">Acond.</th>
                        <th className="py-2 pr-3 font-semibold text-right">Previsto (un)</th>
                        <th className="py-2 pr-3 font-semibold text-right">Recebido (un)</th>
                        <th className="py-2 pr-3 font-semibold text-right">Faltas (un)</th>
                        <th className="py-2 pr-3 font-semibold text-right">Sobras (un)</th>
                        <th className="py-2 font-semibold text-right">Saldo (un)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {relatorioProdutos.map((p) => {
                        const saldo = p.sobras - p.faltas;
                        return (
                          <tr key={p.codigo + p.descricao} className="border-b border-slate-100">
                            <td className="py-2 pr-3 font-mono">{p.codigo}</td>
                            <td className="py-2 pr-3">{p.descricao}</td>
                            <td className="py-2 pr-3 text-slate-500">
                              {p.acond} c/ {p.unid}
                            </td>
                            <td className="py-2 pr-3 text-right text-slate-600">{p.previsto}</td>
                            <td className="py-2 pr-3 text-right text-indigo-600 font-semibold">{p.recebido}</td>
                            <td className="py-2 pr-3 text-right text-rose-600 font-semibold">{p.faltas}</td>
                            <td className="py-2 pr-3 text-right text-emerald-600 font-semibold">{p.sobras}</td>
                            <td
                              className={`py-2 text-right font-bold ${
                                saldo < 0 ? "text-rose-600" : "text-emerald-600"
                              }`}
                            >
                              {saldo}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-bold text-slate-800">
                📅 Relatório dia a dia — {MESES[mes]}/{ano}
              </h2>
              {relatorioDias.length === 0 ? (
                <p className="py-8 text-center text-slate-400">Sem dados para este mês.</p>
              ) : (
                <div className="space-y-6">
                  {relatorioDias.map((d) => {
                    const linhas = [
                      ...d.itensFalta.map((it) => ({ ...it, tipo: "falta" as const })),
                      ...d.itensSobra.map((it) => ({ ...it, tipo: "sobra" as const })),
                    ];
                    return (
                      <div key={d.data} className="overflow-hidden rounded-xl border border-slate-200">
                        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 px-4 py-2">
                          <span className="text-sm font-bold text-slate-800">
                            📆 {formatarData(d.data)}
                          </span>
                          <span className="flex gap-4 text-xs">
                            <span className="text-rose-600 font-semibold">Faltas: {d.faltas} un</span>
                            <span className="text-emerald-600 font-semibold">Sobras: {d.sobras} un</span>
                            <span className="text-slate-600 font-semibold">
                              Saldo: {d.sobras - d.faltas} un
                            </span>
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
                                <th className="py-2 px-3 font-semibold">Código</th>
                                <th className="py-2 px-3 font-semibold">Descrição</th>
                                <th className="py-2 px-3 font-semibold text-right">Previsto</th>
                                <th className="py-2 px-3 font-semibold text-right">Recebido</th>
                                <th className="py-2 px-3 font-semibold text-right">Dif.</th>
                                <th className="py-2 px-3 font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {linhas.map((it, i) => (
                                <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                  <td className="py-2 px-3 font-mono">{it.codigo}</td>
                                  <td className="py-2 px-3">{it.descricao}</td>
                                  <td className="py-2 px-3 text-right text-slate-500">{it.previsto}</td>
                                  <td className="py-2 px-3 text-right font-semibold">{it.recebido}</td>
                                  <td
                                    className={`py-2 px-3 text-right font-bold ${
                                      it.tipo === "falta" ? "text-rose-600" : "text-emerald-600"
                                    }`}
                                  >
                                    {it.diff > 0 ? `+${it.diff}` : it.diff}
                                  </td>
                                  <td className="py-2 px-3">
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                        it.tipo === "falta"
                                          ? "bg-rose-100 text-rose-700"
                                          : "bg-emerald-100 text-emerald-700"
                                      }`}
                                    >
                                      {it.tipo === "falta" ? "Falta" : "Sobra"}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        {aba === "backup" && (
          <section className="space-y-6">
            {msgBackup && (
              <div className="rounded-lg bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">
                {msgBackup}
              </div>
            )}

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-1 text-lg font-bold text-slate-800">💾 Backup em arquivo</h2>
              <p className="mb-4 text-sm text-slate-500">
                Exporte um arquivo com todos os seus dados. Guarde-o ou envie para outro dispositivo
                (e-mail, WhatsApp, nuvem) e importe lá para ter as mesmas informações.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={exportarBackup}
                  className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-indigo-700"
                >
                  ⬇ Exportar backup (.json)
                </button>
                <label className="cursor-pointer rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-700">
                  ⬆ Importar backup (.json)
                  <input type="file" accept="application/json,.json" onChange={importarArquivo} className="hidden" />
                </label>
              </div>
              <div className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-700">
                <p className="font-semibold mb-1">📍 Onde o backup é salvo?</p>
                <p>
                  Nos navegadores mais novos (Chrome, Edge), ao clicar em exportar aparece uma janela
                  <strong> "Salvar como"</strong> para você escolher a pasta (Documentos, Pen drive, Google
                  Drive, etc.). Em outros navegadores ou no celular, o arquivo vai para a pasta{" "}
                  <strong>Downloads</strong> padrão do aparelho.
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="mb-1 text-lg font-bold text-slate-800">🔗 Código de sincronização</h2>
              <p className="mb-4 text-sm text-slate-500">
                Gere um código com todos os dados, copie e cole em outro dispositivo para sincronizar
                sem precisar de arquivo. Ideal para passar do computador para o celular rapidamente.
              </p>
              <div className="flex flex-wrap gap-3 mb-3">
                <button
                  onClick={gerarCodigoSync}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                >
                  🔑 Gerar código
                </button>
                <button
                  onClick={copiarCodigo}
                  disabled={!codigoSync}
                  className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-40"
                >
                  📋 Copiar
                </button>
                <button
                  onClick={importarCodigo}
                  disabled={!codigoSync.trim()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  ⬆ Importar deste código
                </button>
              </div>
              <textarea
                value={codigoSync}
                onChange={(e) => setCodigoSync(e.target.value)}
                placeholder="Cole aqui o código vindo de outro dispositivo, ou gere um novo acima..."
                rows={5}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            </div>

            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <h2 className="mb-1 text-lg font-bold text-rose-700">⚠️ Zona de risco</h2>
              <p className="mb-4 text-sm text-rose-600">
                Apaga todos os lançamentos salvos neste dispositivo. Faça um backup antes!
              </p>
              <button
                onClick={limparTudo}
                className="rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
              >
                🗑️ Apagar todos os dados
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="py-6 text-center text-xs text-slate-400">
        Dados salvos automaticamente neste navegador.
      </footer>
    </div>
  );
}

function Card({ titulo, valor, cor, icone }: { titulo: string; valor: number; cor: string; icone: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">{titulo}</p>
        <span className="text-lg">{icone}</span>
      </div>
      <p className={`mt-1 text-2xl font-bold ${cor}`}>{valor}</p>
    </div>
  );
}

function Campo({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

// Lista suspensa com opção "Outro" que libera digitação manual
function SelectComOutro({
  opcoes,
  valor,
  onChange,
  placeholder,
}: {
  opcoes: string[];
  valor: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const ehLista = valor === "" || opcoes.includes(valor);
  return (
    <div className="space-y-2">
      <select
        value={ehLista ? valor : "__outro__"}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "__outro__" ? " " : v);
        }}
        className="input"
      >
        <option value="">Selecione...</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value="__outro__">Outro (digitar)</option>
      </select>
      {!ehLista && (
        <input
          type="text"
          value={valor.trimStart()}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input"
        />
      )}
    </div>
  );
}


