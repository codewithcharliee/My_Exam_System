import { cn } from '@/lib/utils'

export function PageHeader({
  title, description, actions, className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-3 pb-6 border-b sm:flex-row sm:items-start sm:justify-between sm:gap-4', className)}>
      <div className="min-w-0">
        <h1 className="break-words font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 break-words text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>
      )}
    </div>
  )
}
