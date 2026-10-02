export type StatusLancamento = "falta" | "sobra" | "ok";

export type Categoria = "pereciveis" | "seca";

export interface Lancamento {
  id: string;
  data: string; // ISO yyyy-mm-dd
  hora?: string; // hora do recebimento HH:mm
  codigo: string;
  descricao: string;
  acondicionamento: string;
  unidadesPorAcond: number; // quantidade que vem dentro do acondicionamento (ex: caixa c/ 12)
  caixas: number; // quantidade de acondicionamentos previstos (ex: nº de caixas)
  recebido: number; // quantidade de UNIDADES realmente recebidas
  categoria: Categoria; // perecíveis (12h) ou carga seca (24h)
  conferente: string;
  colaboradorPP: string; // colaborador do departamento prevenção e perdas
  origem: string; // local de origem
  resolvido?: boolean; // problema resolvido?
  obs?: string;
}

// Prazo de resolução em horas conforme a categoria
export function prazoHoras(cat: Categoria): number {
  return cat === "pereciveis" ? 12 : 24;
}

// Retorna a data/hora limite para resolução do problema
export function limiteResolucao(l: Lancamento): Date {
  const [a, m, d] = l.data.split("-").map(Number);
  const [h, min] = (l.hora || "00:00").split(":").map(Number);
  const base = new Date(a, m - 1, d, h || 0, min || 0);
  base.setHours(base.getHours() + prazoHoras(l.categoria));
  return base;
}

// Status do prazo: 'ok' (resolvido), 'atrasado', 'no_prazo'
export function statusPrazo(l: Lancamento): "resolvido" | "atrasado" | "no_prazo" | "sem_problema" {
  if (diferenca(l) === 0) return "sem_problema";
  if (l.resolvido) return "resolvido";
  return new Date() > limiteResolucao(l) ? "atrasado" : "no_prazo";
}

// Cálculos derivados de um lançamento
export function previstoUnid(l: Lancamento): number {
  return l.caixas * (l.unidadesPorAcond || 1);
}

export function diferenca(l: Lancamento): number {
  // negativo = faltou, positivo = sobrou
  return l.recebido - previstoUnid(l);
}

export function statusDe(l: Lancamento): StatusLancamento {
  const d = diferenca(l);
  if (d < 0) return "falta";
  if (d > 0) return "sobra";
  return "ok";
}

export const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const ACONDICIONAMENTOS = [
  "Caixa",
  "Fardo",
  "Pacote",
  "Unidade",
  "Bandeja",
  "Saco",
  "Engradado",
];

export const ORIGENS = ["Campo Grande", "Vista Alegre", "CD Campos", "Curicica"];

export const CONFERENTES = ["Rafael", "Felipe", "Nicolas", "Sérgio"];

export const COLABORADORES_DPP = ["Samuel", "Plínio", "Jonathan"];
