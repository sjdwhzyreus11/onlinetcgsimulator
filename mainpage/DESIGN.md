---
name: Modernist Card Simulator
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f4'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#40484e'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f0f1f1'
  outline: '#70787e'
  outline-variant: '#c0c7ce'
  surface-tint: '#176589'
  primary: '#176589'
  on-primary: '#ffffff'
  primary-container: '#70b1d9'
  on-primary-container: '#00435f'
  inverse-primary: '#8dcef7'
  secondary: '#5a5e6a'
  on-secondary: '#ffffff'
  secondary-container: '#dfe2f0'
  on-secondary-container: '#606470'
  tertiary: '#ba1830'
  on-tertiary: '#ffffff'
  tertiary-container: '#ff8587'
  on-tertiary-container: '#82001a'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c6e7ff'
  primary-fixed-dim: '#8dcef7'
  on-primary-fixed: '#001e2d'
  on-primary-fixed-variant: '#004c6b'
  secondary-fixed: '#dfe2f0'
  secondary-fixed-dim: '#c3c6d4'
  on-secondary-fixed: '#171b25'
  on-secondary-fixed-variant: '#434752'
  tertiary-fixed: '#ffdad9'
  tertiary-fixed-dim: '#ffb3b2'
  on-tertiary-fixed: '#410008'
  on-tertiary-fixed-variant: '#92001f'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  body-base:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-padding: 32px
  card-gap: 16px
  section-margin: 48px
  gutter: 24px
---

## Brand & Style

The design system is anchored in **Modernist Minimalism**, prioritizing functional clarity and high-end aesthetic restraint. It treats the online card game not as a cluttered toy, but as a digital gallery where the card art and gameplay mechanics are the focal points. 

The personality is professional, serene, and uncluttered. By utilizing generous whitespace and a "less is more" philosophy, the design system removes the cognitive load typically associated with complex TCG interfaces. The emotional response is one of calm focus, allowing players to engage in strategic depth without visual distraction. The aesthetic avoids the loud, textured skeuomorphism of traditional card games in favor of a clean, architectural interface that feels like a premium productivity tool repurposed for play.

## Colors

The palette is defined by a "High-Key" approach, where **clean white (#FFFFFF)** serves as the dominant canvas. This creates an expansive, airy feel that makes any colored element—specifically the game cards—pop with intentionality.

- **Primary:** A soft, desaturated light blue (#70B1D9) is used for primary actions, highlighting active states, and interactive flourishes. It is calming rather than aggressive.
- **Secondary/Text:** A deep, professional slate (#1D212B) provides high-contrast legibility for typography and structural icons.
- **Tertiary:** A refined red (#DC3545) is reserved strictly for destructive actions, alerts, or life-total warnings, maintaining the minimalist balance.
- **Neutral:** Pure white backgrounds are augmented by very light grey borders to define zones without breaking the minimalist aesthetic.

## Typography

This design system utilizes **Inter** exclusively to achieve a systematic, utilitarian appearance. The typographic hierarchy is steep, using significant weight differences to guide the eye.

Headlines are tight and bold, creating a sense of authority. Body text is optimized for readability with open line-heights, ensuring that card effects and rules are easily digestible. Labels utilize a slightly increased letter spacing and uppercase styling to differentiate metadata (like card types or phases) from narrative text. The focus is on a "Swiss style" layout where alignment and whitespace do the work that color or decoration would do in other systems.

## Layout & Spacing

The layout follows a **fixed-grid philosophy** for the central "Playmat" area to ensure tactical consistency, while the surrounding interface (deck builder, menus) utilizes a fluid grid with generous margins. 

A strict 8px base unit governs all dimensions. The design system mandates "Generous Whitespace"; elements should never feel crowded. The play area should feel like an open table, with significant padding (32px+) between the player's hand and the battlefield. Components are grouped logically with consistent gutters of 24px, ensuring the interface remains breathable even during complex game states.

## Elevation & Depth

To maintain the minimalist aesthetic while providing necessary depth, the design system employs **Ambient Shadows** and **Tonal Layering**. 

Depth is subtle rather than dramatic. Surfaces use extremely soft, large-radius shadows (e.g., 20px blur, 4% opacity) to suggest that cards are hovering slightly above the white tabletop. When a card is "picked up" or hovered over, the shadow increases in spread and opacity slightly to provide tactile feedback. Low-contrast, 1px light-grey outlines are used to define zones (like the Graveyard or Deck) instead of heavy shadows or dark fills, keeping the UI feeling light and "paper-thin."

## Shapes

The design system uses a **Rounded (Level 2)** shape language. This softens the modernist "coldness" and makes the interface feel approachable and premium.

- Standard UI components (buttons, input fields) use a 0.5rem (8px) corner radius.
- Cards and larger containers use a 1rem (16px) radius to emphasize their physical presence in the game world.
- Interactive elements like "Chips" or "Phase Indicators" may transition to pill-shapes to distinguish them from structural containers.

## Components

### Buttons
Primary buttons are solid soft-blue with white text, utilizing a gentle transition on hover. Secondary buttons use a ghost style (light blue outline) to maintain the minimalist weight.

### Cards
Cards are the hero component. They feature a 1px neutral border, 16px corner radius, and an ambient shadow. The information on the card (cost, power, text) is laid out using the Inter typeface with strict alignment, eschewing ornate frames for clean, data-driven layouts.

### Chips & Badges
Used for card tags (e.g., "Creature," "Spell"). These are small, pill-shaped elements with a light grey background and dark text to remain unobtrusive.

### Input Fields
Inputs are minimalist: a simple 1px border that turns soft-blue on focus. Backgrounds are pure white to blend into the container.

### Play Zones
Defined by "Ghost Borders"—1px dashed or solid light-grey lines. These zones (Hand, Battlefield, Deck) provide structure without adding visual bulk.

### Modals & Dialogs
Centered with a heavy backdrop blur (Glassmorphism) to keep the player's context visible while focusing on the task at hand. They use the `rounded-xl` (1.5rem) radius for a modern, soft appearance.