import createClient from 'openapi-fetch';
import { t } from '../i18n';
import type { components, paths } from './schema';

// Tipos derivados del contrato OpenAPI (src/api/schema.d.ts se genera con `npm run gen:api`).
export type SourceSummary = components['schemas']['SourceSummary'];
export type StationsResponse = components['schemas']['StationsResponse'];
export type StationItem = components['schemas']['StationItem'];
export type StationState = components['schemas']['StationState'];
export type StationDetailResponse = components['schemas']['StationDetailResponse'];
export type StationVersionItem = components['schemas']['StationVersionItem'];
export type SourceKind = components['schemas']['SourceKind'];
export type InstantBasis = components['schemas']['InstantBasis'];
export type TimelineResponse = components['schemas']['TimelineResponse'];
export type TimelinePoint = components['schemas']['TimelinePoint'];
export type FramesResponse = components['schemas']['FramesResponse'];
export type StudyAreaItem = components['schemas']['StudyAreaItem'];
export type CoverageRequest = components['schemas']['CoverageRequest'];
export type CoverageResponse = components['schemas']['CoverageResponse'];
export type StationPatternResponse = components['schemas']['StationPatternResponse'];
export type PatternHour = components['schemas']['PatternHour'];
export type IngestionsResponse = components['schemas']['IngestionsResponse'];
export type IngestionItem = components['schemas']['IngestionItem'];

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
  const m = t().api;
  if (response?.status === 429) return new ApiError(m.tooMany, 429);
  // El detalle de la API va en castellano: es el de un error que no debería verse.
  const problem = (error ?? {}) as ProblemLike;
  const detail = problem.detail ?? problem.title;
  return new ApiError(
    detail ?? m.status(response?.status.toString() ?? m.noStatus),
    response?.status,
  );
}
