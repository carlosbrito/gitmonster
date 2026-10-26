import { AI_PROVIDERS, type AiProvider } from "../../shared/types";
import { createTokenStore, type SecretCrypto, type TokenIo } from "../GitHubAuth";

/** Chaves de IA têm formatos variados (sk-ant-..., sk-..., AIza...): só exige texto visível, sem espaços. */
export function validateAiKey(key: string): string {
  const clean = key.trim();
  if (clean.length < 1 || clean.length > 512 || !/^[\x21-\x7e]+$/.test(clean)) {
    throw new Error("Chave inválida. Cole a chave da API do provedor, sem espaços nem quebras de linha.");
  }
  return clean;
}

export function assertAiProvider(provider: string): AiProvider {
  if (!(AI_PROVIDERS as readonly string[]).includes(provider)) throw new Error("Provedor de IA inválido.");
  return provider as AiProvider;
}

/** Uma chave por provedor, cada uma no seu arquivo e só criptografada (nunca em texto puro). */
export function createAiKeyStore(dir: string, crypto: SecretCrypto, io: TokenIo, join: (...parts: string[]) => string) {
  const stores = new Map<AiProvider, ReturnType<typeof createTokenStore>>();
  const storeFor = (provider: AiProvider) => {
    const safe = assertAiProvider(provider);
    let store = stores.get(safe);
    if (!store) {
      store = createTokenStore(join(dir, `ai-key-${safe}.json`), crypto, io, validateAiKey);
      stores.set(safe, store);
    }
    return store;
  };

  return {
    secureStorageAvailable: () => crypto.isAvailable(),
    save: async (provider: AiProvider, key: string) => storeFor(provider).save(key),
    /** A chave, ou null. Só o main chama isto; o renderer nunca recebe o valor. */
    load: async (provider: AiProvider) => storeFor(provider).load(),
    clear: async (provider: AiProvider) => storeFor(provider).clear(),
    async hasKey(provider: AiProvider): Promise<boolean> {
      return (await storeFor(provider).load()) !== null;
    },
  };
}

export type AiKeyStore = ReturnType<typeof createAiKeyStore>;
