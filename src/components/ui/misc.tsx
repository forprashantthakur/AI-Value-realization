"use client";
import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";

export function Progress({ value, className, indicatorClassName, label }: { value: number; className?: string; indicatorClassName?: string; label?: string }) {
  return (
    <ProgressPrimitive.Root aria-label={label} value={Math.max(0, Math.min(100, value))} className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}>
      <ProgressPrimitive.Indicator className={cn("h-full bg-primary transition-all", indicatorClassName)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </ProgressPrimitive.Root>
  );
}

export const Switch = React.forwardRef<React.ElementRef<typeof SwitchPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  ),
);
Switch.displayName = "Switch";

export const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>>(
  ({ className, ...props }, ref) => (
    <SliderPrimitive.Root ref={ref} className={cn("relative flex w-full touch-none select-none items-center py-1", className)} {...props}>
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-primary bg-white shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = "Slider";

export function Separator({ className, orientation = "horizontal" }: { className?: string; orientation?: "horizontal" | "vertical" }) {
  return <SeparatorPrimitive.Root orientation={orientation} className={cn("shrink-0 bg-border", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)} />;
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-md text-xs text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
