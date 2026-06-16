/**
 * Schema validation utilities for TokenSaver.
 * Validates TokViz event data without external dependencies.
 */

import type { TokVizEvent } from "./types";

/**
 * Check if a value is a valid TokVizEvent.
 */
export function isValidTokVizEvent(obj: unknown): obj is TokVizEvent {
  if (!obj || typeof obj !== "object") return false;
  
  const event = obj as Record<string, unknown>;
  
  // Required fields
  if (typeof event.timestamp !== "string") return false;
  if (typeof event.agent !== "string") return false;
  
  // Optional but typed fields
  if (event.tokensRaw !== undefined && typeof event.tokensRaw !== "number") return false;
  if (event.tokensOptimized !== undefined && typeof event.tokensOptimized !== "number") return false;
  if (event.tokensSaved !== undefined && typeof event.tokensSaved !== "number") return false;
  if (event.raw !== undefined && typeof event.raw !== "number") return false;
  if (event.optimized !== undefined && typeof event.optimized !== "number") return false;
  if (event.saved !== undefined && typeof event.saved !== "number") return false;
  
  return true;
}

/**
 * Validate and filter an array of events, removing invalid entries.
 * Returns only valid events with a warning for invalid ones.
 */
export function validateEvents(events: unknown[]): TokVizEvent[] {
  const valid: TokVizEvent[] = [];
  let invalidCount = 0;
  
  for (const event of events) {
    if (isValidTokVizEvent(event)) {
      valid.push(event);
    } else {
      invalidCount++;
    }
  }
  
  if (invalidCount > 0) {
    console.warn(`TokenSaver: Filtered out ${invalidCount} invalid event(s) from events.json`);
  }
  
  return valid;
}

/**
 * Validate events.json structure.
 * Returns validated events or empty array if invalid.
 */
export function validateEventsFile(data: unknown): TokVizEvent[] {
  // Handle both array and object with events property
  let rawEvents: unknown;
  
  if (Array.isArray(data)) {
    rawEvents = data;
  } else if (data && typeof data === "object" && "events" in data) {
    rawEvents = (data as Record<string, unknown>).events;
  } else {
    console.warn("TokenSaver: events.json has unexpected format, expected array or {events: [...]}");
    return [];
  }
  
  if (!Array.isArray(rawEvents)) {
    console.warn("TokenSaver: events data is not an array");
    return [];
  }
  
  return validateEvents(rawEvents);
}
