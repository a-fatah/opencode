import type { IssueWatchersSourcesOutput } from "@opencode-ai/client-next"

export type IntegrationSource = IssueWatchersSourcesOutput[number]
export type KeyMethod = Extract<IntegrationSource["integration"]["methods"][number], { type: "key" }>
export type KeyPrompt = NonNullable<KeyMethod["prompts"]>[number]

export function visiblePrompts(method: KeyMethod, inputs: Record<string, string>) {
  return (method.prompts ?? []).filter((prompt) => {
    if (!prompt.when) return true
    const matches = inputs[prompt.when.key] === prompt.when.value
    return prompt.when.op === "eq" ? matches : !matches
  })
}

export function tenantPromptKey(method: KeyMethod | undefined, tenantIdentity: string | undefined) {
  if (!method || !tenantIdentity) return
  const candidates = (method.prompts ?? []).filter((prompt) => prompt.type === "text")
  if (candidates.length === 1) return candidates[0].key
  return candidates
    .map((prompt) => ({
      key: prompt.key,
      score: [prompt.key, prompt.message, prompt.placeholder ?? ""].join(" ").match(/tenant|site|workspace|host|domain|url/gi)
        ?.length ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .find((item) => item.score > 0)?.key
}

export function valuesFingerprint(key: string, inputs: Record<string, string>) {
  return JSON.stringify([key, Object.entries(inputs).sort(([a], [b]) => a.localeCompare(b))])
}
