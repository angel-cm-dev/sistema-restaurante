import type { ZodError } from 'zod';
import { ApiError } from './api';

/** Convierte los errores de zod en { campo: mensaje } (solo el primer mensaje por campo). */
export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Mezcla los errores por campo que devuelve el backend (400) con los del formulario. */
export function serverFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(error.fieldErrors.map((e) => [e.field, e.message]));
}
