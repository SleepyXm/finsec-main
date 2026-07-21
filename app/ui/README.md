# Finsec UI

This directory is the application's shared visual language. Application and
feature code should import from `@/app/UI` (or `@/app/UI/client` for
interactive primitives) instead of reaching into implementation files.

## Layers

- `tokens.ts` and `app/styles/tokens.css`: semantic colors, spacing, motion,
  typography, and surface values.
- `components/`: reusable visual primitives such as buttons, surfaces,
  decoration, and layout composition.
- `buttons/`: shared class-name recipes used where a component is not the
  right abstraction (for example, styled links).
- `controls/`, `data/`, and `animations/`: focused client-side UI.
- `styles.ts`: the compatibility layer for existing inline-style consumers.
  New UI should prefer a primitive or CSS Module.

## Styling rules

1. Put application-wide tokens and reset rules in `app/styles/`.
2. Put feature-only global selectors in `app/styles/features/`.
3. Put a primitive's custom styling next to it in a CSS Module.
4. Use Tailwind utilities for one-off layout composition.
5. Use semantic variables such as `--ui-text` and `--ui-border` instead of
   introducing another hard-coded palette value.
6. Add public primitives to `index.ts`; add hook-based primitives to
   `client.ts`.

## Example

```tsx
import { Button, Stack, Surface } from "@/app/UI";

export function Example() {
  return (
    <Surface variant="trader" decorated>
      <Stack gap="md">
        <p>Reusable content</p>
        <Button variant="secondary">Continue</Button>
      </Stack>
    </Surface>
  );
}
```
