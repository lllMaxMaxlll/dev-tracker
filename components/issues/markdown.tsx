import ReactMarkdown from "react-markdown"

/**
 * react-markdown NO renderiza HTML crudo salvo que se le agregue `rehype-raw`,
 * así que el contenido queda sanitizado sin dependencias extra. No lo agregues
 * sin sanitizar primero.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  )
}
