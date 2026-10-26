import type { AiFeature } from "../../shared/types";

export interface Chip {
  label: string;
  /** Texto acrescentado ao campo de instruções. */
  text: string;
}

export const FEATURE_LABEL: Record<AiFeature, string> = {
  commitMessage: "Geração de mensagem de commit",
  explain: "Explicar alterações",
  stashMessage: "Mensagem de stash",
  pullRequest: "Título e descrição de Pull Request",
  conflict: "Resolução de conflitos",
};

export const GLOBAL_CHIPS: Chip[] = [
  { label: "Responder em <idioma>", text: "Responda em português do Brasil." },
  { label: "Respostas concisas", text: "Mantenha as respostas curtas e diretas." },
  { label: "Modo imperativo", text: "Use o modo imperativo." },
  { label: "Tom técnico", text: "Use um tom técnico e preciso." },
  { label: "Tom casual", text: "Use um tom casual e informal." },
];

export const FEATURE_CHIPS: Record<AiFeature, Chip[]> = {
  commitMessage: [
    {
      label: "Conventional Commits",
      text: "Formate a mensagem como Conventional Commits: tipo(escopo): descrição. Use os tipos feat, fix, docs, style, refactor, perf, test, build, ci e chore.",
    },
    { label: "Limite de 50 caracteres", text: "Mantenha o assunto com no máximo 50 caracteres." },
    { label: "Incluir número da issue", text: "Se o nome da branch ou os commits citarem o número de uma issue, inclua-o no assunto (ex.: #123)." },
    { label: "Sem corpo", text: "Escreva só o assunto, sem corpo." },
    { label: "Foco no o quê e porquê", text: "No corpo, explique o que mudou e por quê, não como." },
  ],
  explain: [
    { label: "Impacto no negócio", text: "Destaque o impacto da mudança para o negócio e para os usuários." },
    { label: "Em tópicos", text: "Organize a explicação em tópicos curtos." },
    { label: "Por componente", text: "Agrupe a explicação por componente ou módulo afetado." },
    { label: "Para iniciantes", text: "Explique de forma simples, para quem está começando no projeto." },
  ],
  stashMessage: [
    { label: "Contexto da tarefa", text: "Mencione a tarefa ou funcionalidade em andamento." },
    { label: "Verbos de ação", text: "Comece a mensagem com um verbo de ação." },
    { label: "Nome da branch", text: "Comece a mensagem com o nome da branch atual." },
  ],
  pullRequest: [
    { label: "Instruções de teste", text: "Inclua uma seção com passos para testar a mudança." },
    { label: "Capturas de tela", text: "Inclua uma seção para o autor anexar capturas de tela quando houver mudança visual." },
    { label: "Breaking changes", text: "Liste de forma destacada qualquer mudança que quebre compatibilidade." },
    { label: "Guia para revisores", text: "Indique por onde o revisor deve começar e o que merece mais atenção." },
  ],
  conflict: [
    { label: "Estratégia", text: "Prefira preservar o comportamento da branch atual quando os dois lados forem incompatíveis." },
    { label: "Considerar os dois lados", text: "Sempre que possível, combine as alterações dos dois lados em vez de descartar uma delas." },
    { label: "Linguagem simples", text: "Explique cada resolução em linguagem simples." },
  ],
};

/** Acrescenta `text` numa nova linha, sem passar de `max` caracteres (nesse caso devolve o campo como estava). */
export function appendInstruction(current: string, text: string, max: number): string {
  const base = current.trimEnd();
  const next = base === "" ? text : `${base}\n${text}`;
  return next.length > max ? current : next;
}
