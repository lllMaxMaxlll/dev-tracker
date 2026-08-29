import { NextResponse } from "next/server"

import { conDb } from "@/lib/db"
import { requireUser } from "@/lib/auth/require-user"
import {
  generarResumenEnStream,
  prepararResumenSemanal,
} from "@/lib/ai/tasks/summary"
import { esErrorIA } from "@/lib/ai/errors"

/**
 * Resumen semanal en streaming.
 *
 * Va por un route handler y no por una server action porque las acciones
 * devuelven un valor, no un stream: para que el texto se vea aparecer hace
 * falta una respuesta que fluya.
 *
 * Esta ruta NO está exceptuada en el proxy a propósito: exige sesión como
 * cualquier página.
 */
export async function POST() {
  const user = await requireUser()

  // Las consultas van ANTES de abrir la respuesta: una vez que el texto
  // empezó a fluir ya no se puede devolver un error legible.
  const preparado = await conDb(() =>
    prepararResumenSemanal({ userId: user.id, forzar: true })
  )

  if (!preparado.listo) {
    return NextResponse.json(
      { generado: false, motivo: preparado.motivo },
      { status: 409 }
    )
  }

  try {
    const stream = await generarResumenEnStream({
      userId: user.id,
      preparado,
    })

    return new Response(stream, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        // Sin buffering intermedio: si no, el texto llegaría todo junto al
        // final y el streaming no serviría de nada.
        "cache-control": "no-store, no-transform",
        "x-accel-buffering": "no",
      },
    })
  } catch (error) {
    console.error("[resumen/stream]", error)

    return NextResponse.json(
      {
        generado: false,
        motivo: esErrorIA(error)
          ? error.message
          : "No se pudo generar el resumen",
      },
      { status: 500 }
    )
  }
}
