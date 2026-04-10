import { IconLoader2 } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

function Spinner({ className, ...props }: React.ComponentProps<typeof IconLoader2>) {
  return (
    <IconLoader2
      aria-label="Loading"
      className={cn('animate-spin', className)}
      role="status"
      {...props}
    />
  )
}

export { Spinner }
