import { buildSchemaStatements } from './schema.js';

export function createInitialMigration({ id = '20260703_001_initial_ai_storage' } = {}) {
  return {
    id,
    description: 'Initialize AI storage tables, pgvector extension, and indexes.',
    statements: buildSchemaStatements(),
  };
}

export function listMigrations() {
  return [createInitialMigration()];
}
