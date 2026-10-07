/**
 * Per-schema configuration.
 * Add a row here ONLY when a schema genuinely needs different behaviour
 * from the safe default. Zero code changes are required for new schemas
 * that follow the standard table layout.
 */

interface SchemaConfig {
  /** Azure blob folder name used for photos and PDFs. Defaults to projectId/projectTextId. */
  blobFolder: string | null
}

const schemaConfigMap: Record<string, SchemaConfig> = {
  daikin: { blobFolder: 'daikin' },
}

const DEFAULT_CONFIG: SchemaConfig = { blobFolder: null }

export function getSchemaConfig(schemaName: string): SchemaConfig {
  return schemaConfigMap[schemaName] ?? DEFAULT_CONFIG
}
