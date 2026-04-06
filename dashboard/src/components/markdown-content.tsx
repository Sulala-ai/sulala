import ReactMarkdown from "react-markdown"
import { parseDSL } from "@markdown-ui/mdui-lang"
import {
  ButtonGroup,
  Chart,
  Form,
  MultipleChoiceQuestion,
  Quiz,
  Select,
  SelectMulti,
  ShortAnswerQuestion,
  Slider,
  TextInput,
} from "@markdown-ui/react"
import "@markdown-ui/react/widgets.css"

const linkClass = "text-primary underline underline-offset-2 hover:opacity-80"
const proseClass =
  "break-words [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:opacity-80 [&_img]:max-w-full [&_img]:rounded [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WIDGET_COMPONENTS: Record<string, React.FC<any>> = {
  "button-group": ButtonGroup,
  "chart-line": Chart,
  "chart-bar": Chart,
  "chart-pie": Chart,
  "chart-scatter": Chart,
  form: Form,
  "multiple-choice-question": MultipleChoiceQuestion,
  quiz: Quiz,
  select: Select,
  "select-multi": SelectMulti,
  "short-answer-question": ShortAnswerQuestion,
  slider: Slider,
  "text-input": TextInput,
}

interface MarkdownUIWidgetProps {
  rawContent: string
  onWidgetEvent?: (id: string, value: unknown) => void
}

function MarkdownUIWidget({ rawContent, onWidgetEvent }: MarkdownUIWidgetProps) {
  const text = rawContent.trim()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let widgetData: Record<string, any> | null = null

  try {
    widgetData = JSON.parse(text)
  } catch {
    const result = parseDSL(text)
    if (result.success && result.widget) {
      widgetData = result.widget
    }
  }

  if (!widgetData) {
    return (
      <pre className="overflow-x-auto rounded bg-muted p-2 my-2 text-sm">
        <code>{rawContent}</code>
      </pre>
    )
  }

  const WidgetComponent = WIDGET_COMPONENTS[widgetData.type]

  if (!WidgetComponent) {
    return (
      <pre className="overflow-x-auto rounded bg-muted p-2 my-2 text-sm">
        <code>{rawContent}</code>
      </pre>
    )
  }

  const { type: _type, ...props } = widgetData

  return (
    <div className="my-2">
      <WidgetComponent
        {...props}
        onchange={(value: unknown) => {
          onWidgetEvent?.(widgetData!.id ?? "", value)
        }}
      />
    </div>
  )
}

interface MarkdownContentProps {
  content: string
  className?: string
  onWidgetEvent?: (id: string, value: unknown) => void
}

export function MarkdownContent({ content, className = "", onWidgetEvent }: MarkdownContentProps) {
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
          // Suppress the outer <pre> so code blocks can render their own wrapper
          pre: ({ children }) => <>{children}</>,
          code: ({ className: cls, children }) => {
            const language = cls?.replace("language-", "") ?? ""
            const text = String(children)

            if (language === "markdown-ui-widget") {
              return <MarkdownUIWidget rawContent={text} onWidgetEvent={onWidgetEvent} />
            }

            if (cls?.startsWith("language-")) {
              return (
                <pre className="overflow-x-auto rounded bg-muted p-2 my-2 text-sm">
                  <code className={cls}>{children}</code>
                </pre>
              )
            }

            // Inline code
            return <code className="rounded bg-muted px-1 py-0.5 text-sm">{children}</code>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
