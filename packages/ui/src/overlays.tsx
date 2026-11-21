'use client';
/**
 * Floating layers in Gateline's look, on Base UI primitives (Rampline's kit): Popover, Sheet,
 * Tooltip, the toast host, and a "⋯" row-actions menu. Additions for Rampline; Gateline draws its
 * popovers inline and has no side sheet.
 *
 * The API matches shadcn's Base UI flavour (`render` instead of `asChild`, `side` / `align` on the
 * content), so an app on that kit can re-export these without touching a screen.
 */
import * as React from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { CircleAlert, CircleCheck, Download, Ellipsis, XIcon } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { cn } from './cn';
import { dialogClasses, popoverClasses, tooltipClasses } from './recipes';

/* ---------- Popover ---------- */

export function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverContent({
  className,
  align = 'center',
  alignOffset = 0,
  side = 'bottom',
  sideOffset = 6,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            popoverClasses.panel,
            'z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 p-3 text-sm outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="popover-header"
      className={cn('flex flex-col gap-0.5 text-sm', className)}
      {...props}
    />
  );
}

export function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn('text-xs font-bold tracking-wide text-muted uppercase', className)}
      {...props}
    />
  );
}

export function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn('text-muted', className)}
      {...props}
    />
  );
}

/* ---------- Sheet: a side panel; Gateline's dialog chrome on the edge of the screen ---------- */

export function Sheet(props: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

export function SheetTrigger(props: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

export function SheetClose(props: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

export function SheetPortal(props: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

export function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        dialogClasses.overlay,
        'transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0',
        className,
      )}
      {...props}
    />
  );
}

/** The round close button every Gateline dialog and sheet has, top right. */
export const closeButtonClasses =
  'grid size-9 cursor-pointer place-items-center rounded-full bg-surface text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700 [&_svg]:size-5';

export function SheetContent({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'fixed z-50 flex flex-col gap-4 border-line bg-card bg-clip-padding text-sm text-fg shadow-2xl transition duration-200 ease-out outline-none data-ending-style:opacity-0 data-starting-style:opacity-0',
          'data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:max-h-[88dvh] data-[side=bottom]:rounded-t-2xl data-[side=bottom]:border-t data-[side=bottom]:data-ending-style:translate-y-[2.5rem] data-[side=bottom]:data-starting-style:translate-y-[2.5rem]',
          'data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:data-ending-style:translate-x-[-2.5rem] data-[side=left]:data-starting-style:translate-x-[-2.5rem] data-[side=left]:sm:max-w-sm',
          'data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:data-ending-style:translate-x-[2.5rem] data-[side=right]:data-starting-style:translate-x-[2.5rem] data-[side=right]:sm:max-w-sm',
          'data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:data-ending-style:translate-y-[-2.5rem] data-[side=top]:data-starting-style:translate-y-[-2.5rem]',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className={cn(closeButtonClasses, 'absolute top-3.5 right-3.5')}
          >
            <XIcon aria-hidden />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

export function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-1 p-5 pr-14', className)}
      {...props}
    />
  );
}

export function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 border-t border-line p-5', className)}
      {...props}
    />
  );
}

export function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(dialogClasses.title, 'text-fg', className)}
      {...props}
    />
  );
}

export function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-sm text-muted', className)}
      {...props}
    />
  );
}

/* ---------- Tooltip ---------- */

export function TooltipProvider(props: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" {...props} />;
}

export function Tooltip(props: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

export function TooltipTrigger(props: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

export function TooltipContent({
  className,
  side = 'top',
  sideOffset = 6,
  ...props
}: TooltipPrimitive.Popup.Props & Pick<TooltipPrimitive.Positioner.Props, 'side' | 'sideOffset'>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} className="isolate z-50">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            tooltipClasses,
            // Rampline's tooltips carry glossary sentences, not one-word labels: medium weight.
            'z-50 max-w-72 origin-(--transform-origin) font-medium leading-snug outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

/* ---------- Toast host ---------- */

/**
 * Gateline's toast: a white card with a line border and a deep shadow, bottom right on a desktop
 * and above the tab bar on a phone. Icons carry the tone; the card stays white.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      offset={24}
      mobileOffset={{ bottom: 80 }}
      duration={5000}
      visibleToasts={2}
      icons={{
        success: <CircleCheck aria-hidden />,
        error: <CircleAlert aria-hidden />,
        info: <Download aria-hidden />,
      }}
      className="toaster group print:hidden"
      toastOptions={{
        classNames: {
          toast:
            'group-[.toaster]:rounded-xl group-[.toaster]:border-line group-[.toaster]:bg-card group-[.toaster]:p-3.5 group-[.toaster]:text-fg group-[.toaster]:shadow-2xl',
          title: 'group-[.toaster]:text-sm group-[.toaster]:font-semibold',
          description: 'group-[.toaster]:text-xs group-[.toaster]:text-muted',
          actionButton:
            'group-[.toaster]:rounded-lg group-[.toaster]:bg-brand-500 group-[.toaster]:font-semibold group-[.toaster]:text-white group-[.toaster]:hover:bg-brand-600',
          success: 'group-[.toaster]:[&_[data-icon]]:text-ok',
          error: 'group-[.toaster]:[&_[data-icon]]:text-bad',
          info: 'group-[.toaster]:[&_[data-icon]]:text-brand-600',
        },
      }}
      {...props}
    />
  );
}

/* ---------- Row actions: the "⋯" menu ---------- */

/**
 * Secondary row actions behind one "⋯" button, so a table row shows its primary link and nothing
 * else. Destructive items go last, after a `RowActionsSeparator`, with `tone="danger"`.
 */
export function RowActions({
  label = 'More actions',
  children,
  className,
  align = 'end',
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
  align?: MenuPrimitive.Positioner.Props['align'];
}) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger
        aria-label={label}
        title={label}
        className={cn(
          'inline-grid size-8 cursor-pointer place-items-center rounded-lg text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700 data-popup-open:bg-brand-50 data-popup-open:text-brand-700 [&_svg]:size-4',
          className,
        )}
      >
        <Ellipsis aria-hidden />
      </MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner align={align} sideOffset={4} className="isolate z-50">
          <MenuPrimitive.Popup
            className={cn(
              popoverClasses.panel,
              'min-w-48 origin-(--transform-origin) p-1.5 outline-hidden data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95',
            )}
          >
            {children}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

export function RowActionsItem({
  className,
  tone = 'default',
  ...props
}: MenuPrimitive.Item.Props & { tone?: 'default' | 'danger' }) {
  return (
    <MenuPrimitive.Item
      className={cn(
        popoverClasses.item,
        'outline-none data-highlighted:bg-brand-50 data-highlighted:text-brand-700 [&_svg]:size-3.5',
        tone === 'danger' &&
          'text-red-700 hover:bg-bad-soft hover:text-red-800 data-highlighted:bg-bad-soft data-highlighted:text-red-800',
        className,
      )}
      {...props}
    />
  );
}

export function RowActionsSeparator({ className }: { className?: string }) {
  return <MenuPrimitive.Separator className={cn(popoverClasses.separator, className)} />;
}
