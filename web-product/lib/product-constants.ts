export const PRODUCT_CATALOG = {
  savings_account: {
    name: "Poupança",
    rate: "70% CDI",
    term: "Sem vencimento",
    cdi: 0.70,
    badge: null,
  },
  term_deposit_6m: {
    name: "CDB 6 meses",
    rate: "105% CDI",
    term: "6 meses",
    cdi: 1.05,
    badge: "Popular",
  },
  term_deposit_12m: {
    name: "CDB 12 meses",
    rate: "112% CDI",
    term: "12 meses",
    cdi: 1.12,
    badge: "Recomendado",
  },
  personal_loan: {
    name: "Empréstimo",
    rate: "1,9% a.m.",
    term: "24 meses",
    cdi: null,
    badge: null,
  },
  premium_savings: {
    name: "Poupança Premium",
    rate: "95% CDI",
    term: "Sem vencimento",
    cdi: 0.95,
    badge: "Premium",
  },
} as const;

export type ArmKey = keyof typeof PRODUCT_CATALOG;
