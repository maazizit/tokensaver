/**
 * Shared type definitions for TokenSaver.
 */

export interface TokVizEvent {
  id: string;
  sessionId: string;
  agent: string;
  timestamp: string;
  source: string;
  toolName: string;
  command?: string;
  tokensRaw?: number;
  tokensOptimized?: number;
  tokensSaved?: number;
  raw?: number;
  optimized?: number;
  saved?: number;
  metadata?: Record<string, unknown> & { commandType?: string };
}
