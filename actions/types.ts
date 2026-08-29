/**
 * Resultado uniforme de todas las server actions.
 *
 * Los errores por campo viajan en `fieldErrors` para poder marcar el `Field`
 * correspondiente con `data-invalid`; `error` es el mensaje general que va al
 * toast.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

export function actionError(
  error: string,
  fieldErrors?: Record<string, string[]>
): ActionResult<never> {
  return { ok: false, error, fieldErrors }
}

export function actionOk(): ActionResult<void>
export function actionOk<T>(data: T): ActionResult<T>
export function actionOk<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data }
}
