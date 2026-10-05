import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

// Tipos derivados del contrato OpenAPI (src/api/schema.d.ts se genera con `npm run gen:api`).
export type SourceSummary = components['schemas']['SourceSummary'];
export type StationsResponse = components['schemas']['StationsResponse'];
export type StationItem = components['schemas']['StationItem'];
export type StationState = components['schemas']['StationState'];
export type SourceKind = components['schemas']['SourceKind'];
export type InstantBasis = components['schemas']['InstantBasis'];

// Vacío en desarrollo: Vite reenvía /api a la API local. En producción, la URL pública de la API.
const baseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

// fetch se resuelve en cada petición (no al cargar el módulo) para poder sustituirlo en pruebas.
export const api = createClient<paths>({
  baseUrl,
  fetch: (request: Request) => globalThis.fetch(request),
});

/** Error de la API con un mensaje que se puede mostrar tal cual. */
export class ApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

interface ProblemLike {
  title?: string | null;
  detail?: string | null;
}

export function toApiError(error: unknown, response: Response | undefined): ApiError {
  const problem = (error ?? {}) as ProblemLike;
  const detail = problem.detail ?? problem.title;
  return new ApiError(
    detail ?? `La API respondió ${response?.status.toString() ?? 'sin estado'}.`,
    response?.status,
  );
}
