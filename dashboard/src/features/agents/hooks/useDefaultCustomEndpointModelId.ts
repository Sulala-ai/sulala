import { useEffect, useState } from "react"
import { api } from "@/lib/api"
import { DEFAULT_CUSTOM_ENDPOINT_MODEL_ID } from "../ai-providers"

/** Model id for the user-configured OpenAI-compatible API (`custom/...`), from Settings → default model name. */
export function useDefaultCustomEndpointModelId(): string {
  const [id, setId] = useState(DEFAULT_CUSTOM_ENDPOINT_MODEL_ID)
  useEffect(() => {
    api
      .getSettings()
      .then((r) => {
        const seg = r.custom_openai_default_model?.trim()
        setId(seg ? `custom/${seg}` : DEFAULT_CUSTOM_ENDPOINT_MODEL_ID)
      })
      .catch(() => {})
  }, [])
  return id
}
