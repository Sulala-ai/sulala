export type ConfigFormState = Record<string, Record<string, string>>

export type ConfiguredKeysState = Record<string, string[]>

export type SchemaProperty = { title?: string; description?: string; format?: string; secret?: boolean }
