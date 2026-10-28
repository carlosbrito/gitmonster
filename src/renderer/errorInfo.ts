export type ErrorKind = "sso-expired" | "auth" | "timeout" | "generic";

export interface ErrorInfo {
  kind: ErrorKind;
  title: string;
  message: string;
  /** Comando sugerido para resolver (ex.: renovar o SSO). */
  command?: string;
  /** Texto bruto do erro, sem cortes. */
  detail: string;
}

interface Rule {
  kind: Exclude<ErrorKind, "generic">;
  title: string;
  message: string;
  patterns: RegExp[];
}

/** Em ordem: a primeira que casar vence (SSO antes de credenciais, porque o traceback do SSO pode citar 403). */
const RULES: Rule[] = [
  {
    kind: "sso-expired",
    title: "Sessão SSO expirada",
    message: "Seu login AWS SSO expirou, por isso o Git não conseguiu acessar o remote. Renove o login no terminal e tente a operação de novo.",
    patterns: [
      /TokenRetrievalError/i,
      /UnauthorizedSSOTokenError/i,
      /Error when retrieving token from sso/i,
      /Token has expired and refresh failed/i,
      /SSO session[^\n]*expired/i,
    ],
  },
  {
    kind: "auth",
    title: "Credenciais recusadas",
    message: "O remote não aceitou as credenciais. Verifique seu login ou token de acesso.",
    patterns: [/Authentication failed/i, /could not read Username/i, /Permission denied \(publickey\)/i, /The requested URL returned error: 403/i],
  },
  {
    kind: "timeout",
    title: "Tempo limite excedido",
    message: "O remote demorou demais para responder. Verifique a conexão e tente de novo.",
    patterns: [/excedeu o tempo limite/i],
  },
];

const PROFILE_PATTERNS = [/--profile\s+['"]?([\w.-]+)/i, /AWS_PROFILE=['"]?([\w.-]+)/i, /profile\s+['"]([\w.-]+)['"]/i];

function awsProfile(raw: string): string | null {
  for (const pattern of PROFILE_PATTERNS) {
    const match = pattern.exec(raw);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** Traduz o texto bruto de um erro numa mensagem curta para o usuário; o texto original fica em `detail`. */
export function describeError(raw: string): ErrorInfo {
  const rule = RULES.find((r) => r.patterns.some((p) => p.test(raw)));
  if (!rule) {
    return {
      kind: "generic",
      title: "A operação falhou",
      message: "Não foi possível concluir a operação. Veja os detalhes para entender o que aconteceu.",
      detail: raw,
    };
  }
  const info: ErrorInfo = { kind: rule.kind, title: rule.title, message: rule.message, detail: raw };
  if (rule.kind === "sso-expired") {
    const profile = awsProfile(raw);
    info.command = profile ? `aws sso login --profile ${profile}` : "aws sso login";
  }
  return info;
}
