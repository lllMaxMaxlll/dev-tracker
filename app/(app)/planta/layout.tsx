import { PlantaTabs } from "@/components/planta/planta-tabs"

/**
 * Planta junta lo que se mira poco: consumo, repositorios, proyectos y
 * ajustes. Cada pestaña es una ruta, así que los links y el botón de atrás
 * funcionan como siempre.
 */
export default function PlantaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <PlantaTabs />
      {children}
    </div>
  )
}
