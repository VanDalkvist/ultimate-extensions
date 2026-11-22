export function errnoCode(error: unknown) {
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') return error.code
}

export const retriedLater = (_error: unknown): undefined => undefined

export const settled = (work: Promise<unknown>): Promise<void> => work.then(retriedLater, retriedLater)
