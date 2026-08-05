/**
 * POS design tokens — distilled from the Hilo Stitch design system.
 * Material 3-style palette + Manrope typography scale.
 *
 * These extend the existing C tokens in src/lib/designTokens.js without
 * replacing them — the rest of the app keeps the old C, the POS module
 * uses POS_T for the new visual language.
 */

export const POS_T = {
  // Surfaces (warm off-white family)
  background:                '#fbf9f5',
  surface:                   '#fbf9f5',
  surfaceContainerLowest:    '#ffffff',
  surfaceContainerLow:       '#f5f3f0',
  surfaceContainer:          '#efeeea',
  surfaceContainerHigh:      '#e9e8e4',
  surfaceContainerHighest:   '#e4e2df',
  surfaceVariant:            '#e4e2df',
  surfaceDim:                '#dbdad6',

  // Text
  onSurface:                 '#1b1c1a',
  onSurfaceVariant:          '#4d4636',
  onBackground:              '#1b1c1a',
  inverseSurface:            '#30312e',
  inverseOnSurface:          '#f2f1ed',

  // Borders / dividers
  outline:                   '#7f7663',
  outlineVariant:            '#d0c5b0',

  // Brand
  primary:                   '#745b00',  // dark gold (text on white)
  onPrimary:                 '#ffffff',
  primaryContainer:          '#c9a432',  // brand gold (filled buttons)
  onPrimaryContainer:        '#4c3b00',
  inversePrimary:            '#eac24e',

  // Secondary (purple — for accents / quotations)
  secondary:                 '#712ae2',
  onSecondary:               '#ffffff',
  secondaryContainer:        '#8a4cfc',
  onSecondaryContainer:      '#fffbff',

  // Tertiary (indigo — for links / online channel)
  tertiary:                  '#455aa6',
  onTertiary:                '#ffffff',
  tertiaryContainer:         '#90a4f6',
  onTertiaryContainer:       '#213782',

  // Status
  error:                     '#ba1a1a',
  onError:                   '#ffffff',
  errorContainer:            '#ffdad6',
  onErrorContainer:          '#93000a',
  success:                   '#16a34a',
  successContainer:          'rgba(22,163,74,0.12)',
  warning:                   '#d97706',
  warningContainer:          'rgba(217,119,6,0.12)',
}

// Type scale (px values, line-height + weight as inline styles)
export const POS_TYPE = {
  displayLg:        { fontSize: '48px', lineHeight: '1.1',  letterSpacing: '-0.02em', fontWeight: 600 },
  displayLgMobile:  { fontSize: '32px', lineHeight: '1.15', letterSpacing: '-0.01em', fontWeight: 600 },
  headlineLg:       { fontSize: '32px', lineHeight: '1.2',  letterSpacing: '-0.01em', fontWeight: 600 },
  headlineLgMobile: { fontSize: '24px', lineHeight: '1.2',  fontWeight: 600 },
  titleMd:          { fontSize: '20px', lineHeight: '1.4',  fontWeight: 500 },
  bodyLg:           { fontSize: '16px', lineHeight: '1.6',  fontWeight: 400 },
  bodySm:           { fontSize: '14px', lineHeight: '1.5',  fontWeight: 400 },
  button:           { fontSize: '14px', lineHeight: '1',    letterSpacing: '0.02em', fontWeight: 600 },
  labelCaps:        { fontSize: '12px', lineHeight: '1',    letterSpacing: '0.1em',  fontWeight: 700, textTransform: 'uppercase' },
}

/**
 * Material Symbols Outlined icon wrapper.
 * Usage: <MIcon name="add_shopping_cart" />, <MIcon name="receipt_long" fill />
 */
export const MIcon = ({ name, className = '', fill = false, weight = 400, size = 20, style = {} }) => (
  <span
    className={`material-symbols-outlined ${className}`}
    style={{
      fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' 24`,
      fontSize: size,
      lineHeight: 1,
      verticalAlign: 'middle',
      userSelect: 'none',
      ...style,
    }}
  >{name}</span>
)

// Convenience: shadow presets
export const POS_SHADOW = {
  card: '0 1px 2px rgba(0,0,0,0.04)',
  cardHover: '0 4px 12px rgba(0,0,0,0.08)',
  modal: '0 24px 60px rgba(0,0,0,0.18)',
}

// Radius presets
export const POS_R = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
}
