import ReactMarkdown from "react-markdown"

const linkClass = "text-primary underline underline-offset-2 hover:opacity-80"
const proseClass = "break-words [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:opacity-80 [&_img]:max-w-full [&_img]:rounded [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-2 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"

export function MarkdownContent({ content, className = "" }: { content: string; className?: string }) {
  return (
    <div className={`${proseClass} ${className}`}>
      <ReactMarkdown
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            <img src={src} alt={alt ?? ""} className="max-w-full rounded" loading="lazy" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
